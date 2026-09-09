package com.amwalecr

import com.amwalpay.ecr.EcrInquiry
import com.amwalpay.ecr.EcrReceipt
import com.amwalpay.ecr.EcrResult
import com.amwalpay.ecr.EcrTransaction
import com.amwalpay.ecr.Failure
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

internal object EcrMapping {
  const val CANCELLED = "cancelled"
  const val UNSUPPORTED = "unsupported"

  fun result(result: EcrResult): WritableMap = when (result) {
    is EcrResult.Approved -> Arguments.createMap().apply {
      putString("outcome", "approved")
      putString("merchantReferenceId", result.merchantReference)
      putString("amount", result.amount)
      putString("responseCode", result.responseCode)
      putString("rrn", result.rrn)
      putString("authCode", result.authCode)
      putString("maskedPan", result.maskedPan)
      putBoolean("partialApproval", result.partialApproval)
      putString("requestedAmount", result.requestedAmount)
      putString("raw", result.raw)
    }

    is EcrResult.Declined -> Arguments.createMap().apply {
      putString("outcome", "declined")
      putString("merchantReferenceId", result.merchantReference)
      putString("responseCode", result.responseCode)
      putString("reason", result.reason)
      putString("nextStep", result.nextStep.name)
      putString("raw", result.raw)
    }

    is EcrResult.Failed -> Arguments.createMap().apply {
      putString("outcome", "failed")
      putString("merchantReferenceId", result.merchantReference)
      putMap("failure", failure(result.failure))
      result.recovered?.let { putMap("recovered", inquiry(it)) }
    }
  }

  fun inquiry(inquiry: EcrInquiry): WritableMap = when (inquiry) {
    is EcrInquiry.Found -> Arguments.createMap().apply {
      putString("outcome", "found")
      putString("merchantReferenceId", inquiry.merchantReference)
      putMap("transaction", transaction(inquiry.transaction))
      putString("raw", inquiry.raw)
    }

    is EcrInquiry.NotFound -> Arguments.createMap().apply {
      putString("outcome", "notFound")
      putString("merchantReferenceId", inquiry.merchantReference)
      putString("reason", inquiry.reason)
      putString("raw", inquiry.raw)
    }

    is EcrInquiry.Failed -> Arguments.createMap().apply {
      putString("outcome", "failed")
      putString("merchantReferenceId", inquiry.merchantReference)
      putMap("failure", failure(inquiry.failure))
    }
  }

  fun receipt(receipt: EcrReceipt): WritableMap = when (receipt) {
    is EcrReceipt.Ready -> Arguments.createMap().apply {
      putString("outcome", "ready")
      putString("merchantReferenceId", receipt.merchantReference)
      putString("url", receipt.url)
      putString("raw", receipt.raw)
    }

    is EcrReceipt.Unavailable -> Arguments.createMap().apply {
      putString("outcome", "unavailable")
      putString("merchantReferenceId", receipt.merchantReference)
      putString("reason", receipt.reason)
      putString("raw", receipt.raw)
    }

    is EcrReceipt.Failed -> Arguments.createMap().apply {
      putString("outcome", "failed")
      putString("merchantReferenceId", receipt.merchantReference)
      putMap("failure", failure(receipt.failure))
    }
  }

  fun failedResult(
    merchantReferenceId: String,
    kind: String,
    message: String,
  ): WritableMap = Arguments.createMap().apply {
    putString("outcome", "failed")
    putString("merchantReferenceId", merchantReferenceId)
    putMap("failure", Arguments.createMap().apply {
      putString("kind", kind)
      putString("message", message)
    })
  }

  private fun transaction(value: EcrTransaction): WritableMap = Arguments.createMap().apply {
    putString("transactionId", value.transactionId)
    putString("stan", value.stan)
    putString("type", value.type)
    putString("status", value.status)
    putString("amount", value.amount)
    putString("totalAmount", value.totalAmount)
    putString("currency", value.currency)
    putString("transactionTime", value.transactionTime)
    putString("maskedPan", value.maskedPan)
    putString("cardHolderName", value.cardHolderName)
    putString("rrn", value.rrn)
    putString("authCode", value.authCode)
    putString("batchId", value.batchId)
    putString("terminalId", value.terminalId)
    putBoolean("isRefunded", value.isRefunded)
    putBoolean("canVoid", value.canVoid)
    putBoolean("canRefund", value.canRefund)
    putBoolean("partialApproval", value.partialApproval)
    putString("authorizedAmount", value.authorizedAmount)
  }

  private fun failure(value: Failure): WritableMap = Arguments.createMap().apply {
    putString("kind", when (value) {
      is Failure.Unreachable -> "unreachable"
      is Failure.Timeout -> "timeout"
      is Failure.Malformed -> "malformed"
      is Failure.ConnectionLost -> "connectionLost"
      is Failure.Unauthenticated -> "unauthenticated"
    })
    putString("message", value.message)
  }
}
