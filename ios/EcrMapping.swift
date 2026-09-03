import AmwalECR
import Foundation

enum ReactEcrMapping {
    static let cancelled = "cancelled"
    static let unsupported = "unsupported"

    static func result(_ result: EcrResult) -> [String: Any] {
        switch result {
        case let .approved(value):
            return [
                "outcome": "approved",
                "merchantReferenceId": value.merchantReferenceId,
                "amount": value.amount,
                "responseCode": value.responseCode,
                "rrn": value.rrn,
                "authCode": value.authCode,
                "maskedPan": value.maskedPan,
                "partialApproval": value.partialApproval,
                "requestedAmount": value.requestedAmount,
                "raw": value.raw,
            ]
        case let .declined(value):
            return [
                "outcome": "declined",
                "merchantReferenceId": value.merchantReferenceId,
                "responseCode": value.responseCode,
                "reason": value.reason,
                "nextStep": value.nextStep.rawValue,
                "raw": value.raw,
            ]
        case let .failed(reference, failure, recovered):
            var value: [String: Any] = [
                "outcome": "failed",
                "merchantReferenceId": reference,
                "failure": self.failure(failure),
            ]
            if let recovered {
                value["recovered"] = inquiry(recovered)
            }
            return value
        }
    }

    static func inquiry(_ inquiry: EcrInquiry) -> [String: Any] {
        switch inquiry {
        case let .found(reference, transaction, raw):
            return [
                "outcome": "found",
                "merchantReferenceId": reference,
                "transaction": self.transaction(transaction),
                "raw": raw,
            ]
        case let .notFound(reference, reason, raw):
            return [
                "outcome": "notFound",
                "merchantReferenceId": reference,
                "reason": reason,
                "raw": raw,
            ]
        case let .failed(reference, failure):
            return [
                "outcome": "failed",
                "merchantReferenceId": reference,
                "failure": self.failure(failure),
            ]
        }
    }

    static func receipt(_ receipt: EcrReceipt) -> [String: Any] {
        switch receipt {
        case let .ready(reference, url, raw):
            return [
                "outcome": "ready",
                "merchantReferenceId": reference,
                "url": url,
                "raw": raw,
            ]
        case let .unavailable(reference, reason, raw):
            return [
                "outcome": "unavailable",
                "merchantReferenceId": reference,
                "reason": reason,
                "raw": raw,
            ]
        case let .failed(reference, failure):
            return [
                "outcome": "failed",
                "merchantReferenceId": reference,
                "failure": self.failure(failure),
            ]
        }
    }

    static func failedResult(
        merchantReferenceId: String,
        kind: String,
        message: String
    ) -> [String: Any] {
        [
            "outcome": "failed",
            "merchantReferenceId": merchantReferenceId,
            "failure": ["kind": kind, "message": message],
        ]
    }

    private static func failure(_ failure: EcrFailure) -> [String: Any] {
        let kind: String
        switch failure {
        case .unreachable: kind = "unreachable"
        case .timeout: kind = "timeout"
        case .malformed: kind = "malformed"
        case .connectionLost: kind = "connectionLost"
        case .unauthenticated: kind = "unauthenticated"
        }
        return ["kind": kind, "message": failure.message]
    }

    private static func transaction(_ value: EcrTransaction) -> [String: Any] {
        [
            "transactionId": value.transactionId,
            "stan": value.stan,
            "type": value.type,
            "status": value.status,
            "amount": value.amount,
            "totalAmount": value.totalAmount,
            "currency": value.currency,
            "transactionTime": value.transactionTime,
            "maskedPan": value.maskedPan,
            "cardHolderName": value.cardHolderName,
            "rrn": value.rrn,
            "authCode": value.authCode,
            "batchId": value.batchId,
            "terminalId": value.terminalId,
            "isRefunded": value.isRefunded,
            "canVoid": value.canVoid,
            "canRefund": value.canRefund,
        ]
    }
}
