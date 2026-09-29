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
import type { EcrInquiry, EcrReceipt, EcrResult } from 'react-native-amwal-ecr';
import { readableTime } from './model';
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
    };

export function ResultDialog({
  dialog,
  onDismiss,
  onInquire,
  onReceipt,
}: {
  dialog: Dialog | null;
  onDismiss: () => void;
  onInquire: (reference: string) => void;
  onReceipt: () => void;
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
                  onRequest={onReceipt}
                  receipt={dialog.receipt}
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
          <Pressable onPress={onDismiss} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function present(dialog: Dialog): {
  headline: string;
  positive: boolean;
  amount: string;
  message: string | null;
  fields: Array<{ label: string; value: string }>;
  raw: string | null;
} {
  if (dialog.kind === 'failure') {
    return {
      headline: dialog.reference ? 'Outcome unknown' : 'Not completed',
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
        message: result.reason,
        fields: [],
        raw: result.raw || null,
      };
    }
    return {
      headline: result.outcomeIsUnknown ? 'Outcome unknown' : 'Not completed',
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
      message: inquiry.reason,
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
        : txn.status,
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
}: {
  receipt?: EcrReceipt;
  fetching: boolean;
  onRequest: () => void;
}) {
  if (fetching) {
    return (
      <View style={styles.receiptRow}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.fieldValue}>Fetching the receipt…</Text>
      </View>
    );
  }
  if (!receipt) {
    return (
      <Pressable onPress={onRequest} style={styles.outlined}>
        <Text style={styles.outlinedText}>▦ QR receipt</Text>
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
