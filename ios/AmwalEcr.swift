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
            let session: EcrOpenedSession
            do {
                session = try call.makeSession()
            } catch is SessionUnavailable {
                resolve(false)
                return
            }
            queue.async { resolve(session.probeReachability()?.reachable ?? false) }
        } catch {
            rejectError(error, reject)
        }
    }

    @objc func sale(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.result(
                try session.sale(
                    amount: try call.requiredAmount(),
                    merchantReference: call.merchantReferenceId
                )
            )
        }
    }

    @objc func voidTransaction(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.result(
                try session.void(
                    receiptNumber: try call.requiredReceiptNumber("A void"),
                    originalTerminalId: call.originalTerminalId,
                    merchantReference: call.merchantReferenceId
                )
            )
        }
    }

    @objc func refund(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.result(
                try session.refund(
                    amount: try call.requiredAmount(),
                    receiptNumber: try call.requiredReceiptNumber("A refund"),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReference: call.merchantReferenceId
                )
            )
        }
    }

    @objc func inquire(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.inquiry(
                try session.inquire(
                    receiptNumber: try call.requiredReceiptNumber("An inquiry"),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReference: call.merchantReferenceId
                )
            )
        }
    }

    @objc func inquireByReference(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.inquiry(
                try session.inquireByReference(
                    try call.requiredOriginalReference(),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReference: call.merchantReferenceId
                )
            )
        }
    }

    @objc func signOn(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.signOn(
                try session.signOn(merchantReference: call.merchantReferenceId)
            )
        }
    }

    @objc func closeReceipt(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.receiptClosed(
                try session.closeReceipt(merchantReference: call.merchantReferenceId)
            )
        }
    }

    @objc func receipt(
        _ request: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        run(request, resolve, reject) { call, session in
            ReactEcrMapping.receipt(
                try session.receipt(
                    receiptNumber: try call.requiredReceiptNumber("A receipt"),
                    transactionDate: call.transactionDate,
                    originalTerminalId: call.originalTerminalId,
                    merchantReference: call.merchantReferenceId
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

        operation.session.cancel()
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
            operation.session.cancel()
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
        _ block: @escaping (Call, EcrOpenedSession) throws -> Any
    ) {
        do {
            let call = try Call(request)
            let reply = OneShotReply(resolve: resolve, reject: reject)

            let session: EcrOpenedSession
            do {
                session = try call.makeSession()
            } catch let unavailable as SessionUnavailable {
                reply.resolve(unavailable.failedResult(merchantReferenceId: call.merchantReferenceId))
                return
            }

            let operation = RunningOperation(
                session: session,
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
                    reply.resolve(try block(call, session))
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
    let session: EcrOpenedSession
    let reply: OneShotReply
    let merchantReferenceId: String

    init(session: EcrOpenedSession, reply: OneShotReply, merchantReferenceId: String) {
        self.session = session
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
    let host: String
    let serialNumber: String
    let config: EcrConfig
    private let raw: [String: Any]

    init(_ raw: [String: Any]) throws {
        self.raw = raw
        operationId = try Self.requiredString(raw, "operationId")
        transport = raw["transport"] as? String ?? "wifi"
        // The payment host addresses a Web Service terminal; only the IP
        // transports dial an address of their own.
        if transport == "ethernet" || transport == "wifi" {
            host = try Self.requiredString(raw, "host")
        } else {
            host = (raw["host"] as? String)?.trimmed ?? ""
        }
        serialNumber = raw["serialNumber"] as? String ?? ""
        transactionDate = raw["transactionDate"] as? String ?? ""
        originalTerminalId = raw["originalTerminalId"] as? String ?? ""
        merchantReferenceId = raw["merchantReferenceId"] as? String ?? ""
        config = Self.config(raw["config"] as? [String: Any])
    }

    var isIpTransport: Bool { transport == "ethernet" || transport == "wifi" }
    var isWebService: Bool { transport == "webService" || transport == "web_service" }

    /// Wi-Fi / ethernet and Web Service, through `EcrSessions.plan` / `open`.
    ///
    /// The same dispatch the Flutter iOS bridge uses against AmwalECR 0.2.1.
    /// USB cable is a link in that SDK, and the caller has to supply the byte
    /// channel. This bridge does not open a cable — there is no External
    /// Accessory driver here, matching Flutter — so USB, app to app, and
    /// Bluetooth answer unsupported and send nothing.
    func makeSession() throws -> EcrOpenedSession {
        let link: EcrLink
        if isWebService {
            link = .webService(merchantId: config.merchantId, terminalId: config.terminalId)
        } else if isIpTransport {
            link = .lan(host: host, port: config.port)
        } else {
            throw SessionUnavailable.unsupported(transport)
        }

        let plan = EcrSessions.plan(
            link: link,
            config: config,
            rawSecureHashKey: config.secureHashKey
        )
        guard plan.isReady else {
            throw SessionUnavailable.notReady(plan.issues)
        }
        return EcrSessions.open(terminalSerial: serialNumber, plan: plan, logger: .none)
    }

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

    private static func config(_ raw: [String: Any]?) -> EcrConfig {
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
        if let field = raw["merchantId"] as? String { value.merchantId = field }
        if let field = raw["terminalId"] as? String { value.terminalId = field }
        if let field = raw["environment"] as? String { value.environment = EcrEnvironment.fromName(field) }
        return value
    }
}

/// A call that must not open a socket: the transport is not on iOS, or the
/// session plan is not ready. Answered as a failed result, the way the Flutter
/// iOS bridge answers `InvalidPlanTerminalPort` and an unsupported transport.
private enum SessionUnavailable: Error {
    case unsupported(String)
    case notReady([String])

    func failedResult(merchantReferenceId: String) -> [String: Any] {
        switch self {
        case let .unsupported(transport):
            return ReactEcrMapping.failedResult(
                merchantReferenceId: merchantReferenceId,
                kind: ReactEcrMapping.unsupported,
                message: "A terminal opens its ECR listener for Wi-Fi, USB cable (Android), or "
                    + "Web Service REST. \"\(transport)\" is driven by other machinery, "
                    + "so nothing was sent."
            )
        case let .notReady(issues):
            let message = issues.isEmpty
                ? "Terminal configuration is incomplete"
                : issues.joined(separator: "; ")
            return ReactEcrMapping.failedResult(
                merchantReferenceId: merchantReferenceId,
                kind: "malformed",
                message: message
            )
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
