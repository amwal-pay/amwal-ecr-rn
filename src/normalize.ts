import type {
  EcrFailure,
  EcrFailureKind,
  EcrInquiry,
  EcrReceipt,
  EcrResult,
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
      return raw as unknown as EcrInquiry;
    case 'failed':
      return { ...raw, failure: failure(raw.failure) } as EcrInquiry;
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
      return raw as unknown as EcrSignOn;
    case 'failed':
      return { ...raw, failure: failure(raw.failure) } as EcrSignOn;
    default:
      throw new Error('The native ECR host returned an unknown sign-on outcome.');
  }
}

export function normalizeReceipt(value: unknown): EcrReceipt {
  const raw = record(value, 'receipt');
  switch (raw.outcome) {
    case 'ready':
    case 'unavailable':
      return raw as unknown as EcrReceipt;
    case 'failed':
      return { ...raw, failure: failure(raw.failure) } as EcrReceipt;
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
        ...raw,
        outcomeIsUnknown: false,
        nextStep: 'NONE',
      } as unknown as EcrResult;
    case 'declined': {
      const nextStep =
        raw.nextStep === 'INQUIRE_BY_MERCHANT_REFERENCE'
          ? 'INQUIRE_BY_MERCHANT_REFERENCE'
          : 'NONE';
      return {
        ...raw,
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
        ...raw,
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
