import { EcrOperation } from './EcrOperation';
import { nativeEcr } from './native';
import {
  normalizeInquiry,
  normalizeReceipt,
  normalizeResult,
} from './normalize';
import type {
  EcrConfig,
  EcrDatedTransactionOptions,
  EcrInquiry,
  EcrInquiryByReferenceOptions,
  EcrOriginalTransactionOptions,
  EcrReceipt,
  EcrReferenceOptions,
  EcrRefundOptions,
  EcrResult,
  EcrTerminalOptions,
  EcrTransport,
} from './types';

const DEFAULT_CONFIG: Required<EcrConfig> = {
  ecrId: 'ECR01',
  currencyCode: '512',
  minorUnitDigits: 3,
  port: 9100,
  connectTimeoutMs: 10_000,
  responseTimeoutMs: 120_000,
  probeTimeoutMs: 3_000,
  secureHashKey: '',
  autoInquireOnFailure: true,
};

let operationSequence = 0;

function newOperationId(): string {
  operationSequence = (operationSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `ecr-${Date.now().toString(36)}-${operationSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError(`${label} is required.`);
  }
  return trimmed;
}

function requireAmount(amount: string): string {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new TypeError(
      `"${amount}" is not a plain decimal amount. Use a string such as "1.234".`
    );
  }
  return trimmed;
}

function requireDate(value: string, required: boolean): string {
  const trimmed = value.trim();
  if (!trimmed && !required) return '';
  if (!/^\d{8}$/.test(trimmed)) {
    throw new TypeError(
      'transactionDate must use yyyyMMdd, for example 20260902.'
    );
  }
  return trimmed;
}

function requireReference(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.length > 32 || /[\s&=]/.test(trimmed)) {
    throw new TypeError(
      `${label} must be at most 32 characters and cannot contain whitespace, "&", or "=".`
    );
  }
  return trimmed;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive whole number.`);
  }
  return value;
}

function normalizeConfig(config: EcrConfig = {}): Required<EcrConfig> {
  const normalized = { ...DEFAULT_CONFIG, ...config };
  if (normalized.minorUnitDigits < 0 || normalized.minorUnitDigits > 4) {
    throw new TypeError('minorUnitDigits must be between 0 and 4.');
  }
  if (normalized.port < 1 || normalized.port > 65_535) {
    throw new TypeError('port must be between 1 and 65535.');
  }
  positiveInteger(normalized.connectTimeoutMs, 'connectTimeoutMs');
  positiveInteger(normalized.responseTimeoutMs, 'responseTimeoutMs');
  positiveInteger(normalized.probeTimeoutMs, 'probeTimeoutMs');
  if (
    normalized.secureHashKey &&
    (normalized.secureHashKey.length < 16 ||
      normalized.secureHashKey.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(normalized.secureHashKey))
  ) {
    throw new TypeError(
      'secureHashKey must be an even-length hexadecimal string of at least 16 characters, or empty.'
    );
  }
  return normalized;
}

type NativeRequest = Record<string, unknown>;

/**
 * One Amwal POS terminal reachable from the mobile device's local network.
 *
 * Amounts are decimal strings, never JavaScript numbers. A failed exchange is
 * not a decline: when `outcomeIsUnknown` is true, inquire by the same merchant
 * reference before considering another money-moving request.
 */
export class EcrTerminal {
  readonly host: string;
  readonly serialNumber: string;
  readonly transport: EcrTransport;
  readonly config: Required<EcrConfig>;

  constructor(options: EcrTerminalOptions) {
    this.host = requireText(options.host, 'host');
    this.serialNumber = options.serialNumber?.trim() ?? '';
    this.transport = options.transport ?? 'wifi';
    this.config = normalizeConfig(options.config);
  }

  isReachable(): Promise<boolean> {
    if (!this.isIpTransport) return Promise.resolve(false);
    return nativeEcr.isReachable(this.request(newOperationId()));
  }

  sale(amount: string, options: EcrReferenceOptions = {}): Promise<EcrResult> {
    return this.startSale(amount, options).result;
  }

  startSale(
    amount: string,
    options: EcrReferenceOptions = {}
  ): EcrOperation<EcrResult> {
    return this.startResult('sale', {
      amount: requireAmount(amount),
      merchantReferenceId: requireReference(
        options.merchantReferenceId,
        'merchantReferenceId'
      ),
      operationId: options.operationId,
    });
  }

  voidTransaction(
    receiptNumber: string,
    options: EcrOriginalTransactionOptions = {}
  ): Promise<EcrResult> {
    return this.startVoid(receiptNumber, options).result;
  }

  startVoid(
    receiptNumber: string,
    options: EcrOriginalTransactionOptions = {}
  ): EcrOperation<EcrResult> {
    return this.startResult('voidTransaction', {
      receiptNumber: requireText(receiptNumber, 'receiptNumber'),
      originalTerminalId: options.originalTerminalId?.trim() ?? '',
      merchantReferenceId: requireReference(
        options.merchantReferenceId,
        'merchantReferenceId'
      ),
      operationId: options.operationId,
    });
  }

  refund(amount: string, options: EcrRefundOptions): Promise<EcrResult> {
    return this.startRefund(amount, options).result;
  }

  startRefund(
    amount: string,
    options: EcrRefundOptions
  ): EcrOperation<EcrResult> {
    return this.startResult('refund', {
      amount: requireAmount(amount),
      receiptNumber: requireText(options.receiptNumber, 'receiptNumber'),
      transactionDate: requireDate(options.transactionDate, true),
      originalTerminalId: options.originalTerminalId?.trim() ?? '',
      merchantReferenceId: requireReference(
        options.merchantReferenceId,
        'merchantReferenceId'
      ),
      operationId: options.operationId,
    });
  }

  inquire(options: EcrDatedTransactionOptions): Promise<EcrInquiry> {
    return this.startInquire(options).result;
  }

  startInquire(options: EcrDatedTransactionOptions): EcrOperation<EcrInquiry> {
    return this.startOperation(
      'inquire',
      {
        receiptNumber: requireText(options.receiptNumber, 'receiptNumber'),
        transactionDate: requireDate(options.transactionDate, true),
        originalTerminalId: options.originalTerminalId?.trim() ?? '',
        merchantReferenceId: requireReference(
          options.merchantReferenceId,
          'merchantReferenceId'
        ),
        operationId: options.operationId,
      },
      normalizeInquiry
    );
  }

  inquireByReference(
    originalMerchantReference: string,
    options: EcrInquiryByReferenceOptions = {}
  ): Promise<EcrInquiry> {
    return this.startInquireByReference(originalMerchantReference, options)
      .result;
  }

  startInquireByReference(
    originalMerchantReference: string,
    options: EcrInquiryByReferenceOptions = {}
  ): EcrOperation<EcrInquiry> {
    const originalReference = requireReference(
      originalMerchantReference,
      'originalMerchantReference'
    );
    requireText(originalReference, 'originalMerchantReference');
    return this.startOperation(
      'inquireByReference',
      {
        originalMerchantReference: originalReference,
        transactionDate: requireDate(options.transactionDate ?? '', false),
        originalTerminalId: options.originalTerminalId?.trim() ?? '',
        merchantReferenceId: requireReference(
          options.merchantReferenceId,
          'merchantReferenceId'
        ),
        operationId: options.operationId,
      },
      normalizeInquiry
    );
  }

  receipt(options: EcrDatedTransactionOptions): Promise<EcrReceipt> {
    return this.startReceipt(options).result;
  }

  startReceipt(options: EcrDatedTransactionOptions): EcrOperation<EcrReceipt> {
    return this.startOperation(
      'receipt',
      {
        receiptNumber: requireText(options.receiptNumber, 'receiptNumber'),
        transactionDate: requireDate(options.transactionDate, true),
        originalTerminalId: options.originalTerminalId?.trim() ?? '',
        merchantReferenceId: requireReference(
          options.merchantReferenceId,
          'merchantReferenceId'
        ),
        operationId: options.operationId,
      },
      normalizeReceipt
    );
  }

  private get isIpTransport(): boolean {
    return this.transport === 'ethernet' || this.transport === 'wifi';
  }

  private request(
    operationId: string,
    values: NativeRequest = {}
  ): NativeRequest {
    return {
      operationId: requireText(operationId, 'operationId'),
      host: this.host,
      serialNumber: this.serialNumber,
      transport: this.transport,
      config: this.config,
      ...values,
    };
  }

  private startResult(
    method: 'sale' | 'voidTransaction' | 'refund',
    values: NativeRequest
  ): EcrOperation<EcrResult> {
    return this.startOperation(method, values, normalizeResult);
  }

  private startOperation<T>(
    method:
      | 'sale'
      | 'voidTransaction'
      | 'refund'
      | 'inquire'
      | 'inquireByReference'
      | 'receipt',
    values: NativeRequest,
    normalize: (value: unknown) => T
  ): EcrOperation<T> {
    const suppliedId = values.operationId;
    const operationId =
      typeof suppliedId === 'string' && suppliedId.trim()
        ? suppliedId.trim()
        : newOperationId();
    const requestValues = { ...values };
    delete requestValues.operationId;
    const request = this.request(operationId, requestValues);
    const result = nativeEcr[method](request).then(normalize);
    return new EcrOperation(operationId, result, (id) => nativeEcr.cancel(id));
  }
}
