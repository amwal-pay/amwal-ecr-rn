import type {
  EcrFailure,
  EcrFailureKind,
  EcrInquiry,
  EcrPrintOutcome,
  EcrReachability,
  EcrReceipt,
  EcrReceiptClosed,
  EcrResult,
  EcrSettlement,
  EcrSettlementTotal,
  EcrSignOn,
} from './types';

type NativeRecord = Record<string, unknown>;

const knownFailures = new Set<EcrFailureKind>([
  'unreachable',
  'timeout',
  'malformed',
  'connectionLost',
  'unauthenticated',
  'cancelled',
  'unsupported',
]);

function record(value: unknown, label: string): NativeRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`The native ECR host returned an invalid ${label}.`);
  }
  return value as NativeRecord;
}

/** Native answers say `merchantReferenceId`. Callers see `merchantReference`. */
function withMerchantReference(raw: NativeRecord): NativeRecord {
  const merchantReference = String(
    raw.merchantReferenceId ?? raw.merchantReference ?? ''
  );
  const copy: NativeRecord = { ...raw, merchantReference };
  delete copy.merchantReferenceId;
  return copy;
}

export function normalizeReachability(
  value: unknown,
  fallback: EcrReachability
): EcrReachability {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...fallback,
      reachable: false,
      error:
        fallback.error ??
        'The host answered a reachability probe with nothing usable',
    };
  }
  const raw = value as NativeRecord;
  const host = raw.host == null ? fallback.host : String(raw.host);
  const port = Number(raw.port ?? fallback.port);
  const errorText = raw.error == null ? '' : String(raw.error).trim();
  const endpointText = raw.endpoint == null ? '' : String(raw.endpoint).trim();
  return {
    reachable: raw.reachable === true,
    host,
    port: Number.isFinite(port) ? port : 0,
    error: errorText ? errorText : undefined,
    endpoint:
      endpointText || (port > 0 ? `${host}:${port}` : host || fallback.endpoint),
  };
}

function failure(value: unknown): EcrFailure {
  const raw = record(value, 'failure');
  const rawKind = String(raw.kind ?? 'malformed');
  const kind = knownFailures.has(rawKind as EcrFailureKind)
    ? (rawKind as EcrFailureKind)
    : 'malformed';
  return {
    kind,
    message: String(
      raw.message ?? 'The native ECR host did not explain the failure.'
    ),
    outcomeIsUnknown: kind !== 'unreachable' && kind !== 'unsupported',
  };
}

export function normalizeInquiry(value: unknown): EcrInquiry {
  const raw = record(value, 'inquiry');
  switch (raw.outcome) {
    case 'found':
    case 'notFound':
      return withMerchantReference(raw) as unknown as EcrInquiry;
    case 'failed':
      return {
        ...withMerchantReference(raw),
        failure: failure(raw.failure),
      } as EcrInquiry;
    default:
      throw new Error(
        'The native ECR host returned an unknown inquiry outcome.'
      );
  }
}

export function normalizeSignOn(value: unknown): EcrSignOn {
  const raw = record(value, 'sign-on');
  switch (raw.outcome) {
    case 'available':
    case 'unavailable':
      return withMerchantReference(raw) as unknown as EcrSignOn;
    case 'failed':
      return {
        ...withMerchantReference(raw),
        failure: failure(raw.failure),
      } as EcrSignOn;
    default:
      throw new Error(
        'The native ECR host returned an unknown sign-on outcome.'
      );
  }
}

export function normalizeReceiptClosed(value: unknown): EcrReceiptClosed {
  const raw = record(value, 'close receipt');
  switch (raw.outcome) {
    case 'idle':
    case 'refused':
      return withMerchantReference(raw) as unknown as EcrReceiptClosed;
    case 'failed':
      return {
        ...withMerchantReference(raw),
        failure: failure(raw.failure),
      } as EcrReceiptClosed;
    default:
      throw new Error(
        'The native ECR host returned an unknown close-receipt outcome.'
      );
  }
}

function settlementTotal(value: unknown): EcrSettlementTotal {
  const raw = record(value, 'settlement total');
  return {
    count: Number(raw.count ?? 0),
    amount: String(raw.amount ?? '0'),
  };
}

export function normalizeSettlement(value: unknown): EcrSettlement {
  const raw = record(value, 'settlement');
  switch (raw.outcome) {
    case 'settled': {
      const totals: Record<string, EcrSettlementTotal> = {};
      const source = record(raw.totals ?? {}, 'settlement totals');
      for (const [type, total] of Object.entries(source)) {
        totals[type] = settlementTotal(total);
      }
      return { ...withMerchantReference(raw), totals } as EcrSettlement;
    }
    case 'nothingToSettle':
    case 'notSettled':
      return withMerchantReference(raw) as unknown as EcrSettlement;
    case 'failed':
      return {
        ...withMerchantReference(raw),
        failure: failure(raw.failure),
      } as EcrSettlement;
    default:
      throw new Error(
        'The native ECR host returned an unknown settlement outcome.'
      );
  }
}

export function normalizePrint(value: unknown): EcrPrintOutcome {
  const raw = record(value, 'print');
  const status = raw.status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'FAILED';
  return {
    status,
    message: String(raw.message ?? ''),
    ok: status === 'SUCCESSFUL',
  };
}

export function normalizeReceipt(value: unknown): EcrReceipt {
  const raw = record(value, 'receipt');
  switch (raw.outcome) {
    case 'ready':
    case 'unavailable':
      return withMerchantReference(raw) as unknown as EcrReceipt;
    case 'failed':
      return {
        ...withMerchantReference(raw),
        failure: failure(raw.failure),
      } as EcrReceipt;
    default:
      throw new Error(
        'The native ECR host returned an unknown receipt outcome.'
      );
  }
}

export function normalizeResult(value: unknown): EcrResult {
  const raw = record(value, 'transaction result');
  switch (raw.outcome) {
    case 'approved':
      return {
        ...withMerchantReference(raw),
        outcomeIsUnknown: false,
        nextStep: 'NONE',
      } as unknown as EcrResult;
    case 'declined': {
      const nextStep =
        raw.nextStep === 'INQUIRE_BY_MERCHANT_REFERENCE'
          ? 'INQUIRE_BY_MERCHANT_REFERENCE'
          : 'NONE';
      return {
        ...withMerchantReference(raw),
        nextStep,
        outcomeIsUnknown:
          raw.responseCode === '91' ||
          nextStep === 'INQUIRE_BY_MERCHANT_REFERENCE',
      } as unknown as EcrResult;
    }
    case 'failed': {
      const recovered = raw.recovered
        ? normalizeInquiry(raw.recovered)
        : undefined;
      const mappedFailure = failure(raw.failure);
      const settled = recovered?.outcome === 'found';
      const outcomeIsUnknown = mappedFailure.outcomeIsUnknown && !settled;
      return {
        ...withMerchantReference(raw),
        failure: mappedFailure,
        recovered,
        settled,
        outcomeIsUnknown,
        nextStep: outcomeIsUnknown ? 'INQUIRE_BY_MERCHANT_REFERENCE' : 'NONE',
      } as unknown as EcrResult;
    }
    default:
      throw new Error(
        'The native ECR host returned an unknown transaction outcome.'
      );
  }
}
