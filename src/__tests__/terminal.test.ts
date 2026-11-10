import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';

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
    settlement: jest.fn(),
    printReceipt: jest.fn(),
    receipt: jest.fn(),
    cancel: jest.fn(),
  },
}));

import { EcrTerminal } from '../EcrTerminal';
import { ECR_PRINTER_WIDTH } from '../printImage';
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

const reachableProbe = {
  reachable: true,
  host: '192.168.1.50',
  port: 9100,
  endpoint: '192.168.1.50:9100',
};

describe('EcrTerminal', () => {
  beforeEach(() => {
    (Platform as { OS: string }).OS = 'android';
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
    mockNativeEcr.isReachable.mockResolvedValue(reachableProbe);
    mockNativeEcr.cancel.mockResolvedValue(true);
    mockNativeEcr.closeReceipt.mockResolvedValue({
      outcome: 'idle',
      merchantReferenceId: '',
      raw: '{}',
    });
    mockNativeEcr.printReceipt.mockResolvedValue({
      status: 'SUCCESSFUL',
      message: 'Printed',
      ok: true,
    });
    mockNativeEcr.settlement.mockResolvedValue({
      outcome: 'nothingToSettle',
      merchantReferenceId: '',
      message: 'Nothing to settle',
      raw: '{}',
    });
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
      merchantReference: 'ORDER-1',
      operationId: 'operation-1',
    });

    expect(result).toMatchObject({
      outcome: 'approved',
      merchantReference: 'ORDER-1',
    });
    expect(result).not.toHaveProperty('merchantReferenceId');
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
      merchantReference: 'VOID-1',
    });
    await terminal.refund('1.234', {
      receiptNumber: 'RECEIPT-1',
      transactionDate: '20260902',
      originalTerminalId: 'T1',
      merchantReference: 'REFUND-1',
    });
    await terminal.inquire({
      receiptNumber: 'RECEIPT-1',
      transactionDate: '20260902',
      merchantReference: 'INQUIRY-1',
    });
    await terminal.inquireByReference('SALE-1', {
      transactionDate: '20260902',
      merchantReference: 'INQUIRY-2',
    });
    await terminal.receipt({
      receiptNumber: 'RECEIPT-1',
      transactionDate: '20260902',
      merchantReference: 'RECEIPT-CALL-1',
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
      terminal.sale('1.000', { merchantReference: 'ORDER WITH SPACES' })
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

  test('probes USB and app to app through the native module', async () => {
    mockNativeEcr.isReachable.mockResolvedValue(reachableProbe);
    const usb = new EcrTerminal({
      transport: 'usbCable',
      serialNumber: 'SN1',
    });
    const onDevice = new EcrTerminal({
      transport: 'appToApp',
      serialNumber: 'SN1',
    });

    await expect(usb.isReachable()).resolves.toBe(true);
    await expect(onDevice.isReachable()).resolves.toBe(true);
    expect(mockNativeEcr.isReachable).toHaveBeenCalledTimes(2);
    expect(mockNativeEcr.isReachable).toHaveBeenCalledWith(
      expect.objectContaining({ transport: 'usbCable' })
    );
    expect(mockNativeEcr.isReachable).toHaveBeenCalledWith(
      expect.objectContaining({ transport: 'appToApp' })
    );
  });

  test('does not probe transports that have no local listener', async () => {
    for (const terminal of [
      new EcrTerminal({
        transport: 'webService',
        config: WEB_SERVICE_CONFIG,
      }),
      new EcrTerminal({ host: '192.168.1.50', transport: 'bluetooth' }),
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
      merchantReference: 'ORDER-WS-1',
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
    expect(onDevice.host).toBe('com.amwalpay.pos');
    await usb.signOn({ merchantReference: 'CHECK-1' });
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

  test('uses a 130s Web Service read timeout unless the caller set one', () => {
    const terminal = new EcrTerminal({
      transport: 'webService',
      config: WEB_SERVICE_CONFIG,
    });
    expect(terminal.config.responseTimeoutMs).toBe(130_000);

    const overridden = new EcrTerminal({
      transport: 'webService',
      config: { ...WEB_SERVICE_CONFIG, responseTimeoutMs: 90_000 },
    });
    expect(overridden.config.responseTimeoutMs).toBe(90_000);
  });

  test('close receipt on Web Service forwards the original reference', async () => {
    const terminal = new EcrTerminal({
      transport: 'webService',
      config: WEB_SERVICE_CONFIG,
    });
    const closed = await terminal.closeReceipt({
      originalMerchantReference: 'SALE-1',
    });
    expect(closed.outcome).toBe('idle');
    expect(mockNativeEcr.closeReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: 'webService',
        originalMerchantReference: 'SALE-1',
      })
    );
  });

  test('close receipt and settlement send nothing on an unsupported transport', async () => {
    const bluetooth = new EcrTerminal({
      transport: 'bluetooth',
      serialNumber: 'P653200085189',
    });
    const closed = await bluetooth.closeReceipt();
    const settlement = await bluetooth.settlement();
    expect(closed.outcome).toBe('failed');
    expect(settlement.outcome).toBe('failed');
    if (closed.outcome === 'failed') {
      expect(closed.failure.kind).toBe('unsupported');
    }
    expect(mockNativeEcr.closeReceipt).not.toHaveBeenCalled();
    expect(mockNativeEcr.settlement).not.toHaveBeenCalled();
  });

  test('print receipt is app to app only and requires a 384 px image', async () => {
    const wifi = new EcrTerminal({
      host: '192.168.1.50',
      transport: 'wifi',
    });
    const refused = await wifi.printReceipt(pngOfWidth(ECR_PRINTER_WIDTH));
    expect(refused.status).toBe('FAILED');
    expect(mockNativeEcr.printReceipt).not.toHaveBeenCalled();

    const onDevice = new EcrTerminal({
      transport: 'appToApp',
      config: { secureHashKey: SECURE_HASH_KEY_ECR_WIFI },
    });
    const narrow = await onDevice.printReceipt(pngOfWidth(200));
    expect(narrow.status).toBe('FAILED');
    expect(narrow.message).toContain('384');
    expect(mockNativeEcr.printReceipt).not.toHaveBeenCalled();

    const printed = await onDevice.printReceipt(pngOfWidth(ECR_PRINTER_WIDTH), {
      merchantReference: 'ORDER-1',
    });
    expect(printed).toEqual({
      status: 'SUCCESSFUL',
      message: 'Printed',
      ok: true,
    });
    expect(mockNativeEcr.printReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: 'appToApp',
        merchantReferenceId: 'ORDER-1',
        receiptImageBase64: expect.any(String),
      })
    );
  });

  test('settlement is sent on Wi-Fi, USB, app to app, and Web Service', async () => {
    const wifi = new EcrTerminal({
      host: '192.168.1.50',
      transport: 'wifi',
      config: { secureHashKey: SECURE_HASH_KEY_ECR_WIFI },
    });
    await wifi.settlement();
    expect(mockNativeEcr.settlement).toHaveBeenCalledWith(
      expect.objectContaining({ transport: 'wifi' })
    );
  });

  test('does not probe USB or app to app on iOS', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const usb = new EcrTerminal({ transport: 'usbCable', serialNumber: 'SN1' });
    const onDevice = EcrTerminal.appToApp({ serialNumber: 'SN1' });

    await expect(usb.probeReachability()).resolves.toMatchObject({
      reachable: false,
      endpoint: 'usbCable',
    });
    await expect(onDevice.isReachable()).resolves.toBe(false);
    expect(mockNativeEcr.isReachable).not.toHaveBeenCalled();
  });

  test('refuses Web Service receipt and sign-on before anything is sent', async () => {
    const terminal = new EcrTerminal({
      transport: 'webService',
      config: WEB_SERVICE_CONFIG,
    });
    const receipt = await terminal.receipt({
      receiptNumber: '1',
      transactionDate: '20260902',
    });
    const signOn = await terminal.signOn();
    expect(receipt.outcome).toBe('failed');
    expect(signOn.outcome).toBe('failed');
    expect(mockNativeEcr.receipt).not.toHaveBeenCalled();
    expect(mockNativeEcr.signOn).not.toHaveBeenCalled();
  });

  test('run sends a sale and refuses an inquiry', async () => {
    const terminal = new EcrTerminal({ host: '192.168.1.50' });
    await terminal.run('sale', {
      amount: '1.234',
      merchantReference: 'ORDER-1',
    });
    expect(mockNativeEcr.sale).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '1.234',
        merchantReferenceId: 'ORDER-1',
      })
    );
    expect(() => terminal.run('inquiry', { receiptNumber: '1' })).toThrow(
      'inquire()'
    );
    expect(() =>
      terminal.run('voidTransaction', { amount: '1.000', receiptNumber: '1' })
    ).toThrow('takes no amount');
  });

  test('app to app accepts only the Amwal payment app', () => {
    expect(EcrTerminal.appToApp().host).toBe('com.amwalpay.pos');
    expect(
      () =>
        new EcrTerminal({
          transport: 'appToApp',
          host: 'com.example.other',
        })
    ).toThrow('com.amwalpay.pos');
    expect(() => new EcrTerminal({ transport: 'ethernet' as 'wifi' })).toThrow(
      'transport must be'
    );
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

function pngOfWidth(width: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, 8);
  return bytes;
}
