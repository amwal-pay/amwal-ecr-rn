import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'qrcode';
import type {
  EcrInquiry,
  EcrReceipt,
  EcrResult,
  EcrSettlement,
} from 'react-native-amwal-ecr';
import { countdownLabel, displayMessageFromRaw, readableTime } from './model';
import type { OperationId, SavedTerminal } from './model';
import { colors } from './theme';

export type Dialog =
  | {
      kind: 'result';
      result: EcrResult;
      operation: OperationId;
      terminal: SavedTerminal;
    }
  | {
      kind: 'inquiry';
      inquiry: EcrInquiry;
      terminal: SavedTerminal;
      receiptNumber: string;
      transactionDate: string;
      originalTerminalId: string;
      receipt?: EcrReceipt;
      fetching: boolean;
    }
  | {
      kind: 'failure';
      message: string;
      reference?: string;
      terminal?: SavedTerminal;
    }
  | {
      kind: 'settlement';
      settlement: EcrSettlement;
      terminal: SavedTerminal;
    };

export function ResultDialog({
  dialog,
  onDismiss,
  onInquire,
  onReceipt,
  onCloseReceipt,
  onPrint,
  onCancelFetch,
  wait,
}: {
  dialog: Dialog | null;
  onDismiss: () => void;
  onInquire: (reference: string) => void;
  onReceipt: () => void;
  onCloseReceipt?: () => void;
  onPrint?: () => void;
  onCancelFetch?: () => void;
  wait?: { remaining: number; total: number } | null;
}) {
  const content = useMemo(() => (dialog ? present(dialog) : null), [dialog]);
  if (!dialog || !content) return null;

  return (
    <Modal animationType="fade" onRequestClose={onDismiss} transparent visible>
      <View style={styles.scrim}>
        <Pressable
          accessibilityLabel="Dismiss result"
          style={styles.backdrop}
          onPress={onDismiss}
        />
        <View style={styles.dialog}>
          <OutcomeMark positive={content.positive} />
          <Text
            style={[
              styles.headline,
              { color: content.positive ? colors.approved : colors.declined },
            ]}
          >
            {content.headline}
          </Text>
          <ScrollView style={styles.scroll}>
            <View style={styles.copy}>
              {content.amount ? (
                <View style={styles.amountRow}>
                  <Text style={styles.omr}>OMR</Text>
                  <Text style={styles.amount}>{content.amount}</Text>
                </View>
              ) : null}
              {content.message ? (
                <Text style={styles.message}>{content.message}</Text>
              ) : null}
              {content.fields.map((field) => (
                <View key={field.label} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <Text style={styles.fieldValue}>{field.value}</Text>
                </View>
              ))}
              {dialog.kind === 'inquiry' ? (
                <ReceiptSection
                  fetching={dialog.fetching}
                  onCancel={onCancelFetch}
                  onRequest={onReceipt}
                  receipt={dialog.receipt}
                  wait={wait}
                />
              ) : null}
              {dialog.kind === 'failure' && dialog.reference ? (
                <View>
                  <Text style={styles.warning}>
                    The transaction may have completed. Check before taking
                    payment again — sending it a second time would charge the
                    cardholder twice.
                  </Text>
                  <Pressable
                    onPress={() => onInquire(dialog.reference!)}
                    style={styles.outlined}
                  >
                    <Text style={styles.outlinedText}>
                      Inquire by reference
                    </Text>
                  </Pressable>
                  <Text style={styles.reference}>{dialog.reference}</Text>
                </View>
              ) : null}
              {content.raw ? <RawSection raw={content.raw} /> : null}
            </View>
          </ScrollView>
          {onPrint ? (
            <Pressable onPress={onPrint} style={styles.outlined}>
              <Text style={styles.outlinedText}>Print receipt</Text>
            </Pressable>
          ) : null}
          {onCloseReceipt ? (
            <Pressable onPress={onCloseReceipt} style={styles.outlined}>
              <Text style={styles.outlinedText}>Close receipt</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDismiss} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const SETTLEMENT_TYPE_LABELS: Record<string, string> = {
  SALE: 'Sales',
  REFUND: 'Refunds',
  VOID: 'Voids',
  PRE_AUTH: 'Pre-auths',
  CAPTURE: 'Captures',
};

function settlementTypeLabel(type: string): string {
  return SETTLEMENT_TYPE_LABELS[type] ?? type;
}

function readableWireTime(value: string): string {
  if (value.length !== 14) return value;
  return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)} ${value.slice(8, 10)}:${value.slice(10, 12)}`;
}

function present(dialog: Dialog): {
  headline: string;
  positive: boolean;
  amount: string;
  message: string | null;
  fields: Array<{ label: string; value: string }>;
  raw: string | null;
} {
  if (dialog.kind === 'settlement') {
    const settlement = dialog.settlement;
    if (settlement.outcome === 'settled') {
      return {
        headline: 'Settled',
        positive: true,
        amount: settlement.netAmount,
        message: settlement.batchId
          ? `Batch ${settlement.batchId} is closed`
          : null,
        fields: [
          {
            label: 'Transactions',
            value: String(settlement.totalTransactions),
          },
          ...Object.entries(settlement.totals).map(([type, total]) => ({
            label: `${settlementTypeLabel(type)} × ${total.count}`,
            value: total.amount,
          })),
          ...(settlement.endTime
            ? [
                {
                  label: 'Closed at',
                  value: readableWireTime(settlement.endTime),
                },
              ]
            : []),
        ],
        raw: settlement.raw || null,
      };
    }
    if (settlement.outcome === 'nothingToSettle') {
      return {
        headline: 'Nothing to settle',
        positive: true,
        amount: '',
        message: settlement.message,
        fields: [],
        raw: settlement.raw || null,
      };
    }
    if (settlement.outcome === 'notSettled') {
      return {
        headline: 'Not settled',
        positive: false,
        amount: '',
        message: settlement.reason,
        fields: [
          settlement.status
            ? { label: 'Status', value: settlement.status }
            : null,
          settlement.responseCode
            ? { label: 'Code', value: settlement.responseCode }
            : null,
          settlement.uploadedTransactions != null
            ? {
                label: 'Uploaded',
                value: String(settlement.uploadedTransactions),
              }
            : null,
        ].filter((field): field is { label: string; value: string } =>
          Boolean(field)
        ),
        raw: settlement.raw || null,
      };
    }
    return {
      headline: 'Not completed',
      positive: false,
      amount: '',
      message: settlement.failure.message,
      fields: [],
      raw: null,
    };
  }
  if (dialog.kind === 'failure') {
    return {
      headline: 'Not completed',
      positive: false,
      amount: '',
      message: dialog.message,
      fields: [],
      raw: null,
    };
  }
  if (dialog.kind === 'result') {
    const result = dialog.result;
    if (result.outcome === 'approved') {
      return {
        headline: result.partialApproval ? 'Partially approved' : 'Approved',
        positive: true,
        amount: result.amount,
        message: result.partialApproval
          ? `Only ${result.amount} of ${result.requestedAmount} was approved. Collect the difference by another means.`
          : null,
        fields: [
          dialog.operation === 'void'
            ? null
            : { label: 'Auth code', value: result.authCode },
          { label: 'Card', value: result.maskedPan },
        ].filter((field): field is { label: string; value: string } =>
          Boolean(field?.value)
        ),
        raw: result.raw || null,
      };
    }
    if (result.outcome === 'declined') {
      return {
        headline: 'Declined',
        positive: false,
        amount: '',
        message: displayMessageFromRaw(result.raw, result.reason),
        fields: [],
        raw: result.raw || null,
      };
    }
    return {
      headline: 'Not completed',
      positive: false,
      amount: '',
      message: result.failure.message,
      fields: [],
      raw: null,
    };
  }

  const inquiry = dialog.inquiry;
  if (inquiry.outcome === 'notFound') {
    return {
      headline: 'Not found',
      positive: false,
      amount: '',
      message: displayMessageFromRaw(inquiry.raw, inquiry.reason),
      fields: [],
      raw: inquiry.raw || null,
    };
  }
  if (inquiry.outcome === 'failed') {
    return {
      headline: 'Not completed',
      positive: false,
      amount: '',
      message: inquiry.failure.message,
      fields: [],
      raw: null,
    };
  }
  const txn = inquiry.transaction;
  const settled = txn.status.toLowerCase() === 'approved';
  const partial = settled && txn.partialApproval;
  return {
    headline: partial ? 'Partially approved' : txn.status || 'Found',
    positive: settled,
    amount: partial ? txn.authorizedAmount : txn.amount,
    message: partial
      ? `Only ${txn.authorizedAmount} of ${txn.amount} was approved. Collect the difference by another means.`
      : settled
        ? null
        : displayMessageFromRaw(inquiry.raw, txn.status),
    fields: [
      { label: 'Receipt number', value: txn.stan },
      { label: 'Type', value: txn.type },
      { label: 'Card', value: txn.maskedPan },
      {
        label: 'Date/Time',
        value: txn.transactionTime ? readableTime(txn.transactionTime) : '',
      },
    ].filter((field) => field.value),
    raw: inquiry.raw || null,
  };
}

function ReceiptSection({
  receipt,
  fetching,
  onRequest,
  onCancel,
  wait,
}: {
  receipt?: EcrReceipt;
  fetching: boolean;
  onRequest: () => void;
  onCancel?: () => void;
  wait?: { remaining: number; total: number } | null;
}) {
  if (fetching) {
    const progress =
      !wait || wait.total <= 0
        ? 0
        : Math.min(1, Math.max(0, wait.remaining / wait.total));
    return (
      <View>
        <View style={styles.receiptRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <View style={styles.countdownCopy}>
            <Text style={styles.fieldValue}>Fetching the receipt…</Text>
            {wait ? (
              <>
                <Text style={styles.countdown}>
                  {countdownLabel(wait.remaining)}
                </Text>
                <Text style={styles.countdownHint}>
                  remaining of {wait.total} s timeout
                </Text>
                <View style={styles.track}>
                  <View
                    style={[styles.trackFill, { width: `${progress * 100}%` }]}
                  />
                </View>
              </>
            ) : null}
          </View>
        </View>
        {onCancel ? (
          <Pressable onPress={onCancel} style={styles.outlined}>
            <Text style={styles.outlinedText}>Cancel operation</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (!receipt) {
    return (
      <Pressable onPress={onRequest} style={styles.outlined}>
        <Text style={styles.outlinedText}>QR receipt</Text>
      </Pressable>
    );
  }
  if (receipt.outcome === 'ready') {
    return (
      <View style={styles.receiptBlock}>
        <Text style={styles.fieldValue}>Scan for the receipt</Text>
        <QrView value={receipt.url} />
      </View>
    );
  }
  if (receipt.outcome === 'unavailable') {
    return (
      <Text style={styles.error}>
        {receipt.reason || 'No receipt is available for this transaction'}
      </Text>
    );
  }
  return <Text style={styles.error}>{receipt.failure.message}</Text>;
}

function RawSection({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={styles.rawRow}>
        <Pressable onPress={() => setOpen((current) => !current)}>
          <Text style={styles.closeText}>
            {open ? 'Hide raw response' : 'Show raw response'}
          </Text>
        </Pressable>
        {open ? (
          <Pressable
            accessibilityLabel="Copy raw JSON"
            onPress={() => {
              Share.share({ message: raw }).catch(() => undefined);
            }}
          >
            <Text style={styles.copyIcon}>⧉</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <Text selectable style={styles.raw}>
          {raw}
        </Text>
      ) : null}
    </View>
  );
}

function OutcomeMark({ positive }: { positive: boolean }) {
  const color = positive ? colors.approved : colors.declined;
  return (
    <View style={[styles.mark, { borderColor: color }]}>
      <Text style={[styles.markGlyph, { color }]}>{positive ? '✓' : '✕'}</Text>
    </View>
  );
}

function QrView({ value }: { value: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const cells = [];
    for (let x = 0; x < size; x += 1) {
      cells.push(
        <View
          key={`${x}-${y}`}
          style={qr.modules.get(x, y) ? styles.qrCellOn : styles.qrCellOff}
        />
      );
    }
    rows.push(
      <View key={y} style={styles.qrRow}>
        {cells}
      </View>
    );
  }
  return <View style={styles.qr}>{rows}</View>;
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    maxHeight: '86%',
    maxWidth: 420,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 24,
    width: '100%',
  },
  mark: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 32,
    borderWidth: 3,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  markGlyph: { fontSize: 32, fontWeight: '700' },
  headline: {
    fontSize: 24,
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },
  scroll: { flexGrow: 0, marginTop: 8 },
  copy: { gap: 8, paddingBottom: 8 },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  omr: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  amount: { color: colors.onSurface, fontSize: 22 },
  message: { color: colors.onSurface, fontSize: 14, textAlign: 'center' },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { color: colors.onSurfaceVariant, fontSize: 12 },
  fieldValue: { color: colors.onSurface, fontSize: 14 },
  warning: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 8 },
  outlined: {
    alignItems: 'center',
    borderColor: colors.outline,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 10,
  },
  outlinedText: { color: colors.primary, fontWeight: '600' },
  reference: {
    color: colors.onSurfaceVariant,
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 4,
  },
  receiptRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  countdownCopy: { flex: 1, gap: 2 },
  countdown: {
    color: colors.primary,
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '600',
  },
  countdownHint: { color: colors.onSurfaceVariant, fontSize: 12 },
  track: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: 2,
    height: 4,
    marginTop: 4,
    overflow: 'hidden',
  },
  trackFill: { backgroundColor: colors.primary, height: 4 },
  receiptBlock: { alignItems: 'center', gap: 8, marginTop: 8 },
  error: { color: colors.error, fontSize: 12 },
  rawRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  close: { alignSelf: 'flex-end', padding: 12 },
  closeText: { color: colors.primary, fontWeight: '600' },
  copyIcon: { color: colors.onSurfaceVariant, fontSize: 18, padding: 8 },
  raw: { color: colors.onSurface, fontFamily: 'monospace', fontSize: 11 },
  qr: { backgroundColor: '#fff', padding: 8 },
  qrRow: { flexDirection: 'row' },
  qrCellOn: { backgroundColor: colors.onSurface, height: 4, width: 4 },
  qrCellOff: { backgroundColor: '#fff', height: 4, width: 4 },
});
