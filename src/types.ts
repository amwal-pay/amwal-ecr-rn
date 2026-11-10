/**
 * How the till reaches the terminal. Values match TMS `ecrMode`:
 * `usbCable` 1, `wifi` 2, `bluetooth` 3, `webService` 4, `appToApp` 5.
 *
 * `wifi` opens a TCP socket to the terminal's local IP. `webService` drives
 * the terminal through the Amwal payment host over REST and needs
 * `merchantId`, `terminalId` and `environment`. `usbCable` and `appToApp` are
 * driven on Android. `bluetooth` answers with a typed `unsupported` failure
 * without sending anything. On iOS, USB cable and app to app answer the same
 * way. There is no ethernet transport: a cabled IP terminal is still Wi-Fi ECR.
 */
export type EcrTransport =
  'wifi' | 'usbCable' | 'bluetooth' | 'webService' | 'appToApp';

/**
 * Hub deployment for Web Service ECR. URLs are resolved inside the native
 * SDKs; integrators pass only this name.
 */
export type EcrEnvironment = 'SIT' | 'UAT' | 'PROD';

export interface EcrConfig {
  ecrId?: string;
  currencyCode?: string;
  minorUnitDigits?: number;
  port?: number;
  connectTimeoutMs?: number;
  responseTimeoutMs?: number;
  probeTimeoutMs?: number;
  secureHashKey?: string;
  autoInquireOnFailure?: boolean;
  /** Backend merchant ID — required for the `webService` transport. */
  merchantId?: string;
  /** Backend terminal ID — required for the `webService` transport. */
  terminalId?: string;
  /** Hub deployment for the `webService` transport. Defaults to `'SIT'`. */
  environment?: EcrEnvironment;
}

export interface EcrPermittedTransaction {
  messageType: string;
  minAmount: string;
  maxAmount: string;
}

/** What a sign-on learned about the terminal. */
export interface EcrTerminalCapabilities {
  available: boolean;
  reason: string;
  /** TMS ecrMode: 1 USB, 2 Wi-Fi, 3 Bluetooth, 4 Web Service. 0 when unknown. */
  ecrMode: number;
  terminalName: string;
  currencyCode: string;
  minorUnitDigits: number;
  eReceipt: boolean;
  physicalReceipt: boolean;
  permitted: EcrPermittedTransaction[];
}

export interface EcrSignOnAvailable {
  outcome: 'available';
  merchantReference: string;
  capabilities: EcrTerminalCapabilities;
  raw: string;
}

export interface EcrSignOnUnavailable {
  outcome: 'unavailable';
  merchantReference: string;
  reason: string;
  capabilities: EcrTerminalCapabilities;
  raw: string;
}

export interface EcrSignOnFailed {
  outcome: 'failed';
  merchantReference: string;
  failure: EcrFailure;
}

export type EcrSignOn =
  EcrSignOnAvailable | EcrSignOnUnavailable | EcrSignOnFailed;

export interface EcrTerminalOptions {
  /**
   * The terminal's IP address. Required for `wifi`. Unused by `webService`
   * and `usbCable`. For `appToApp` the only accepted value is
   * `com.amwalpay.pos`; omit it and the terminal uses that id.
   */
  host?: string;
  serialNumber?: string;
  transport?: EcrTransport;
  config?: EcrConfig;
}

export type EcrNextStep = 'NONE' | 'INQUIRE_BY_MERCHANT_REFERENCE';

export type EcrFailureKind =
  | 'unreachable'
  | 'timeout'
  | 'malformed'
  | 'connectionLost'
  | 'unauthenticated'
  | 'cancelled'
  | 'unsupported';

export interface EcrFailure {
  kind: EcrFailureKind;
  message: string;
  outcomeIsUnknown: boolean;
}

export interface EcrApproved {
  outcome: 'approved';
  merchantReference: string;
  amount: string;
  responseCode: string;
  rrn: string;
  authCode: string;
  maskedPan: string;
  partialApproval: boolean;
  requestedAmount: string;
  raw: string;
  outcomeIsUnknown: false;
  nextStep: 'NONE';
}

export interface EcrDeclined {
  outcome: 'declined';
  merchantReference: string;
  responseCode: string;
  reason: string;
  nextStep: EcrNextStep;
  raw: string;
  outcomeIsUnknown: boolean;
  /** Present when the terminal refused because its profile changed. */
  capabilities?: EcrTerminalCapabilities;
}

export interface EcrFailed {
  outcome: 'failed';
  merchantReference: string;
  failure: EcrFailure;
  recovered?: EcrInquiry;
  settled: boolean;
  outcomeIsUnknown: boolean;
  nextStep: EcrNextStep;
}

export type EcrResult = EcrApproved | EcrDeclined | EcrFailed;

export interface EcrTransaction {
  transactionId: string;
  stan: string;
  type: string;
  status: string;
  amount: string;
  totalAmount: string;
  currency: string;
  transactionTime: string;
  maskedPan: string;
  cardHolderName: string;
  rrn: string;
  authCode: string;
  batchId: string;
  terminalId: string;
  isRefunded: boolean;
  canVoid: boolean;
  canRefund: boolean;
  partialApproval: boolean;
  authorizedAmount: string;
}

export interface EcrInquiryFound {
  outcome: 'found';
  merchantReference: string;
  transaction: EcrTransaction;
  raw: string;
}

export interface EcrInquiryNotFound {
  outcome: 'notFound';
  merchantReference: string;
  reason: string;
  raw: string;
}

export interface EcrInquiryFailed {
  outcome: 'failed';
  merchantReference: string;
  failure: EcrFailure;
}

export type EcrInquiry =
  EcrInquiryFound | EcrInquiryNotFound | EcrInquiryFailed;

export interface EcrReceiptReady {
  outcome: 'ready';
  merchantReference: string;
  url: string;
  raw: string;
}

export interface EcrReceiptUnavailable {
  outcome: 'unavailable';
  merchantReference: string;
  reason: string;
  raw: string;
}

export interface EcrReceiptFailed {
  outcome: 'failed';
  merchantReference: string;
  failure: EcrFailure;
}

export type EcrReceipt =
  EcrReceiptReady | EcrReceiptUnavailable | EcrReceiptFailed;

export interface EcrReceiptClosedIdle {
  outcome: 'idle';
  merchantReference: string;
  raw: string;
}

export interface EcrReceiptClosedRefused {
  outcome: 'refused';
  merchantReference: string;
  responseCode: string;
  reason: string;
  raw: string;
}

export interface EcrReceiptClosedFailed {
  outcome: 'failed';
  merchantReference: string;
  failure: EcrFailure;
}

export type EcrReceiptClosed =
  EcrReceiptClosedIdle | EcrReceiptClosedRefused | EcrReceiptClosedFailed;

export interface EcrSettlementTotal {
  count: number;
  amount: string;
}

export interface EcrSettlementSettled {
  outcome: 'settled';
  merchantReference: string;
  batchId: string;
  currency: string;
  startTime: string;
  endTime: string;
  totalTransactions: number;
  netAmount: string;
  totals: Record<string, EcrSettlementTotal>;
  raw: string;
}

export interface EcrSettlementNothingToSettle {
  outcome: 'nothingToSettle';
  merchantReference: string;
  message: string;
  raw: string;
}

export interface EcrSettlementNotSettled {
  outcome: 'notSettled';
  merchantReference: string;
  responseCode: string;
  status: string;
  reason: string;
  uploadedTransactions?: number;
  raw: string;
}

export interface EcrSettlementFailed {
  outcome: 'failed';
  merchantReference: string;
  failure: EcrFailure;
}

export type EcrSettlement =
  | EcrSettlementSettled
  | EcrSettlementNothingToSettle
  | EcrSettlementNotSettled
  | EcrSettlementFailed;

/** App-to-app PRINT status. Kept apart from [EcrPrintOutcome.message]. */
export type EcrPrintStatus = 'SUCCESSFUL' | 'FAILED';

export interface EcrPrintOutcome {
  status: EcrPrintStatus;
  message: string;
  ok: boolean;
}

/** Result of `EcrTerminal.probeReachability`. */
export interface EcrReachability {
  reachable: boolean;
  /** Address side of the link. Empty for a cable with no IP. */
  host: string;
  /** Listener port, or 0 when the link is not a socket. */
  port: number;
  /** Why the probe failed. Absent when `reachable` is true. */
  error?: string;
  /** What to show an operator: `host:port` over Wi-Fi, the cable otherwise. */
  endpoint: string;
}

export interface EcrReferenceOptions {
  merchantReference?: string;
  operationId?: string;
}

/** Arguments for `EcrTerminal.run`, which only accepts sale, void, and refund. */
export interface EcrRunOptions extends EcrReferenceOptions {
  amount?: string;
  receiptNumber?: string;
  transactionDate?: string;
  originalTerminalId?: string;
}

export interface EcrOriginalTransactionOptions extends EcrReferenceOptions {
  originalTerminalId?: string;
}

export interface EcrDatedTransactionOptions extends EcrOriginalTransactionOptions {
  receiptNumber: string;
  transactionDate: string;
}

export interface EcrRefundOptions extends EcrDatedTransactionOptions {}

export interface EcrInquiryByReferenceOptions extends EcrOriginalTransactionOptions {
  transactionDate?: string;
}

export interface EcrCloseReceiptOptions extends EcrReferenceOptions {
  /**
   * The sale, void, or refund this close refers to. Required on Web Service.
   * Wi-Fi and USB ignore it.
   */
  originalMerchantReference?: string;
}
