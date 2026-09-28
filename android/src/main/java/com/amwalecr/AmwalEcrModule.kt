package com.amwalecr

import com.amwalpay.ecr.EcrConfig
import com.amwalpay.ecr.EcrEnvironment
import com.amwalpay.ecr.EcrLink
import com.amwalpay.ecr.EcrLogger
import com.amwalpay.ecr.EcrOpenedSession
import com.amwalpay.ecr.EcrSessions
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import java.math.BigDecimal
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@ReactModule(name = AmwalEcrModule.NAME)
class AmwalEcrModule(reactContext: ReactApplicationContext) :
  NativeAmwalEcrSpec(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val running = ConcurrentHashMap<String, RunningOperation>()
  private val paymentAppResults = PaymentAppResults()

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addActivityEventListener(paymentAppResults)
  }

  override fun isReachable(request: ReadableMap, promise: Promise) {
    val call = parse(request, promise) ?: return
    // Web Service has no pre-flight probe. Wi-Fi, USB, and app to app do.
    if (call.isWebService || !call.isSupportedTransport) {
      promise.resolve(false)
      return
    }
    scope.launch {
      try {
        promise.resolve(call.session.probeReachability()?.reachable == true)
      } catch (error: IllegalArgumentException) {
        promise.reject(ECR_INVALID_ARGUMENT, error.message ?: "Invalid ECR arguments", error)
      } catch (error: Exception) {
        promise.reject(ECR_INTERNAL, error.message ?: "Reachability probe failed", error)
      }
    }
  }

  override fun sale(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      EcrMapping.result(
        call.session.sale(
          amount = call.requiredAmount(),
          merchantReference = call.merchantReferenceId,
        ),
      )
    }
  }

  override fun voidTransaction(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      EcrMapping.result(
        call.session.void(
          receiptNumber = call.requiredReceiptNumber("A void"),
          originalTerminalId = call.originalTerminalId,
          merchantReference = call.merchantReferenceId,
        ),
      )
    }
  }

  override fun refund(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      EcrMapping.result(
        call.session.refund(
          amount = call.requiredAmount(),
          receiptNumber = call.requiredReceiptNumber("A refund"),
          transactionDate = call.transactionDate,
          originalTerminalId = call.originalTerminalId,
          merchantReference = call.merchantReferenceId,
        ),
      )
    }
  }

  override fun inquire(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      EcrMapping.inquiry(
        call.session.inquire(
          receiptNumber = call.requiredReceiptNumber("An inquiry"),
          transactionDate = call.transactionDate,
          originalTerminalId = call.originalTerminalId,
        ),
      )
    }
  }

  override fun inquireByReference(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      EcrMapping.inquiry(
        call.session.inquireByReference(
          originalReference = call.requiredOriginalReference(),
          transactionDate = call.transactionDate,
          originalTerminalId = call.originalTerminalId,
          merchantReference = call.merchantReferenceId,
        ),
      )
    }
  }

  override fun signOn(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      if (!call.supportsSignOn) {
        EcrMapping.failedResult(
          merchantReferenceId = call.merchantReferenceId,
          kind = EcrMapping.UNSUPPORTED,
          message = "Sign-on is only supported over Wi-Fi and USB cable. " +
            "Transport '${call.transport}' was not asked.",
        )
      } else {
        EcrMapping.signOn(call.session.signOn(call.merchantReferenceId))
      }
    }
  }

  override fun closeReceipt(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      if (!call.supportsSignOn) {
        EcrMapping.failedResult(
          merchantReferenceId = call.merchantReferenceId,
          kind = EcrMapping.UNSUPPORTED,
          message = "Closing the receipt is only supported over Wi-Fi and USB cable.",
        )
      } else {
        EcrMapping.receiptClosed(call.session.closeReceipt(call.merchantReferenceId))
      }
    }
  }

  override fun receipt(request: ReadableMap, promise: Promise) {
    run(request, promise) { call ->
      EcrMapping.receipt(
        call.session.receipt(
          receiptNumber = call.requiredReceiptNumber("A receipt"),
          transactionDate = call.transactionDate,
          originalTerminalId = call.originalTerminalId,
        ),
      )
    }
  }

  override fun cancel(operationId: String, promise: Promise) {
    val operation = running.remove(operationId)
    if (operation == null) {
      promise.resolve(false)
      return
    }

    operation.reply.resolve(
      EcrMapping.failedResult(
        merchantReferenceId = operation.merchantReferenceId,
        kind = EcrMapping.CANCELLED,
        message = CANCELLED_MESSAGE,
      ),
    )
    operation.job.cancel()
    promise.resolve(true)
  }

  override fun invalidate() {
    running.values.forEach { operation ->
      operation.reply.resolve(
        EcrMapping.failedResult(
          merchantReferenceId = operation.merchantReferenceId,
          kind = EcrMapping.CANCELLED,
          message = "The React Native host was invalidated while the terminal had the request. " +
            "The transaction may still have completed — inquire before retrying.",
        ),
      )
      operation.job.cancel()
    }
    running.clear()
    reactApplicationContext.removeActivityEventListener(paymentAppResults)
    scope.cancel()
    super.invalidate()
  }

  private fun run(
    request: ReadableMap,
    promise: Promise,
    block: suspend (Call) -> Any,
  ) {
    val call = parse(request, promise) ?: return
    val reply = OneShotPromise(promise)

    if (!call.isSupportedTransport) {
      reply.resolve(
        EcrMapping.failedResult(
          merchantReferenceId = "",
          kind = EcrMapping.UNSUPPORTED,
          message = "This library drives a terminal over Wi-Fi, USB cable, Web Service, " +
            "or the Amwal payment app on this device. Transport '${call.transport}' " +
            "is not handled, so nothing was sent.",
        ),
      )
      return
    }

    lateinit var operation: RunningOperation
    val job = scope.launch(start = CoroutineStart.LAZY) {
      try {
        reply.resolve(block(call))
      } catch (error: IllegalArgumentException) {
        reply.reject(ECR_INVALID_ARGUMENT, error.message ?: "Invalid ECR arguments", error)
      } catch (error: Exception) {
        reply.reject(ECR_INTERNAL, error.message ?: "Native ECR operation failed", error)
      } finally {
        running.remove(call.operationId, operation)
      }
    }
    operation = RunningOperation(job, reply, call.merchantReferenceId)

    if (running.putIfAbsent(call.operationId, operation) != null) {
      reply.reject(
        ECR_INVALID_ARGUMENT,
        "operationId '${call.operationId}' is already running",
        null,
      )
      return
    }
    job.start()
  }

  private fun parse(request: ReadableMap, promise: Promise): Call? = try {
    Call(request)
  } catch (error: IllegalArgumentException) {
    promise.reject(ECR_INVALID_ARGUMENT, error.message ?: "Invalid ECR arguments", error)
    null
  } catch (error: Exception) {
    promise.reject(ECR_INTERNAL, error.message ?: "Could not read ECR arguments", error)
    null
  }

  private data class RunningOperation(
    val job: Job,
    val reply: OneShotPromise,
    val merchantReferenceId: String,
  )

  private class OneShotPromise(private val promise: Promise) {
    private val answered = AtomicBoolean(false)

    fun resolve(value: Any?) {
      if (answered.compareAndSet(false, true)) promise.resolve(value)
    }

    fun reject(code: String, message: String, error: Throwable?) {
      if (answered.compareAndSet(false, true)) promise.reject(code, message, error)
    }
  }

  private inner class Call(private val raw: ReadableMap) {
    val operationId = raw.requiredString("operationId")
    val host = raw.optionalString("host")
    val serialNumber = raw.optionalString("serialNumber")
    val transport = raw.optionalString("transport").ifEmpty { "wifi" }
    val transactionDate = raw.optionalString("transactionDate")
    val originalTerminalId = raw.optionalString("originalTerminalId")
    val merchantReferenceId = raw.optionalString("merchantReferenceId")
    private val config = raw.config()

    val isIpTransport get() = transport == "wifi" || transport == "ethernet"
    val isWebService get() = transport == "webService" || transport == "web_service"
    val isUsbCable get() = transport == "usbCable" || transport == "usb_cable"
    val isAppToApp get() = transport == "appToApp" || transport == "app_to_app"
    val supportsSignOn get() = isIpTransport || isUsbCable
    val isSupportedTransport get() = isIpTransport || isWebService || isUsbCable || isAppToApp

    /**
     * The SDK session for this call's transport. Built lazily so an
     * unsupported transport is answered as a typed failure before any
     * session exists.
     */
    val session: EcrOpenedSession by lazy {
      val link = when {
        isWebService -> EcrLink.WebService(
          merchantId = config.merchantId,
          terminalId = config.terminalId,
        )
        isUsbCable -> EcrLink.UsbCable
        isAppToApp -> EcrLink.PaymentApp
        else -> EcrLink.Lan(host = host, port = config.port)
      }
      // App to app must not auto-inquire: the inquiry is another handover
      // that puts the payment app back on screen after the operator left it.
      val sessionConfig = if (isAppToApp) {
        config.copy(autoInquireOnFailure = false)
      } else {
        config
      }
      val plan = EcrSessions.plan(link = link, config = sessionConfig)
      require(plan.isReady) { plan.issues.joinToString("; ") }
      EcrSessions.open(
        terminalSerial = serialNumber,
        plan = plan,
        usbChannel = if (isUsbCable) {
          { UsbAccessoryEcrChannel(reactApplicationContext) }
        } else {
          null
        },
        paymentAppChannel = if (isAppToApp) {
          {
            PaymentAppEcrChannel(
              packageName = PaymentAppEcrChannel.PACKAGE_NAME,
              activities = { reactApplicationContext.currentActivity },
              results = paymentAppResults,
            )
          }
        } else {
          null
        },
        logger = EcrLogger.None,
      )
    }

    fun requiredAmount(): BigDecimal {
      val text = raw.requiredString("amount")
      return try {
        BigDecimal(text)
      } catch (error: NumberFormatException) {
        throw IllegalArgumentException("'$text' is not a decimal amount", error)
      }
    }

    fun requiredReceiptNumber(operation: String): String =
      raw.optionalString("receiptNumber").ifBlank {
        throw IllegalArgumentException("$operation needs the original receipt number")
      }

    fun requiredOriginalReference(): String =
      raw.optionalString("originalMerchantReference").ifBlank {
        throw IllegalArgumentException("An inquiry by reference needs the original reference")
      }
  }

  companion object {
    const val NAME = NativeAmwalEcrSpec.NAME
    private const val ECR_INVALID_ARGUMENT = "ECR_INVALID_ARGUMENT"
    private const val ECR_INTERNAL = "ECR_INTERNAL"
    private const val CANCELLED_MESSAGE =
      "The caller cancelled while the terminal had the request. " +
        "The transaction may still have completed — inquire before retrying."
  }
}

private fun ReadableMap.requiredString(key: String): String {
  val value = optionalString(key).trim()
  require(value.isNotEmpty()) { "'$key' is required and was missing" }
  return value
}

private fun ReadableMap.optionalString(key: String): String =
  if (hasKey(key) && !isNull(key)) getString(key).orEmpty() else ""

private fun ReadableMap.config(): EcrConfig {
  val source = if (hasKey("config") && !isNull("config")) getMap("config") else null
  if (source == null) return EcrConfig()

  return EcrConfig(
    ecrId = source.optionalString("ecrId").ifEmpty { "ECR01" },
    currencyCode = source.optionalString("currencyCode").ifEmpty { "512" },
    minorUnitDigits = if (source.hasKey("minorUnitDigits")) source.getInt("minorUnitDigits") else 3,
    port = if (source.hasKey("port")) source.getInt("port") else EcrConfig.DEFAULT_PORT,
    connectTimeout = (if (source.hasKey("connectTimeoutMs")) source.getDouble("connectTimeoutMs").toLong() else 10_000L).milliseconds,
    responseTimeout = (if (source.hasKey("responseTimeoutMs")) source.getDouble("responseTimeoutMs").toLong() else 120_000L).milliseconds,
    probeTimeout = (if (source.hasKey("probeTimeoutMs")) source.getDouble("probeTimeoutMs").toLong() else 3_000L).milliseconds,
    secureHashKey = source.optionalString("secureHashKey"),
    autoInquireOnFailure = if (source.hasKey("autoInquireOnFailure")) source.getBoolean("autoInquireOnFailure") else true,
    merchantId = source.optionalString("merchantId"),
    terminalId = source.optionalString("terminalId"),
    environment = EcrEnvironment.fromName(source.optionalString("environment")),
  )
}
