/**
 * How the till reaches the terminal. Values match TMS `ecrMode`:
 * `usbCable` 1, `wifi` 2, `bluetooth` 3, `webService` 4, `appToApp` 5.
 *
 * `wifi` opens a TCP socket to the terminal's local IP. `ethernet` is accepted
 * as the same path. `webService` drives the terminal through the Amwal payment
 * host over REST and needs `merchantId`, `terminalId` and `environment`.
 * `usbCable` and `appToApp` are driven on Android. `bluetooth` answers with a
 * typed `unsupported` failure without sending anything. On iOS, USB cable,
 * app to app, and sign-on answer the same way.
 */
export type EcrTransport =
  | 'wifi'
  | 'ethernet'
  | 'usbCable'
  | 'bluetooth'
  | 'webService'
  | 'appToApp';

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
  merchantReferenceId: string;
  capabilities: EcrTerminalCapabilities;
  raw: string;
}

export interface EcrSignOnUnavailable {
  outcome: 'unavailable';
  merchantReferenceId: string;
  reason: string;
  capabilities: EcrTerminalCapabilities;
  raw: string;
}

export interface EcrSignOnFailed {
  outcome: 'failed';
  merchantReferenceId: string;
  failure: EcrFailure;
}

export type EcrSignOn =
  | EcrSignOnAvailable
  | EcrSignOnUnavailable
  | EcrSignOnFailed;

export interface EcrTerminalOptions {
  /**
   * The terminal's IP address. Required for `wifi` and `ethernet`. Unused by
   * `webService`, `usbCable`, and `appToApp`.
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
  merchantReferenceId: string;
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
  merchantReferenceId: string;
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
  merchantReferenceId: string;
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
  merchantReferenceId: string;
  transaction: EcrTransaction;
  raw: string;
}

export interface EcrInquiryNotFound {
  outcome: 'notFound';
  merchantReferenceId: string;
  reason: string;
  raw: string;
}

export interface EcrInquiryFailed {
  outcome: 'failed';
  merchantReferenceId: string;
  failure: EcrFailure;
}

export type EcrInquiry =
  EcrInquiryFound | EcrInquiryNotFound | EcrInquiryFailed;

export interface EcrReceiptReady {
  outcome: 'ready';
  merchantReferenceId: string;
  url: string;
  raw: string;
}

export interface EcrReceiptUnavailable {
  outcome: 'unavailable';
  merchantReferenceId: string;
  reason: string;
  raw: string;
}

export interface EcrReceiptFailed {
  outcome: 'failed';
  merchantReferenceId: string;
  failure: EcrFailure;
}

export type EcrReceipt =
  EcrReceiptReady | EcrReceiptUnavailable | EcrReceiptFailed;

export interface EcrReferenceOptions {
  merchantReferenceId?: string;
  operationId?: string;
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
