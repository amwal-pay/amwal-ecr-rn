import AmwalECR
import Foundation
import React

@objc(AmwalEcrImpl)
final class AmwalEcrImpl: NSObject {
    private static let invalidArgument = "ECR_INVALID_ARGUMENT"
    private static let internalError = "ECR_INTERNAL"
    private static let cancelledMessage =
        "The caller cancelled while the terminal had the request. "
        + "The transaction may still have completed — inquire before retrying."

    private let queue = DispatchQueue(
        label: "com.amwalpay.react-native-ecr",
        qos: .userInitiated,
        attributes: .concurrent
    )
    private let lock = NSLock()
    private var running: [String: RunningOperation] = [:]

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func isReachable(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            let call = try Call(request)
            guard call.isIpTransport else {
                resolve(false)
                return
            }
            queue.async { resolve(call.terminal.isReachable()) }
        } catch {
            rejectError(error, reject)
        }
    }

    @objc func sale(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call in
            ReactEcrMapping.result(
                try call.terminal.sale(
                    amount: try call.requiredAmount(),
                    merchantReferenceId: call.merchantReferenceId
                )
            )
        }
    }

    @objc func voidTransaction(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call in
            ReactEcrMapping.result(
                try call.terminal.void(
                    receiptNumber: try call.requiredReceiptNumber("A void"),
                    originalTerminalId: call.originalTerminalId,
                    merchantReferenceId: call.merchantReferenceId
                )
            )
        }
    }

    @objc func refund(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call in
            ReactEcrMapping.result(
                try call.terminal.refund(
                    amount: try call.requiredAmount(),
                    receiptNumber: try call.requiredReceiptNumber("A refund"),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReferenceId: call.merchantReferenceId
                )
            )
        }
    }

    @objc func inquire(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call in
            ReactEcrMapping.inquiry(
                try call.terminal.inquire(
                    receiptNumber: try call.requiredReceiptNumber("An inquiry"),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReferenceId: call.merchantReferenceId
                )
            )
        }
    }

    @objc func inquireByReference(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call in
            ReactEcrMapping.inquiry(
                try call.terminal.inquireByReference(
                    try call.requiredOriginalReference(),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReferenceId: call.merchantReferenceId
                )
            )
        }
    }

    @objc func receipt(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call in
            ReactEcrMapping.receipt(
                try call.terminal.receipt(
                    receiptNumber: try call.requiredReceiptNumber("A receipt"),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReferenceId: call.merchantReferenceId
                )
            )
        }
    }

    @objc func cancel(
        _ operationId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        lock.lock()
        let operation = running.removeValue(forKey: operationId)
        lock.unlock()

        guard let operation else {
            resolve(false)
            return
        }

        operation.terminal.cancel()
        operation.reply.resolve(
            ReactEcrMapping.failedResult(
                merchantReferenceId: operation.merchantReferenceId,
                kind: ReactEcrMapping.cancelled,
                message: Self.cancelledMessage
            )
        )
        resolve(true)
    }

    @objc func invalidate() {
        lock.lock()
        let operations = Array(running.values)
        running.removeAll()
        lock.unlock()

        for operation in operations {
            operation.terminal.cancel()
            operation.reply.resolve(
                ReactEcrMapping.failedResult(
                    merchantReferenceId: operation.merchantReferenceId,
                    kind: ReactEcrMapping.cancelled,
                    message: "The React Native host was invalidated while the terminal had the request. "
                        + "The transaction may still have completed — inquire before retrying."
                )
            )
        }
    }

    private func run(
        _ request: [String: Any],
        _ resolve: @escaping RCTPromiseResolveBlock,
        _ reject: @escaping RCTPromiseRejectBlock,
        _ block: @escaping (Call) throws -> Any
    ) {
        do {
            let call = try Call(request)
            let reply = OneShotReply(resolve: resolve, reject: reject)

            guard call.isIpTransport else {
                reply.resolve(
                    ReactEcrMapping.failedResult(
                        merchantReferenceId: "",
                        kind: ReactEcrMapping.unsupported,
                        message: "A terminal opens its ECR listener only for ethernet and wifi. "
                            + "Transport '\(call.transport)' is not handled by this library, so nothing was sent."
                    )
                )
                return
            }

            let operation = RunningOperation(
                terminal: call.terminal,
                reply: reply,
                merchantReferenceId: call.merchantReferenceId
            )
            lock.lock()
            guard running[call.operationId] == nil else {
                lock.unlock()
                reply.reject(
                    code: Self.invalidArgument,
                    message: "operationId '\(call.operationId)' is already running",
                    error: nil
                )
                return
            }
            running[call.operationId] = operation
            lock.unlock()

            queue.async { [weak self] in
                defer { self?.deregister(call.operationId, operation) }
                do {
                    reply.resolve(try block(call))
                } catch {
                    self?.rejectError(error, reply)
                }
            }
        } catch {
            rejectError(error, reject)
        }
    }

    private func deregister(_ operationId: String, _ operation: RunningOperation) {
        lock.lock()
        if running[operationId] === operation {
            running.removeValue(forKey: operationId)
        }
        lock.unlock()
    }

    private func rejectError(_ error: Error, _ reject: RCTPromiseRejectBlock) {
        if let invalid = error as? EcrInvalidArgument {
            reject(Self.invalidArgument, invalid.message, invalid)
        } else {
            reject(Self.internalError, error.localizedDescription, error)
        }
    }

    private func rejectError(_ error: Error, _ reply: OneShotReply) {
        if let invalid = error as? EcrInvalidArgument {
            reply.reject(
                code: Self.invalidArgument,
                message: invalid.message,
                error: invalid
            )
        } else {
            reply.reject(
                code: Self.internalError,
                message: error.localizedDescription,
                error: error
            )
        }
    }
}

private final class RunningOperation {
    let terminal: EcrTerminal
    let reply: OneShotReply
    let merchantReferenceId: String

    init(terminal: EcrTerminal, reply: OneShotReply, merchantReferenceId: String) {
        self.terminal = terminal
        self.reply = reply
        self.merchantReferenceId = merchantReferenceId
    }
}

private final class OneShotReply {
    private let lock = NSLock()
    private var answered = false
    private let onResolve: RCTPromiseResolveBlock
    private let onReject: RCTPromiseRejectBlock

    init(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        onResolve = resolve
        onReject = reject
    }

    private func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if answered { return false }
        answered = true
        return true
    }

    func resolve(_ value: Any?) {
        if claim() { onResolve(value) }
    }

    func reject(code: String, message: String, error: Error?) {
        if claim() { onReject(code, message, error) }
    }
}

private struct Call {
    let operationId: String
    let transport: String
    let transactionDate: String
    let originalTerminalId: String
    let merchantReferenceId: String
    let terminal: EcrTerminal
    private let raw: [String: Any]

    init(_ raw: [String: Any]) throws {
        self.raw = raw
        operationId = try Self.requiredString(raw, "operationId")
        let host = try Self.requiredString(raw, "host")
        let serialNumber = raw["serialNumber"] as? String ?? ""
        transport = raw["transport"] as? String ?? "wifi"
        transactionDate = raw["transactionDate"] as? String ?? ""
        originalTerminalId = raw["originalTerminalId"] as? String ?? ""
        merchantReferenceId = raw["merchantReferenceId"] as? String ?? ""
        terminal = EcrTerminal(
            host: host,
            serialNumber: serialNumber,
            config: try Self.config(raw["config"] as? [String: Any])
        )
    }

    var isIpTransport: Bool { transport == "ethernet" || transport == "wifi" }

    func requiredAmount() throws -> Decimal {
        let text = try Self.requiredString(raw, "amount")
        guard let amount = EcrDecimal.parse(text) else {
            throw EcrInvalidArgument("'\(text)' is not a decimal amount")
        }
        return amount
    }

    func requiredReceiptNumber(_ operation: String) throws -> String {
        let value = (raw["receiptNumber"] as? String)?.trimmed ?? ""
        guard !value.isEmpty else {
            throw EcrInvalidArgument("\(operation) needs the original receipt number")
        }
        return value
    }

    func requiredOriginalReference() throws -> String {
        let value = (raw["originalMerchantReference"] as? String)?.trimmed ?? ""
        guard !value.isEmpty else {
            throw EcrInvalidArgument("An inquiry by reference needs the original reference")
        }
        return value
    }

    private static func requiredString(_ raw: [String: Any], _ key: String) throws -> String {
        let value = (raw[key] as? String)?.trimmed ?? ""
        guard !value.isEmpty else {
            throw EcrInvalidArgument("'\(key)' is required and was missing")
        }
        return value
    }

    private static func config(_ raw: [String: Any]?) throws -> EcrConfig {
        let raw = raw ?? [:]
        var value = EcrConfig()
        if let field = raw["ecrId"] as? String, !field.isEmpty { value.ecrId = field }
        if let field = raw["currencyCode"] as? String, !field.isEmpty { value.currencyCode = field }
        if let field = raw["minorUnitDigits"] as? NSNumber { value.minorUnitDigits = field.intValue }
        if let field = raw["port"] as? NSNumber { value.port = field.intValue }
        if let field = raw["connectTimeoutMs"] as? NSNumber { value.connectTimeout = field.doubleValue / 1000 }
        if let field = raw["responseTimeoutMs"] as? NSNumber { value.responseTimeout = field.doubleValue / 1000 }
        if let field = raw["probeTimeoutMs"] as? NSNumber { value.probeTimeout = field.doubleValue / 1000 }
        if let field = raw["secureHashKey"] as? String { value.secureHashKey = field }
        if let field = raw["autoInquireOnFailure"] as? NSNumber { value.autoInquireOnFailure = field.boolValue }

        guard (0 ... 4).contains(value.minorUnitDigits) else {
            throw EcrInvalidArgument("minorUnitDigits must be between 0 and 4")
        }
        guard (1 ... 65_535).contains(value.port) else {
            throw EcrInvalidArgument("port must be between 1 and 65535")
        }
        if let message = value.secureHashKeyError {
            throw EcrInvalidArgument(message)
        }
        return value
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
