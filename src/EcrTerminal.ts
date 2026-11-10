import { EcrOperation } from './EcrOperation';
import { nativeEcr } from './native';
import {
  normalizeReachability,
  normalizeInquiry,
  normalizeReceipt,
  normalizeReceiptClosed,
  normalizeResult,
  normalizePrint,
  normalizeSettlement,
  normalizeSignOn,
} from './normalize';
import { bytesToBase64, validatePrintImage } from './printImage';
import {
  ECR_TRANSACTION_TYPES,
  transactionTypeMovesMoney,
  type EcrTransactionTypeId,
} from './transactionType';
import {
  PAYMENT_APP_PACKAGE,
  hasReachabilityProbe as transportHasReachabilityProbe,
  isEcrTransport,
  isTransportSupported,
  supportsCloseReceipt as transportSupportsCloseReceipt,
  supportsReceipt as transportSupportsReceipt,
  supportsSettlement as transportSupportsSettlement,
  supportsSignOn as transportSupportsSignOn,
  unsupportedTransportMessage,
} from './transport';
import type {
  EcrCloseReceiptOptions,
  EcrConfig,
  EcrDatedTransactionOptions,
  EcrEnvironment,
  EcrFailure,
  EcrInquiry,
  EcrInquiryByReferenceOptions,
  EcrOriginalTransactionOptions,
  EcrPrintOutcome,
  EcrReachability,
  EcrReceipt,
  EcrReceiptClosed,
  EcrReferenceOptions,
  EcrRefundOptions,
  EcrResult,
  EcrRunOptions,
  EcrSettlement,
  EcrSignOn,
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
  merchantId: '',
  terminalId: '',
  environment: 'SIT',
};

const ENVIRONMENTS: readonly EcrEnvironment[] = ['SIT', 'UAT', 'PROD'];

/** Web Service read timeout when the caller left the Wi-Fi default of 120s. */
const WEB_SERVICE_RESPONSE_TIMEOUT_MS = 130_000;

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

function unsupportedFailure(message: string): EcrFailure {
  return { kind: 'unsupported', message, outcomeIsUnknown: false };
}

function unsupportedReceiptClosed(message: string): EcrReceiptClosed {
  return {
    outcome: 'failed',
    merchantReference: '',
    failure: unsupportedFailure(message),
  };
}

function failedPrint(message: string): EcrPrintOutcome {
  return { status: 'FAILED', message, ok: false };
}

function unsupportedSettlement(message: string): EcrSettlement {
  return {
    outcome: 'failed',
    merchantReference: '',
    failure: unsupportedFailure(message),
  };
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
  const environment = String(normalized.environment).toUpperCase();
  if (!ENVIRONMENTS.includes(environment as EcrEnvironment)) {
    throw new TypeError(
      `environment must be one of ${ENVIRONMENTS.join(', ')}.`
    );
  }
  normalized.environment = environment as EcrEnvironment;
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

  /**
   * The Amwal payment app on this device. `host` is not an address here:
   * the application that takes a payment is fixed.
   */
  static appToApp(
    options: { serialNumber?: string; config?: EcrConfig } = {}
  ): EcrTerminal {
    return new EcrTerminal({
      ...options,
      transport: 'appToApp',
      host: PAYMENT_APP_PACKAGE,
    });
  }

  constructor(options: EcrTerminalOptions) {
    const transport = options.transport ?? 'wifi';
    if (!isEcrTransport(transport)) {
      throw new TypeError(
        'transport must be wifi, usbCable, bluetooth, webService, or appToApp.'
      );
    }
    this.serialNumber = options.serialNumber?.trim() ?? '';
    this.transport = transport;
    this.config = normalizeConfig(options.config);
    if (
      this.transport === 'webService' &&
      this.config.responseTimeoutMs === DEFAULT_CONFIG.responseTimeoutMs
    ) {
      this.config = {
        ...this.config,
        responseTimeoutMs: WEB_SERVICE_RESPONSE_TIMEOUT_MS,
      };
    }
    if (this.transport === 'webService') {
      // The payment host addresses the terminal; there is no IP to dial.
      this.host = options.host?.trim() ?? '';
      requireText(this.config.merchantId, 'config.merchantId');
      requireText(this.config.terminalId, 'config.terminalId');
    } else if (this.transport === 'appToApp') {
      const host = options.host?.trim() ?? '';
      if (host && host !== PAYMENT_APP_PACKAGE) {
        throw new TypeError(
          `An app-to-app terminal is always ${PAYMENT_APP_PACKAGE}. Use ` +
            'EcrTerminal.appToApp rather than naming an application to pay into.'
        );
      }
      this.host = PAYMENT_APP_PACKAGE;
    } else if (
      this.transport === 'usbCable' ||
      this.transport === 'bluetooth'
    ) {
      this.host = options.host?.trim() ?? '';
    } else {
      this.host = requireText(options.host ?? '', 'host');
    }
  }

  /**
   * Asks the terminal what it is. Wi-Fi on Android and iOS. USB on Android.
   * Web Service, app to app, and Bluetooth answer with a failed sign-on and
   * send nothing. iOS has no cable channel, so USB answers unsupported there.
   */
  signOn(options: EcrReferenceOptions = {}): Promise<EcrSignOn> {
    return this.startSignOn(options).result;
  }

  startSignOn(options: EcrReferenceOptions = {}): EcrOperation<EcrSignOn> {
    if (!this.supportsSignOn) {
      return this.refused(options.operationId, {
        outcome: 'failed',
        merchantReference: '',
        failure: this.unsupportedFailure('Sign-on'),
      });
    }
    return this.startOperation(
      'signOn',
      {
        merchantReferenceId: requireReference(
          options.merchantReference,
          'merchantReference'
        ),
        operationId: options.operationId,
      },
      normalizeSignOn
    );
  }

  /**
   * Whether the terminal is there, before anything is sent.
   *
   * Wi-Fi proves the port answers. USB proves the cable is attached. App to
   * app proves the payment app on this device will accept a request. None of
   * them prove the terminal is idle. Web Service and Bluetooth answer `false`
   * without a probe. On iOS, USB and app to app also answer `false`: those
   * channels are Android only.
   */
  isReachable(): Promise<boolean> {
    return this.probeReachability().then((probe) => probe.reachable);
  }

  /**
   * Asks whether the terminal is there, and why it is not.
   * `error` carries what the link reported. A transport with no probe, or
   * one this OS cannot drive, answers immediately with `reachable: false`.
   */
  probeReachability(): Promise<EcrReachability> {
    const fallback = this.unreachableProbe();
    if (!this.hasReachabilityProbe || !this.isSupportedByPlugin) {
      return Promise.resolve(fallback);
    }
    return nativeEcr
      .isReachable(this.request(newOperationId()))
      .then((value) => normalizeReachability(value, fallback));
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
        options.merchantReference,
        'merchantReference'
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
        options.merchantReference,
        'merchantReference'
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
        options.merchantReference,
        'merchantReference'
      ),
      operationId: options.operationId,
    });
  }

  inquire(options: EcrDatedTransactionOptions): Promise<EcrInquiry> {
    return this.startInquire(options).result;
  }

  startInquire(options: EcrDatedTransactionOptions): EcrOperation<EcrInquiry> {
    if (!this.isSupportedByPlugin) {
      return this.refused(options.operationId, this.failedInquiry('Inquiry'));
    }
    return this.startOperation(
      'inquire',
      {
        receiptNumber: requireText(options.receiptNumber, 'receiptNumber'),
        transactionDate: requireDate(options.transactionDate, true),
        originalTerminalId: options.originalTerminalId?.trim() ?? '',
        merchantReferenceId: requireReference(
          options.merchantReference,
          'merchantReference'
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
    if (
      !transportHasReachabilityProbe(this.transport) &&
      this.transport !== 'webService'
    ) {
      return this.refused(
        options.operationId,
        this.failedInquiry('Inquiry by reference')
      );
    }
    return this.startOperation(
      'inquireByReference',
      {
        originalMerchantReference: originalReference,
        transactionDate: requireDate(options.transactionDate ?? '', false),
        originalTerminalId: options.originalTerminalId?.trim() ?? '',
        merchantReferenceId: requireReference(
          options.merchantReference,
          'merchantReference'
        ),
        operationId: options.operationId,
      },
      normalizeInquiry
    );
  }

  /**
   * Asks the terminal to leave its receipt and return to idle.
   *
   * Wi-Fi and USB send `CLOSE_RECEIPT`. Web Service posts `/Ecr/closeReceipt`
   * and needs `originalMerchantReference`, the sale, void, or refund. App to
   * app and Bluetooth answer `unsupported` and send nothing: app to app has
   * already closed the receipt.
   */
  closeReceipt(
    options: EcrCloseReceiptOptions = {}
  ): Promise<EcrReceiptClosed> {
    if (!this.supportsCloseReceipt) {
      return Promise.resolve(
        unsupportedReceiptClosed(
          unsupportedTransportMessage(this.transport, 'Closing the receipt')
        )
      );
    }
    return this.startOperation(
      'closeReceipt',
      {
        merchantReferenceId: requireReference(
          options.merchantReference,
          'merchantReference'
        ),
        originalMerchantReference: requireReference(
          options.originalMerchantReference,
          'originalMerchantReference'
        ),
        operationId: options.operationId,
      },
      normalizeReceiptClosed
    ).result;
  }

  /**
   * Settles the current batch. Confirm with the cashier first: the terminal
   * starts as soon as the request arrives.
   *
   * Wi-Fi, USB, app to app, and Web Service. Web Service posts `/Ecr/settle`.
   * iOS drives Wi-Fi and Web Service; USB and app to app answer unsupported
   * there. Bluetooth sends nothing.
   */
  settlement(options: EcrReferenceOptions = {}): Promise<EcrSettlement> {
    return this.startSettlement(options).result;
  }

  startSettlement(
    options: EcrReferenceOptions = {}
  ): EcrOperation<EcrSettlement> {
    if (!this.supportsSettlement) {
      return new EcrOperation(
        options.operationId?.trim() || newOperationId(),
        Promise.resolve(
          unsupportedSettlement(
            unsupportedTransportMessage(this.transport, 'Settlement')
          )
        ),
        async () => false
      );
    }
    return this.startOperation(
      'settlement',
      {
        merchantReferenceId: requireReference(
          options.merchantReference,
          'merchantReference'
        ),
        operationId: options.operationId,
      },
      normalizeSettlement
    );
  }

  /**
   * Asks the Amwal payment app to print a receipt image.
   *
   * App to app on Android only. Other transports, and iOS, answer `FAILED`
   * and send nothing. The image width must be 384 px and the encoded size
   * at most 15 MB. Build it from this operation's result.
   *
   * `status` and `message` stay separate. Show them on separate lines.
   */
  printReceipt(
    imagePng: Uint8Array,
    options: EcrReferenceOptions = {}
  ): Promise<EcrPrintOutcome> {
    const merchantReferenceId = requireReference(
      options.merchantReference,
      'merchantReference'
    );
    if (this.transport !== 'appToApp') {
      return Promise.resolve(
        failedPrint(
          'Print is only available over app to app. Nothing was sent.'
        )
      );
    }
    if (!this.isSupportedByPlugin) {
      return Promise.resolve(
        failedPrint(unsupportedTransportMessage(this.transport, 'Print'))
      );
    }
    const imageError = validatePrintImage(imagePng);
    if (imageError != null) {
      return Promise.resolve(failedPrint(imageError));
    }
    return this.startOperation(
      'printReceipt',
      {
        merchantReferenceId,
        receiptImageBase64: bytesToBase64(imagePng),
        operationId: options.operationId,
      },
      normalizePrint
    ).result;
  }

  receipt(options: EcrDatedTransactionOptions): Promise<EcrReceipt> {
    return this.startReceipt(options).result;
  }

  startReceipt(options: EcrDatedTransactionOptions): EcrOperation<EcrReceipt> {
    if (!this.supportsReceipt) {
      return this.refused(options.operationId, {
        outcome: 'failed',
        merchantReference: '',
        failure: this.unsupportedFailure('Receipt'),
      });
    }
    return this.startOperation(
      'receipt',
      {
        receiptNumber: requireText(options.receiptNumber, 'receiptNumber'),
        transactionDate: requireDate(options.transactionDate, true),
        originalTerminalId: options.originalTerminalId?.trim() ?? '',
        merchantReferenceId: requireReference(
          options.merchantReference,
          'merchantReference'
        ),
        operationId: options.operationId,
      },
      normalizeReceipt
    );
  }

  /** Sale, void, or refund chosen from a till menu. Inquiry and receipt use their own methods. */
  run(
    type: EcrTransactionTypeId,
    options: EcrRunOptions = {}
  ): Promise<EcrResult> {
    return this.startRun(type, options).result;
  }

  /** `run`, with a handle so it can be cancelled while it runs. */
  startRun(
    typeId: EcrTransactionTypeId,
    options: EcrRunOptions = {}
  ): EcrOperation<EcrResult> {
    const type = ECR_TRANSACTION_TYPES[typeId];
    if (!type || !transactionTypeMovesMoney(type)) {
      const name = type?.displayName ?? String(typeId);
      const via = typeId === 'inquiry' ? 'inquire()' : 'receipt()';
      throw new TypeError(
        `${name} reports on a transaction rather than performing one. Run it with ${via}.`
      );
    }
    if (type.requiresAmount && !options.amount?.trim()) {
      throw new TypeError(`${type.displayName} needs an amount`);
    }
    if (
      !type.requiresAmount &&
      options.amount != null &&
      options.amount !== ''
    ) {
      throw new TypeError(
        `${type.displayName} takes no amount — it returns exactly what the original took.`
      );
    }
    if (type.requiresOriginalStan && !options.receiptNumber?.trim()) {
      throw new TypeError(
        `${type.displayName} needs the original's receipt number`
      );
    }
    requireDate(options.transactionDate ?? '', type.requiresOriginalDate);
    const merchantReference = requireReference(
      options.merchantReference,
      'merchantReference'
    );
    if (type.id === 'sale') {
      return this.startSale(options.amount ?? '', {
        merchantReference,
        operationId: options.operationId,
      });
    }
    if (type.id === 'voidTransaction') {
      return this.startVoid(options.receiptNumber ?? '', {
        originalTerminalId: options.originalTerminalId,
        merchantReference,
        operationId: options.operationId,
      });
    }
    return this.startRefund(options.amount ?? '', {
      receiptNumber: options.receiptNumber ?? '',
      transactionDate: options.transactionDate ?? '',
      originalTerminalId: options.originalTerminalId,
      merchantReference,
      operationId: options.operationId,
    });
  }

  /** Wi-Fi and USB. Web Service, app to app, and Bluetooth do not sign on. */
  get supportsSignOn(): boolean {
    return transportSupportsSignOn(this.transport);
  }

  /** Wi-Fi, USB, and app to app. Web Service has no e-receipt. */
  get supportsReceipt(): boolean {
    return transportSupportsReceipt(this.transport);
  }

  /** Wi-Fi, USB, and Web Service. */
  get supportsCloseReceipt(): boolean {
    return transportSupportsCloseReceipt(this.transport);
  }

  /** Wi-Fi, USB, app to app, and Web Service. */
  get supportsSettlement(): boolean {
    return transportSupportsSettlement(this.transport);
  }

  /** Wi-Fi, USB, and app to app. Web Service and Bluetooth have nothing to ask. */
  get hasReachabilityProbe(): boolean {
    return transportHasReachabilityProbe(this.transport);
  }

  /** Wi-Fi and Web Service on both platforms. USB and app to app on Android only. */
  get isSupportedByPlugin(): boolean {
    return isTransportSupported(this.transport);
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
    if (!this.isSupportedByPlugin) {
      const name =
        method === 'sale'
          ? 'Sale'
          : method === 'voidTransaction'
            ? 'Void'
            : 'Refund';
      return this.refused(values.operationId, {
        outcome: 'failed',
        merchantReference: '',
        failure: this.unsupportedFailure(name),
        settled: false,
        outcomeIsUnknown: false,
        nextStep: 'NONE',
      });
    }
    return this.startOperation(method, values, normalizeResult);
  }

  private unsupportedFailure(operation: string): EcrFailure {
    return {
      kind: 'unsupported',
      message: unsupportedTransportMessage(this.transport, operation),
      outcomeIsUnknown: false,
    };
  }

  private failedInquiry(operation: string): EcrInquiry {
    return {
      outcome: 'failed',
      merchantReference: '',
      failure: this.unsupportedFailure(operation),
    };
  }

  private unreachableProbe(): EcrReachability {
    return {
      reachable: false,
      host: this.host,
      port: 0,
      endpoint: this.host || this.transport,
    };
  }

  private refused<T>(operationId: unknown, value: T): EcrOperation<T> {
    const id =
      typeof operationId === 'string' && operationId.trim()
        ? operationId.trim()
        : newOperationId();
    return new EcrOperation(id, Promise.resolve(value), async () => false);
  }

  private startOperation<T>(
    method:
      | 'sale'
      | 'voidTransaction'
      | 'refund'
      | 'inquire'
      | 'inquireByReference'
      | 'signOn'
      | 'closeReceipt'
      | 'settlement'
      | 'printReceipt'
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
