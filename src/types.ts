export type EcrTransport = 'ethernet' | 'wifi' | 'bluetooth' | 'webService';

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
}

export interface EcrTerminalOptions {
  host: string;
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
