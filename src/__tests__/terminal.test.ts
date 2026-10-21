import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../native', () => ({
  nativeEcr: {
    isReachable: jest.fn(),
    sale: jest.fn(),
    voidTransaction: jest.fn(),
    refund: jest.fn(),
    inquire: jest.fn(),
    inquireByReference: jest.fn(),
    signOn: jest.fn(),
    closeReceipt: jest.fn(),
    receipt: jest.fn(),
    cancel: jest.fn(),
  },
}));

import { EcrTerminal } from '../EcrTerminal';
import { nativeEcr } from '../native';

const mockNativeEcr = jest.mocked(nativeEcr);

/** Wi‑Fi signing placeholder (valid hex, not a real secret). */
const SECURE_HASH_KEY_ECR_WIFI = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** Web Service REST signing placeholder (valid hex, not a real secret). */
const SECURE_HASH_KEY_WEBSERVICE =
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const WEB_SERVICE_CONFIG = {
  merchantId: '13593',
  terminalId: '742001',
  environment: 'UAT',
  secureHashKey: SECURE_HASH_KEY_WEBSERVICE,
} as const;

const approved = {
  outcome: 'approved',
  merchantReferenceId: 'ORDER-1',
  amount: '1.234',
  responseCode: '00',
  rrn: '123',
  authCode: 'A1',
  maskedPan: '543173xxxx5785',
  partialApproval: false,
  requestedAmount: '',
  raw: '{}',
};

describe('EcrTerminal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeEcr.sale.mockResolvedValue(approved);
    mockNativeEcr.voidTransaction.mockResolvedValue(approved);
    mockNativeEcr.refund.mockResolvedValue(approved);
    mockNativeEcr.inquire.mockResolvedValue({
      outcome: 'notFound',
      merchantReferenceId: 'ORDER-1',
      reason: 'Not found',
      raw: '{}',
    });
    mockNativeEcr.inquireByReference.mockResolvedValue({
      outcome: 'notFound',
      merchantReferenceId: 'ORDER-1',
      reason: 'Not found',
      raw: '{}',
    });
    mockNativeEcr.receipt.mockResolvedValue({
      outcome: 'ready',
      merchantReferenceId: 'ORDER-1',
      url: 'https://receipt.example/1',
      raw: '{}',
    });
    mockNativeEcr.isReachable.mockResolvedValue(true);
    mockNativeEcr.cancel.mockResolvedValue(true);
    mockNativeEcr.signOn.mockResolvedValue({
      outcome: 'available',
      merchantReferenceId: 'CHECK-1',
      capabilities: { available: true, ecrMode: 2, permitted: [] },
      raw: '{}',
    });
  });

  test('sends decimal strings and caller references unchanged', async () => {
    const terminal = new EcrTerminal({
      host: '192.168.1.50',
      serialNumber: 'P653200085189',
      config: { secureHashKey: SECURE_HASH_KEY_ECR_WIFI },
    });

    const result = await terminal.sale('1.234', {
      merchantReferenceId: 'ORDER-1',
      operationId: 'operation-1',
    });

    expect(result.outcome).toBe('approved');
    expect(mockNativeEcr.sale).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'operation-1',
        host: '192.168.1.50',
        serialNumber: 'P653200085189',
        amount: '1.234',
        merchantReferenceId: 'ORDER-1',
      })
    );
  });

  test('exposes cancellation without pretending it reverses a payment', async () => {
    const terminal = new EcrTerminal({ host: '192.168.1.50' });
    const operation = terminal.startSale('1.000', {
      operationId: 'operation-2',
    });

    await expect(operation.cancel()).resolves.toBe(true);
    expect(operation.isCancelRequested).toBe(true);
    expect(mockNativeEcr.cancel).toHaveBeenCalledWith('operation-2');
  });

  test('forwards void, refund, inquiry and receipt fields to native code', async () => {
    const terminal = new EcrTerminal({ host: '192.168.1.50' });

    await terminal.voidTransaction('RECEIPT-1', {
      originalTerminalId: 'T1',
      merchantReferenceId: 'VOID-1',
    });
    await terminal.refund('1.234', {
      receiptNumber: 'RECEIPT-1',
      transactionDate: '20260902',
      originalTerminalId: 'T1',
      merchantReferenceId: 'REFUND-1',
    });
    await terminal.inquire({
      receiptNumber: 'RECEIPT-1',
      transactionDate: '20260902',
      merchantReferenceId: 'INQUIRY-1',
    });
    await terminal.inquireByReference('SALE-1', {
      transactionDate: '20260902',
      merchantReferenceId: 'INQUIRY-2',
    });
    await terminal.receipt({
      receiptNumber: 'RECEIPT-1',
      transactionDate: '20260902',
      merchantReferenceId: 'RECEIPT-CALL-1',
    });

    expect(mockNativeEcr.voidTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptNumber: 'RECEIPT-1',
        originalTerminalId: 'T1',
        merchantReferenceId: 'VOID-1',
      })
    );
    expect(mockNativeEcr.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '1.234',
        receiptNumber: 'RECEIPT-1',
        transactionDate: '20260902',
        merchantReferenceId: 'REFUND-1',
      })
    );
    expect(mockNativeEcr.inquire).toHaveBeenCalledWith(
      expect.objectContaining({ merchantReferenceId: 'INQUIRY-1' })
    );
    expect(mockNativeEcr.inquireByReference).toHaveBeenCalledWith(
      expect.objectContaining({
        originalMerchantReference: 'SALE-1',
        merchantReferenceId: 'INQUIRY-2',
      })
    );
    expect(mockNativeEcr.receipt).toHaveBeenCalledWith(
      expect.objectContaining({ merchantReferenceId: 'RECEIPT-CALL-1' })
    );
  });

  test('validates dates, references and numeric configuration before native code', () => {
    const terminal = new EcrTerminal({ host: '192.168.1.50' });

    expect(() =>
      terminal.refund('1.000', {
        receiptNumber: 'RECEIPT-1',
        transactionDate: '02-09-2026',
      })
    ).toThrow('yyyyMMdd');
    expect(() =>
      terminal.sale('1.000', { merchantReferenceId: 'ORDER WITH SPACES' })
    ).toThrow('cannot contain whitespace');
    expect(
      () =>
        new EcrTerminal({
          host: '192.168.1.50',
          config: { port: 70_000 },
        })
    ).toThrow('port must be between');
  });

  test('probes supported transports with normalized defaults', async () => {
    const terminal = new EcrTerminal({ host: '192.168.1.50' });

    await expect(terminal.isReachable()).resolves.toBe(true);
    expect(mockNativeEcr.isReachable).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '192.168.1.50',
        transport: 'wifi',
        config: expect.objectContaining({ port: 9100, currencyCode: '512' }),
      })
    );
  });

  test.each(['-1', '1e3', '1,234', '', '.5'])(
    'rejects unsafe amount format %s before native code',
    (amount) => {
      const terminal = new EcrTerminal({ host: '192.168.1.50' });
      expect(() => terminal.sale(amount)).toThrow('plain decimal amount');
      expect(mockNativeEcr.sale).not.toHaveBeenCalled();
    }
  );

  test('validates secrets without exposing the value in the error', () => {
    expect(
      () =>
        new EcrTerminal({
          host: '192.168.1.50',
          config: { secureHashKey: 'not-a-secret' },
        })
    ).toThrow('even-length hexadecimal string');
  });

  test('does not probe transports that have no local listener', async () => {
    for (const terminal of [
      new EcrTerminal({
        transport: 'webService',
        config: WEB_SERVICE_CONFIG,
      }),
      new EcrTerminal({ host: '192.168.1.50', transport: 'bluetooth' }),
      new EcrTerminal({ host: '192.168.1.50', transport: 'usbCable' }),
    ]) {
      await expect(terminal.isReachable()).resolves.toBe(false);
    }
    expect(mockNativeEcr.isReachable).not.toHaveBeenCalled();
  });

  test('drives a Web Service terminal without a host', async () => {
    const terminal = new EcrTerminal({
      serialNumber: 'P653200085189',
      transport: 'webService',
      config: WEB_SERVICE_CONFIG,
    });

    const result = await terminal.sale('1.234', {
      merchantReferenceId: 'ORDER-WS-1',
    });

    expect(result.outcome).toBe('approved');
    expect(mockNativeEcr.sale).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '',
        transport: 'webService',
        merchantReferenceId: 'ORDER-WS-1',
        config: expect.objectContaining({
          merchantId: '13593',
          terminalId: '742001',
          environment: 'UAT',
          secureHashKey: SECURE_HASH_KEY_WEBSERVICE,
        }),
      })
    );
  });

  test('refuses a Web Service terminal without its backend identifiers', () => {
    expect(
      () =>
        new EcrTerminal({
          transport: 'webService',
          config: { terminalId: '742001' },
        })
    ).toThrow('config.merchantId is required');
    expect(
      () =>
        new EcrTerminal({
          transport: 'webService',
          config: { merchantId: '13593' },
        })
    ).toThrow('config.terminalId is required');
  });

  test('USB cable and app to app do not need an address', async () => {
    const usb = new EcrTerminal({
      transport: 'usbCable',
      serialNumber: 'P653200085189',
      config: { secureHashKey: SECURE_HASH_KEY_ECR_WIFI },
    });
    const onDevice = new EcrTerminal({
      transport: 'appToApp',
      serialNumber: 'P653200085189',
      config: { secureHashKey: SECURE_HASH_KEY_ECR_WIFI },
    });
    expect(usb.host).toBe('');
    expect(onDevice.host).toBe('');
    await usb.signOn({ merchantReferenceId: 'CHECK-1' });
    expect(mockNativeEcr.signOn).toHaveBeenCalledWith(
      expect.objectContaining({ transport: 'usbCable' })
    );
  });

  test('still requires a host for the IP transports', () => {
    expect(() => new EcrTerminal({ transport: 'wifi' })).toThrow(
      'host is required'
    );
    expect(() => new EcrTerminal({})).toThrow('host is required');
  });

  test('normalizes and validates the environment name', () => {
    const terminal = new EcrTerminal({
      transport: 'webService',
      config: {
        ...WEB_SERVICE_CONFIG,
        environment: 'uat' as 'UAT',
      },
    });
    expect(terminal.config.environment).toBe('UAT');

    expect(
      () =>
        new EcrTerminal({
          transport: 'webService',
          config: {
            ...WEB_SERVICE_CONFIG,
            environment: 'STAGING' as 'UAT',
          },
        })
    ).toThrow('environment must be one of SIT, UAT, PROD');
  });
});
