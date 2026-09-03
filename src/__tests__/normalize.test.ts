import { describe, expect, test } from '@jest/globals';

import {
  normalizeInquiry,
  normalizeReceipt,
  normalizeResult,
} from '../normalize';

describe('native outcome normalization', () => {
  test('keeps a normal decline distinct from an unknown outcome', () => {
    const decline = normalizeResult({
      outcome: 'declined',
      merchantReferenceId: 'ORDER-1',
      responseCode: '51',
      reason: 'Insufficient funds',
      nextStep: 'NONE',
      raw: '{}',
    });

    expect(decline.outcome).toBe('declined');
    expect(decline.outcomeIsUnknown).toBe(false);
  });

  test('marks response code 91 as unknown and requiring inquiry', () => {
    const decline = normalizeResult({
      outcome: 'declined',
      merchantReferenceId: 'ORDER-2',
      responseCode: '91',
      reason: 'Outcome unavailable',
      nextStep: 'INQUIRE_BY_MERCHANT_REFERENCE',
      raw: '{}',
    });

    expect(decline.outcomeIsUnknown).toBe(true);
    expect(decline.nextStep).toBe('INQUIRE_BY_MERCHANT_REFERENCE');
  });

  test('a recovered failed exchange is settled', () => {
    const result = normalizeResult({
      outcome: 'failed',
      merchantReferenceId: 'ORDER-3',
      failure: { kind: 'timeout', message: 'No answer' },
      recovered: {
        outcome: 'found',
        merchantReferenceId: 'INQUIRY-1',
        transaction: {
          transactionId: 'tx-1',
          stan: '1',
          type: 'Sale',
          status: 'Approved',
          amount: '1.234',
          totalAmount: '1.234',
          currency: 'OMR',
          transactionTime: '2026-09-02T12:00:00',
          maskedPan: '543173xxxx5785',
          cardHolderName: '',
          rrn: '123',
          authCode: 'A1',
          batchId: '1',
          terminalId: 'T1',
          isRefunded: false,
          canVoid: true,
          canRefund: true,
        },
        raw: '{}',
      },
    });

    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.settled).toBe(true);
      expect(result.outcomeIsUnknown).toBe(false);
      expect(result.failure.outcomeIsUnknown).toBe(true);
      expect(result.nextStep).toBe('NONE');
    }
  });

  test('unreachable is safe to retry because nothing was sent', () => {
    const result = normalizeResult({
      outcome: 'failed',
      merchantReferenceId: '',
      failure: { kind: 'unreachable', message: 'No listener' },
    });

    expect(result.outcomeIsUnknown).toBe(false);
    expect(result.nextStep).toBe('NONE');
  });

  test('a failed exchange with an unknown outcome requires inquiry', () => {
    const result = normalizeResult({
      outcome: 'failed',
      merchantReferenceId: 'ORDER-4',
      failure: { kind: 'connectionLost', message: 'Disconnected' },
    });

    expect(result.outcomeIsUnknown).toBe(true);
    expect(result.nextStep).toBe('INQUIRE_BY_MERCHANT_REFERENCE');
  });

  test('normalizes inquiry and receipt failures', () => {
    const inquiry = normalizeInquiry({
      outcome: 'failed',
      merchantReferenceId: 'I-1',
      failure: { kind: 'connectionLost', message: 'Disconnected' },
    });
    const receipt = normalizeReceipt({
      outcome: 'failed',
      merchantReferenceId: 'R-1',
      failure: { kind: 'unsupported', message: 'Unsupported' },
    });

    expect(inquiry.outcome).toBe('failed');
    expect(receipt.outcome).toBe('failed');
    if (inquiry.outcome === 'failed' && receipt.outcome === 'failed') {
      expect(inquiry.failure.outcomeIsUnknown).toBe(true);
      expect(receipt.failure.outcomeIsUnknown).toBe(false);
    }
  });
});
