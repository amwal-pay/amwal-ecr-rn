package com.amwalecr

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.time.Duration

/**
 * Asks the Amwal payment app on this device to print a receipt image.
 *
 * Image width must be exactly [PRINTER_WIDTH] (384). Encoded size must not
 * exceed [PRINTER_MAX_BYTES]. [status] and [message] stay separate fields.
 */
internal object PaymentAppPrint {
  const val PRINTER_WIDTH = 384
  const val PRINTER_MAX_BYTES = 15 * 1024 * 1024
  const val ACTION = "com.amwalpay.pos.ecr.PRINT"
  const val EXTRA_RECEIPT_IMAGE = "amwal.ecr.receiptImage"
  const val EXTRA_MERCHANT_REFERENCE = "amwal.ecr.merchantReference"
  const val EXTRA_OK = "amwal.ecr.printOk"
  const val EXTRA_STATUS = "amwal.ecr.printStatus"
  const val EXTRA_MESSAGE = "amwal.ecr.printMessage"
  const val REQUEST_CODE = 0x5052

  fun exchange(
    activity: Activity,
    results: PaymentAppPrintResults,
    merchantReference: String,
    imagePng: ByteArray,
    timeout: Duration,
  ): PrintOutcome {
    val imageError = validatePrintImage(imagePng)
    if (imageError != null) return PrintOutcome.failed(imageError)
    val component = Intent(ACTION)
      .setPackage(PaymentAppEcrChannel.PACKAGE_NAME)
      .resolveActivity(activity.packageManager)
      ?: return PrintOutcome.failed(
        "The Amwal payment app is not installed, or does not accept PRINT",
      )
    val waiting = results.claim()
      ?: return PrintOutcome.failed("A print is already in progress")

    val intent = Intent(ACTION)
      .setComponent(component)
      .putExtra(EXTRA_MERCHANT_REFERENCE, merchantReference)
      .putExtra(EXTRA_RECEIPT_IMAGE, imagePng)
    Handler(Looper.getMainLooper()).post {
      try {
        activity.startActivityForResult(intent, REQUEST_CODE)
      } catch (error: Exception) {
        results.deliver(PrintOutcome.failed(error.message ?: "could not start print"))
      }
    }
    return waiting.await(timeout)
      ?: PrintOutcome.failed("The payment app did not answer the print request")
  }

  fun validatePrintImage(imagePng: ByteArray?): String? {
    if (imagePng == null || imagePng.isEmpty()) {
      return "Print image is required (width must be ${PRINTER_WIDTH}px)"
    }
    if (imagePng.size > PRINTER_MAX_BYTES) {
      return "Print image size must not exceed " +
        "${PRINTER_MAX_BYTES / (1024 * 1024)} MB " +
        "(was ${imagePng.size} bytes)"
    }
    val pngSize = pngIhdrSize(imagePng)
    if (pngSize != null) {
      val (width, height) = pngSize
      if (width <= 0 || height <= 0) return "Print image could not be decoded"
      if (width != PRINTER_WIDTH) {
        return "Print image width must be ${PRINTER_WIDTH}px (was ${width}x$height)"
      }
      return null
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(imagePng, 0, imagePng.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return "Print image could not be decoded"
    }
    if (bounds.outWidth != PRINTER_WIDTH) {
      return "Print image width must be ${PRINTER_WIDTH}px " +
        "(was ${bounds.outWidth}x${bounds.outHeight})"
    }
    return null
  }

  private fun pngIhdrSize(bytes: ByteArray): Pair<Int, Int>? {
    if (bytes.size < 24) return null
    if (
      bytes[0] != 0x89.toByte() ||
      bytes[1] != 'P'.code.toByte() ||
      bytes[2] != 'N'.code.toByte() ||
      bytes[3] != 'G'.code.toByte()
    ) {
      return null
    }
    fun be32(at: Int): Int =
      ((bytes[at].toInt() and 0xFF) shl 24) or
        ((bytes[at + 1].toInt() and 0xFF) shl 16) or
        ((bytes[at + 2].toInt() and 0xFF) shl 8) or
        (bytes[at + 3].toInt() and 0xFF)
    return be32(16) to be32(20)
  }
}

internal data class PrintOutcome(val status: String, val message: String) {
  val ok: Boolean get() = status == "SUCCESSFUL"

  fun toMap(): WritableMap = Arguments.createMap().apply {
    putString("status", status)
    putString("message", message)
    putBoolean("ok", ok)
  }

  companion object {
    fun failed(message: String) = PrintOutcome("FAILED", message)

    fun from(ok: Boolean, message: String, statusWire: String?): PrintOutcome {
      val status = when (statusWire?.trim()?.uppercase()) {
        "SUCCESSFUL", "SUCCESS", "OK" -> "SUCCESSFUL"
        "FAILED", "FAIL", "ERROR" -> "FAILED"
        else -> if (ok) "SUCCESSFUL" else "FAILED"
      }
      return PrintOutcome(status, message)
    }
  }
}

internal class PaymentAppPrintResults : ActivityEventListener {
  private val busy = AtomicBoolean(false)
  private val handovers = ArrayBlockingQueue<PrintOutcome>(1)

  fun claim(): Waiting? {
    if (!busy.compareAndSet(false, true)) return null
    handovers.clear()
    return Waiting()
  }

  fun deliver(outcome: PrintOutcome) {
    handovers.offer(outcome)
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != PaymentAppPrint.REQUEST_CODE) return
    val ok = data?.getBooleanExtra(
      PaymentAppPrint.EXTRA_OK,
      resultCode == Activity.RESULT_OK,
    ) ?: (resultCode == Activity.RESULT_OK)
    deliver(
      PrintOutcome.from(
        ok = ok,
        message = data?.getStringExtra(PaymentAppPrint.EXTRA_MESSAGE).orEmpty(),
        statusWire = data?.getStringExtra(PaymentAppPrint.EXTRA_STATUS),
      ),
    )
  }

  override fun onNewIntent(intent: Intent) = Unit

  inner class Waiting {
    fun await(timeout: Duration): PrintOutcome? = try {
      handovers.poll(timeout.inWholeMilliseconds, TimeUnit.MILLISECONDS)
    } finally {
      busy.set(false)
    }
  }
}
