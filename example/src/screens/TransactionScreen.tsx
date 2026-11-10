import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import {
  EcrOperation,
  EcrTerminal,
  hasReachabilityProbe,
  supportsCloseReceipt,
  supportsSettlement,
  type EcrApproved,
  type EcrReceiptClosed,
  type EcrTerminalCapabilities,
} from 'react-native-amwal-ecr';
import {
  DateField,
  Dropdown,
  FormScroll,
  LabeledSwitch,
  OutlinedField,
  PrimaryButton,
  Screen,
  SecondaryButton,
  TerminalStatus,
} from '../chrome';
import {
  amountError,
  asksSignOn,
  countdownLabel,
  formatAmount,
  keyedDigits,
  merchantReferenceError,
  modeOf,
  operationsFor,
  responseTimeoutSeconds,
  terminalPlan,
  wireDate,
  unreachableMessage,
  type AppSettings,
  type OperationId,
  type SavedTerminal,
} from '../model';
import { receiptPng } from '../receiptPng';
import { ResultDialog, type Dialog } from '../ResultDialog';
import type { SignOnView } from '../signOn';
import { colors } from '../theme';

export function TransactionScreen({
  terminals,
  settings,
  selectedSerial,
  signOn,
  onSelect,
  onRefresh,
  onOpenTerminals,
  open,
  onProfile,
}: {
  terminals: SavedTerminal[];
  settings: AppSettings;
  selectedSerial: string | null;
  signOn: SignOnView | undefined;
  onSelect: (terminal: SavedTerminal) => void;
  onRefresh: (terminal: SavedTerminal) => Promise<void>;
  onOpenTerminals: () => void;
  open: (terminal: SavedTerminal) => EcrTerminal;
  onProfile: (serial: string, capabilities: EcrTerminalCapabilities) => void;
}) {
  const terminal = terminals.find(
    (item) => item.serialNumber === selectedSerial
  );
  const profile = terminal && asksSignOn(terminal) ? signOn : undefined;
  const operations = operationsFor(terminal, profile);
  const [operation, setOperation] = useState<OperationId>('sale');
  const active =
    operations.find((item) => item.id === operation) ?? operations[0]!;
  const [digits, setDigits] = useState('');
  const [merchantReference, setMerchantReference] = useState('');
  const [lookUpByReference, setLookUpByReference] = useState(false);
  const [originalReference, setOriginalReference] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [originalDate, setOriginalDate] = useState(() => new Date());
  const [wait, setWait] = useState<Wait | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const epochRef = useRef(0);
  const flightRef = useRef<EcrOperation<unknown> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fallback = operations[0];
    if (fallback && !operations.some((item) => item.id === operation)) {
      chooseType(fallback.id);
    }
    // Reset only when the permitted set drops the current choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations.map((item) => item.id).join('|')]);

  useEffect(() => {
    if (terminal && asksSignOn(terminal) && signOn == null) {
      onSelect(terminal);
    }
    // Ask once when this terminal becomes the selection. Web Service has no
    // sign-on, and app to app would open the payment app unasked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal?.serialNumber]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const chooseType = (id: OperationId) => {
    setOperation(id);
    setDigits('');
    setMerchantReference('');
    setLookUpByReference(false);
    setOriginalReference('');
    setReceiptNumber('');
    setOriginalDate(new Date());
    setErrors({});
  };

  const showReceipt =
    active.requiresStan && !(active.id === 'inquiry' && lookUpByReference);
  const showDate =
    active.requiresDate && !(active.id === 'inquiry' && lookUpByReference);
  const plan = terminal ? terminalPlan(terminal, settings) : null;
  const busy = wait != null && wait.kind !== 'fetching';

  const stopWait = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setWait(null);
  };

  const startWait = (kind: Wait['kind'], total: number, reset: boolean) => {
    setWait((current) => ({
      kind,
      total,
      remaining: reset || current == null ? total : current.remaining,
    }));
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setWait((current) => {
        if (current == null) return current;
        return { ...current, remaining: Math.max(0, current.remaining - 1) };
      });
    }, 1000);
  };

  const send = async () => {
    if (!terminal || busy) return;
    const next: FieldErrors = {
      amount: amountError(digits, active.requiresAmount),
      merchantReference:
        active.id === 'sale' ? merchantReferenceError(merchantReference) : null,
      originalReference:
        active.id === 'inquiry' &&
        lookUpByReference &&
        !originalReference.trim()
          ? 'Enter the reference the transaction was sent with'
          : null,
      receiptNumber:
        showReceipt && !receiptNumber.trim()
          ? 'Enter the receipt number of the transaction to act on'
          : null,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const epoch = ++epochRef.current;
    const session = open(terminal);
    const timeout = responseTimeoutSeconds(terminal);
    const current = () => epoch === epochRef.current;
    try {
      const probes = hasReachabilityProbe(terminal.transport);
      if (probes) {
        startWait('checking', timeout, true);
        const probe = await session.probeReachability();
        if (!current()) return;
        if (!probe.reachable) {
          setDialog({
            kind: 'failure',
            message: unreachableMessage(terminal, probe),
            terminal,
          });
          return;
        }
      } else {
        startWait('waiting', timeout, true);
      }
      if (
        asksSignOn(terminal) &&
        (signOn == null || signOn.kind === 'noAnswer')
      ) {
        await onRefresh(terminal);
        if (!current()) return;
      }
      startWait('waiting', timeout, !probes);

      if (active.id === 'inquiry') {
        const operation = lookUpByReference
          ? session.startInquireByReference(originalReference.trim())
          : session.startInquire({
              receiptNumber: receiptNumber.trim(),
              transactionDate: wireDate(originalDate),
            });
        flightRef.current = operation;
        const inquiry = await operation.result;
        if (!current()) return;
        if (inquiry.outcome === 'failed') {
          setDialog({
            kind: 'failure',
            message: inquiry.failure.message,
            terminal,
          });
          return;
        }
        setDialog({
          kind: 'inquiry',
          inquiry,
          terminal,
          receiptNumber: lookUpByReference ? '' : receiptNumber.trim(),
          transactionDate: lookUpByReference ? '' : wireDate(originalDate),
          originalTerminalId: '',
          fetching: false,
        });
        return;
      }

      const operation =
        active.id === 'sale'
          ? session.startSale(formatAmount(digits), {
              merchantReference: merchantReference.trim(),
            })
          : active.id === 'void'
            ? session.startVoid(receiptNumber.trim())
            : session.startRefund(formatAmount(digits), {
                receiptNumber: receiptNumber.trim(),
                transactionDate: wireDate(originalDate),
              });
      flightRef.current = operation;
      const result = await operation.result;
      if (!current()) return;
      if (
        result.outcome === 'declined' &&
        result.capabilities &&
        terminal.transport !== 'appToApp'
      ) {
        onProfile(terminal.serialNumber, result.capabilities);
      }
      if (
        result.outcome === 'failed' &&
        result.recovered?.outcome === 'found'
      ) {
        setDialog({
          kind: 'inquiry',
          inquiry: result.recovered,
          terminal,
          receiptNumber: '',
          transactionDate: '',
          originalTerminalId: '',
          fetching: false,
        });
        return;
      }
      if (result.outcome === 'failed' && result.outcomeIsUnknown) {
        setDialog({
          kind: 'failure',
          message: result.failure.message,
          reference: result.merchantReference,
          terminal,
        });
        return;
      }
      if (result.outcome === 'failed') {
        setDialog({
          kind: 'failure',
          message: result.failure.message,
          terminal,
        });
        return;
      }
      setDialog({ kind: 'result', result, operation: active.id, terminal });
    } catch (error) {
      if (!current()) return;
      setDialog({
        kind: 'failure',
        message: error instanceof Error ? error.message : String(error),
        terminal,
      });
    } finally {
      if (current()) {
        flightRef.current = null;
        stopWait();
      }
    }
  };

  const clearEntry = () => {
    setDigits('');
    setMerchantReference('');
    setOriginalReference('');
    setErrors({});
  };

  const dismiss = () => {
    setDialog(null);
    clearEntry();
  };

  const canCloseReceipt =
    terminal != null && supportsCloseReceipt(terminal.transport);

  const canSettle =
    terminal != null &&
    supportsSettlement(terminal.transport) &&
    plan?.ready === true;

  const closeTerminalReceipt = async () => {
    if (!terminal || !canCloseReceipt) return;
    let original = '';
    if (terminal.transport === 'webService') {
      if (
        dialog?.kind === 'result' &&
        (dialog.operation === 'sale' ||
          dialog.operation === 'void' ||
          dialog.operation === 'refund')
      ) {
        original = dialog.result.merchantReference;
      }
      if (!original.trim()) {
        Alert.alert(
          'Close receipt',
          'Close receipt needs the sale / void / refund reference'
        );
        return;
      }
    }
    try {
      const closed = await open(terminal).closeReceipt({
        originalMerchantReference: original,
      });
      Alert.alert('Close receipt', closeReceiptMessage(closed));
    } catch (error) {
      Alert.alert(
        'Close receipt',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const printReceipt = async () => {
    if (
      !terminal ||
      terminal.transport !== 'appToApp' ||
      dialog?.kind !== 'result' ||
      dialog.result.outcome !== 'approved'
    ) {
      return;
    }
    const approved = dialog.result;
    try {
      const outcome = await open(terminal).printReceipt(
        receiptPng(receiptLines(approved, dialog.operation)),
        { merchantReference: approved.merchantReference }
      );
      const detail = outcome.message.trim();
      Alert.alert(
        'Print receipt',
        detail ? `${outcome.status}\n\n${detail}` : outcome.status
      );
    } catch (error) {
      Alert.alert(
        'FAILED',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const confirmSettlement = () => {
    if (!terminal || !canSettle) return;
    Alert.alert(
      'Manual settlement',
      `Settle ${terminal.name} now? It closes the current batch and prints the settlement receipt.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle',
          onPress: () => {
            settle().catch(() => undefined);
          },
        },
      ]
    );
  };

  const cancelOperation = () => {
    const fetching = dialog?.kind === 'inquiry' && dialog.fetching;
    if (wait == null && !fetching) return;
    epochRef.current += 1;
    const flight = flightRef.current;
    flightRef.current = null;
    flight?.cancel().catch(() => undefined);
    stopWait();
    if (fetching && dialog?.kind === 'inquiry') {
      setDialog({ ...dialog, fetching: false });
      return;
    }
    setDialog({
      kind: 'failure',
      message: 'Operation cancelled',
      terminal,
    });
  };

  const settle = async () => {
    if (!terminal || busy) return;
    const epoch = ++epochRef.current;
    const current = () => epoch === epochRef.current;
    const timeout = responseTimeoutSeconds(terminal);
    const session = open(terminal);
    try {
      if (hasReachabilityProbe(terminal.transport)) {
        startWait('checking', timeout, true);
        const probe = await session.probeReachability();
        if (!current()) return;
        if (!probe.reachable) {
          setDialog({
            kind: 'failure',
            message: unreachableMessage(terminal, probe),
            terminal,
          });
          return;
        }
      }
      if (
        asksSignOn(terminal) &&
        (signOn == null || signOn.kind === 'noAnswer')
      ) {
        await onRefresh(terminal);
        if (!current()) return;
      }
      startWait('waiting', timeout, true);
      const operation = session.startSettlement();
      flightRef.current = operation;
      const settlement = await operation.result;
      if (!current()) return;
      if (settlement.outcome === 'failed') {
        setDialog({
          kind: 'failure',
          message: settlement.failure.message,
          terminal,
        });
        return;
      }
      setDialog({ kind: 'settlement', settlement, terminal });
    } catch (error) {
      if (!current()) return;
      setDialog({
        kind: 'failure',
        message: error instanceof Error ? error.message : String(error),
        terminal,
      });
    } finally {
      if (current()) {
        flightRef.current = null;
        stopWait();
      }
    }
  };

  return (
    <Screen onTerminals={onOpenTerminals} title="ECR">
      <FormScroll contentContainerStyle={styles.pad}>
        <Dropdown
          enabled={!busy}
          label="Transaction type"
          optionLabel={(item) => item.label}
          options={operations}
          selected={active}
          onSelected={(item) => chooseType(item.id)}
        />
        <OutlinedField
          editable={active.requiresAmount && !busy}
          error={errors.amount}
          hint={
            active.requiresAmount
              ? undefined
              : active.id === 'inquiry'
                ? 'An inquiry only reads; nothing is charged'
                : "Uses the original transaction's amount"
          }
          keyboardType="number-pad"
          label="Amount (OMR)"
          caretAtEnd
          value={formatAmount(digits)}
          onChangeText={(text) => setDigits(keyedDigits(text))}
          onFocus={() => {
            if (digits) setDigits('');
          }}
        />
        {active.id === 'sale' ? (
          <OutlinedField
            editable={!busy}
            error={errors.merchantReference}
            hint="Optional. Your order or basket id; leave blank to auto-generate"
            label="Merchant reference"
            value={merchantReference}
            onChangeText={(value) => setMerchantReference(value.slice(0, 32))}
          />
        ) : null}
        {active.id === 'inquiry' ? (
          <LabeledSwitch
            disabled={busy}
            label="Look up by reference"
            value={lookUpByReference}
            onValueChange={(checked) => {
              setLookUpByReference(checked);
              setReceiptNumber('');
              setOriginalReference('');
              setErrors({});
            }}
          />
        ) : null}
        {active.id === 'inquiry' && lookUpByReference ? (
          <OutlinedField
            editable={!busy}
            error={errors.originalReference}
            hint="Reference of the transaction to look up. This inquiry gets its own new merchant reference."
            label="Original merchant reference"
            value={originalReference}
            onChangeText={(value) => setOriginalReference(value.slice(0, 32))}
          />
        ) : null}
        {showReceipt ? (
          <OutlinedField
            editable={!busy}
            error={errors.receiptNumber}
            hint="Receipt number printed on the receipt"
            keyboardType="number-pad"
            label="Receipt number"
            value={receiptNumber}
            onChangeText={(value) =>
              setReceiptNumber(value.replace(/\D/g, '').slice(0, 6))
            }
          />
        ) : null}
        {showDate ? (
          <DateField
            enabled={!busy}
            value={originalDate}
            onChange={setOriginalDate}
          />
        ) : null}
        {terminals.length === 0 ? (
          <Text style={styles.empty}>
            No terminals registered yet. Add one from the Terminals screen.
          </Text>
        ) : (
          <>
            <Dropdown
              enabled={!busy}
              label="POS terminal"
              optionLabel={(item) => `${item.name} (${item.serialNumber})`}
              options={terminals}
              selected={terminal}
              onSelected={onSelect}
            />
            <TerminalStatus signOn={profile} />
            {terminal && plan ? (
              <ConfigCard plan={plan} terminal={terminal} />
            ) : null}
          </>
        )}
        <PrimaryButton
          enabled={!busy && plan?.ready === true}
          label={
            active.id === 'inquiry'
              ? 'Look up transaction'
              : 'Start transaction'
          }
          onPress={() => {
            send().catch(() => undefined);
          }}
        />
        {canSettle ? (
          <SecondaryButton
            enabled={!busy && plan?.ready === true}
            label="Manual settlement"
            onPress={confirmSettlement}
          />
        ) : null}
        {wait && wait.kind !== 'fetching' ? (
          <Countdown
            status={
              wait.kind === 'checking'
                ? 'Checking the terminal…'
                : 'Waiting for the POS terminal…'
            }
            total={wait.total}
            remaining={wait.remaining}
          />
        ) : null}
        {wait && wait.kind !== 'fetching' ? (
          <SecondaryButton label="Cancel operation" onPress={cancelOperation} />
        ) : null}
      </FormScroll>
      <ResultDialog
        dialog={dialog}
        onPrint={
          terminal?.transport === 'appToApp' &&
          dialog?.kind === 'result' &&
          dialog.result.outcome === 'approved'
            ? () => {
                printReceipt().catch(() => undefined);
              }
            : undefined
        }
        onCancelFetch={
          dialog?.kind === 'inquiry' && dialog.fetching
            ? cancelOperation
            : undefined
        }
        wait={wait?.kind === 'fetching' ? wait : null}
        onCloseReceipt={
          canCloseReceipt &&
          (dialog?.kind === 'result' || dialog?.kind === 'settlement')
            ? () => {
                closeTerminalReceipt().catch(() => undefined);
              }
            : undefined
        }
        onDismiss={dismiss}
        onInquire={async (reference) => {
          if (!terminal || busy) return;
          const epoch = ++epochRef.current;
          const still = () => epoch === epochRef.current;
          setDialog(null);
          startWait('waiting', responseTimeoutSeconds(terminal), true);
          try {
            const operation = open(terminal).startInquireByReference(reference);
            flightRef.current = operation;
            const inquiry = await operation.result;
            if (!still()) return;
            if (inquiry.outcome === 'failed') {
              setDialog({
                kind: 'failure',
                message: inquiry.failure.message,
                terminal,
              });
              return;
            }
            setDialog({
              kind: 'inquiry',
              inquiry,
              terminal,
              receiptNumber: '',
              transactionDate: '',
              originalTerminalId: '',
              fetching: false,
            });
          } catch (error) {
            if (!still()) return;
            setDialog({
              kind: 'failure',
              message: error instanceof Error ? error.message : String(error),
              terminal,
            });
          } finally {
            if (still()) {
              flightRef.current = null;
              stopWait();
            }
          }
        }}
        onReceipt={async () => {
          if (dialog?.kind !== 'inquiry' || !terminal) return;
          const epoch = ++epochRef.current;
          const still = () => epoch === epochRef.current;
          const current = dialog;
          setDialog({ ...current, fetching: true });
          startWait('fetching', responseTimeoutSeconds(terminal), true);
          const found =
            current.inquiry.outcome === 'found'
              ? current.inquiry.transaction
              : null;
          const number = found?.stan || current.receiptNumber;
          const date = found?.transactionTime
            ? found.transactionTime.replace(/\D/g, '').slice(0, 8)
            : current.transactionDate;
          try {
            const operation = open(current.terminal).startReceipt({
              receiptNumber: number,
              transactionDate: date || wireDate(new Date()),
              originalTerminalId: current.originalTerminalId,
            });
            flightRef.current = operation;
            const receipt = await operation.result;
            if (!still()) return;
            setDialog({ ...current, fetching: false, receipt });
          } catch (error) {
            if (!still()) return;
            setDialog({
              ...current,
              fetching: false,
              receipt: {
                outcome: 'failed',
                merchantReference: '',
                failure: {
                  kind: 'malformed',
                  message:
                    error instanceof Error ? error.message : String(error),
                  outcomeIsUnknown: true,
                },
              },
            });
          } finally {
            if (still()) {
              flightRef.current = null;
              stopWait();
            }
          }
        }}
      />
    </Screen>
  );
}

function receiptLines(result: EcrApproved, operation: string): string[] {
  return [
    'AMWAL ECR',
    operation,
    result.amount ? `OMR ${result.amount}` : '',
    result.authCode ? `AUTH ${result.authCode}` : '',
    result.rrn ? `RRN ${result.rrn}` : '',
    result.maskedPan ? `CARD ${result.maskedPan}` : '',
    result.merchantReference ? `REF ${result.merchantReference}` : '',
  ].filter((line) => line.length > 0);
}

function closeReceiptMessage(closed: EcrReceiptClosed): string {
  switch (closed.outcome) {
    case 'idle':
      return 'Terminal is back on its idle screen';
    case 'refused':
      return `Terminal refused: ${closed.reason}`;
    case 'failed':
      return `Could not reach the terminal: ${closed.failure.message}`;
  }
}

function ConfigCard({
  terminal,
  plan,
}: {
  terminal: SavedTerminal;
  plan: ReturnType<typeof terminalPlan>;
}) {
  return (
    <View
      style={[
        styles.config,
        plan.ready ? styles.configReady : styles.configMissing,
      ]}
    >
      <Text style={styles.configTitle}>Active terminal config</Text>
      <ConfigLine label="ECR mode" value={modeOf(terminal.transport).label} />
      <ConfigLine label="Transport" value={plan.transportLabel} />
      <ConfigLine label="Connection" value={plan.connection} />
      <ConfigLine
        label={plan.hashKeyLabel}
        value={
          plan.hashKeyConfigured
            ? `configured (${plan.hashKeyLength} hex chars)`
            : 'not configured — set in Terminals settings'
        }
      />
      {plan.issues.map((issue) => (
        <Text key={issue} style={styles.issue}>
          {issue}
        </Text>
      ))}
    </View>
  );
}

function ConfigLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.configLine}>
      {label}: {value}
    </Text>
  );
}

interface FieldErrors {
  amount?: string | null;
  merchantReference?: string | null;
  originalReference?: string | null;
  receiptNumber?: string | null;
}

type Wait = {
  kind: 'checking' | 'waiting' | 'fetching';
  remaining: number;
  total: number;
};

function Countdown({
  status,
  remaining,
  total,
}: {
  status: string;
  remaining: number;
  total: number;
}) {
  const progress = total <= 0 ? 0 : Math.min(1, Math.max(0, remaining / total));
  return (
    <View style={styles.waiting}>
      <ActivityIndicator color={colors.primary} />
      <View style={styles.countdownCopy}>
        <Text style={styles.waitingText}>{status}</Text>
        <Text style={styles.countdown}>{countdownLabel(remaining)}</Text>
        <Text style={styles.countdownHint}>remaining of {total} s timeout</Text>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 16, padding: 16, paddingBottom: 32 },
  empty: { color: colors.onSurface, fontSize: 16 },
  waiting: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  waitingText: { color: colors.onSurface, fontSize: 16 },
  countdownCopy: { flex: 1, gap: 2 },
  countdown: {
    color: colors.primary,
    fontFamily: 'monospace',
    fontSize: 28,
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
  config: { borderRadius: 12, gap: 4, padding: 12 },
  configReady: { backgroundColor: colors.surfaceVariant },
  configMissing: { backgroundColor: 'rgba(249, 222, 220, 0.7)' },
  configTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  configLine: { color: colors.onSurfaceVariant, fontSize: 12 },
  issue: { color: colors.error, fontSize: 12 },
});
