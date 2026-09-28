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
                "merchantReferenceId": value.merchantReference,
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
            var map: [String: Any] = [
                "outcome": "declined",
                "merchantReferenceId": value.merchantReference,
                "responseCode": value.responseCode,
                "reason": value.reason,
                "nextStep": value.nextStep.rawValue,
                "raw": value.raw,
            ]
            if let capabilities = value.capabilities {
                map["capabilities"] = self.capabilities(capabilities)
            }
            return map
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

    static func receiptClosed(_ closed: EcrReceiptClosed) -> [String: Any] {
        switch closed {
        case let .idle(reference, raw):
            return [
                "outcome": "idle",
                "merchantReferenceId": reference,
                "raw": raw,
            ]
        case let .refused(reference, responseCode, reason, raw):
            return [
                "outcome": "refused",
                "merchantReferenceId": reference,
                "responseCode": responseCode,
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

    static func signOn(_ signOn: EcrSignOn) -> [String: Any] {
        switch signOn {
        case let .available(reference, capabilities, raw):
            return [
                "outcome": "available",
                "merchantReferenceId": reference,
                "capabilities": self.capabilities(capabilities),
                "raw": raw,
            ]
        case let .unavailable(reference, reason, capabilities, raw):
            return [
                "outcome": "unavailable",
                "merchantReferenceId": reference,
                "reason": reason,
                "capabilities": self.capabilities(capabilities),
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

    static func capabilities(_ value: EcrTerminalCapabilities) -> [String: Any] {
        [
            "available": value.available,
            "reason": value.reason,
            "ecrMode": value.transport.ecrMode,
            "terminalName": value.terminalName,
            "currencyCode": value.currencyCode,
            "minorUnitDigits": value.minorUnitDigits,
            "eReceipt": value.eReceipt,
            "physicalReceipt": value.physicalReceipt,
            "permitted": value.permitted.map { entry in
                [
                    "messageType": entry.type.messageType,
                    "minAmount": entry.minAmount,
                    "maxAmount": entry.maxAmount,
                ]
            },
        ]
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
            "partialApproval": value.partialApproval,
            "authorizedAmount": value.authorizedAmount,
        ]
    }
}
