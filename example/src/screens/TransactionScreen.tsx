import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { EcrTerminal, type EcrTerminalCapabilities } from 'react-native-amwal-ecr';
import {
  DateField,
  Dropdown,
  FormScroll,
  LabeledSwitch,
  OutlinedField,
  PrimaryButton,
  Screen,
  TerminalStatus,
} from '../chrome';
import {
  MENU,
  amountError,
  formatAmount,
  keyedDigits,
  merchantReferenceError,
  modeOf,
  terminalPlan,
  wireDate,
  unreachableMessage,
  type AppSettings,
  type OperationId,
  type SavedTerminal,
} from '../model';
import { ResultDialog, type Dialog } from '../ResultDialog';
import type { SignOnView } from '../signOn';
import { colors } from '../theme';

export function TransactionScreen({
  terminals,
  settings,
  selectedSerial,
  signOn,
  onSelect,
  onOpenTerminals,
  open,
  onProfile,
}: {
  terminals: SavedTerminal[];
  settings: AppSettings;
  selectedSerial: string | null;
  signOn: SignOnView | undefined;
  onSelect: (terminal: SavedTerminal) => void;
  onOpenTerminals: () => void;
  open: (terminal: SavedTerminal) => EcrTerminal;
  onProfile: (serial: string, capabilities: EcrTerminalCapabilities) => void;
}) {
  const terminal = terminals.find((item) => item.serialNumber === selectedSerial);
  const permitted =
    signOn?.kind === 'ready' || signOn?.kind === 'notReady'
      ? signOn.capabilities?.permitted.map((item) => item.messageType)
      : undefined;
  const operations = MENU.filter(
    (item) => !permitted?.length || permitted.includes(item.messageType)
  );
  const [operation, setOperation] = useState<OperationId>('sale');
  const active = operations.find((item) => item.id === operation) ?? operations[0] ?? MENU[0]!;
  const [digits, setDigits] = useState('');
  const [merchantReference, setMerchantReference] = useState('');
  const [lookUpByReference, setLookUpByReference] = useState(false);
  const [originalReference, setOriginalReference] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [originalDate, setOriginalDate] = useState(() => new Date());
  const [phase, setPhase] = useState<'checking' | 'waiting' | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const fallback = operations[0];
    if (fallback && !operations.some((item) => item.id === operation)) {
      chooseType(fallback.id);
    }
    // Reset only when the permitted set drops the current choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitted?.join('|')]);

  useEffect(() => {
    if (terminal && terminal.transport !== 'appToApp' && signOn == null) {
      onSelect(terminal);
    }
    // Ask once when this terminal becomes the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal?.serialNumber]);

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

  const showReceipt = active.requiresStan && !(active.id === 'inquiry' && lookUpByReference);
  const showDate = active.requiresDate && !(active.id === 'inquiry' && lookUpByReference);
  const plan = terminal ? terminalPlan(terminal, settings) : null;
  const busy = phase != null;

  const send = async () => {
    if (!terminal || busy) return;
    const next: FieldErrors = {
      amount: amountError(digits, active.requiresAmount),
      merchantReference: active.id === 'sale' ? merchantReferenceError(merchantReference) : null,
      originalReference:
        active.id === 'inquiry' && lookUpByReference && !originalReference.trim()
          ? 'Enter the reference the transaction was sent with'
          : null,
      receiptNumber:
        showReceipt && !receiptNumber.trim()
          ? 'Enter the receipt number of the transaction to act on'
          : null,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const session = open(terminal);
    try {
      const probes =
        terminal.transport === 'wifi' ||
        terminal.transport === 'ethernet' ||
        (Platform.OS === 'android' &&
          (terminal.transport === 'usbCable' || terminal.transport === 'appToApp'));
      if (probes) {
        setPhase('checking');
        const reachable = await session.isReachable();
        if (!reachable) {
          setDialog({ kind: 'failure', message: unreachableMessage(terminal), terminal });
          return;
        }
      }
      setPhase('waiting');
      if ((signOn == null || signOn.kind === 'noAnswer') && terminal.transport !== 'appToApp') {
        onSelect(terminal);
      }

      if (active.id === 'inquiry' && lookUpByReference) {
        const inquiry = await session.inquireByReference(originalReference.trim(), {
          merchantReferenceId: originalReference.trim(),
        });
        setDialog({
          kind: 'inquiry',
          inquiry,
          terminal,
          receiptNumber: '',
          transactionDate: '',
          originalTerminalId: '',
          fetching: false,
        });
        return;
      }
      if (active.id === 'inquiry') {
        const inquiry = await session.inquire({
          receiptNumber: receiptNumber.trim(),
          transactionDate: wireDate(originalDate),
        });
        setDialog({
          kind: 'inquiry',
          inquiry,
          terminal,
          receiptNumber: receiptNumber.trim(),
          transactionDate: wireDate(originalDate),
          originalTerminalId: '',
          fetching: false,
        });
        return;
      }
      const result =
        active.id === 'sale'
          ? await session.sale(formatAmount(digits), {
              merchantReferenceId: merchantReference.trim(),
            })
          : active.id === 'void'
            ? await session.voidTransaction(receiptNumber.trim())
            : await session.refund(formatAmount(digits), {
                receiptNumber: receiptNumber.trim(),
                transactionDate: wireDate(originalDate),
              });
      if (
        result.outcome === 'declined' &&
        result.capabilities &&
        terminal.transport !== 'appToApp'
      ) {
        onProfile(terminal.serialNumber, result.capabilities);
      }
      if (result.outcome === 'failed' && result.recovered?.outcome === 'found') {
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
          reference: result.merchantReferenceId,
          terminal,
        });
        return;
      }
      if (result.outcome === 'failed') {
        setDialog({ kind: 'failure', message: result.failure.message, terminal });
        return;
      }
      setDialog({ kind: 'result', result, operation: active.id, terminal });
    } catch (error) {
      setDialog({
        kind: 'failure',
        message: error instanceof Error ? error.message : String(error),
        terminal,
      });
    } finally {
      setPhase(null);
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
    // The terminal leaves its receipt up until somebody dismisses it. Closing
    // this dialog is that moment. App to app has already closed it: the
    // answer is held until the operator leaves the receipt.
    if (!terminal || terminal.transport === 'appToApp') return;
    open(terminal).closeReceipt().catch(() => undefined);
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
            hint="The reference the transaction was sent with"
            label="Merchant reference"
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
            onChangeText={(value) => setReceiptNumber(value.replace(/\D/g, '').slice(0, 6))}
          />
        ) : null}
        {showDate ? (
          <DateField enabled={!busy} value={originalDate} onChange={setOriginalDate} />
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
              optionLabel={(item) => item.name}
              options={terminals}
              selected={terminal}
              onSelected={onSelect}
            />
            <TerminalStatus signOn={terminal?.transport === 'appToApp' ? undefined : signOn} />
            {terminal && plan ? <ConfigCard plan={plan} terminal={terminal} /> : null}
          </>
        )}
        <PrimaryButton
          enabled={!busy && plan?.ready === true}
          label={active.id === 'inquiry' ? 'Look up transaction' : 'Start transaction'}
          onPress={() => {
            send().catch(() => undefined);
          }}
        />
        {phase ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.waitingText}>
              {phase === 'checking' ? 'Checking the terminal…' : 'Waiting for the POS terminal…'}
            </Text>
          </View>
        ) : null}
      </FormScroll>
      <ResultDialog
        dialog={dialog}
        onDismiss={dismiss}
        onInquire={async (reference) => {
          if (!terminal) return;
          setDialog(null);
          const inquiry = await open(terminal).inquireByReference(reference);
          setDialog({
            kind: 'inquiry',
            inquiry,
            terminal,
            receiptNumber: '',
            transactionDate: '',
            originalTerminalId: '',
            fetching: false,
          });
        }}
        onReceipt={async () => {
          if (dialog?.kind !== 'inquiry') return;
          const current = dialog;
          setDialog({ ...current, fetching: true });
          const found = current.inquiry.outcome === 'found' ? current.inquiry.transaction : null;
          const number = found?.stan || current.receiptNumber;
          const date = found?.transactionTime
            ? found.transactionTime.replace(/\D/g, '').slice(0, 8)
            : current.transactionDate;
          try {
            const receipt = await open(current.terminal).receipt({
              receiptNumber: number,
              transactionDate: date || wireDate(new Date()),
              originalTerminalId: current.originalTerminalId,
            });
            setDialog({ ...current, fetching: false, receipt });
          } catch (error) {
            setDialog({
              ...current,
              fetching: false,
              receipt: {
                outcome: 'failed',
                merchantReferenceId: '',
                failure: {
                  kind: 'malformed',
                  message: error instanceof Error ? error.message : String(error),
                  outcomeIsUnknown: true,
                },
              },
            });
          }
        }}
      />
    </Screen>
  );
}

function ConfigCard({
  terminal,
  plan,
}: {
  terminal: SavedTerminal;
  plan: ReturnType<typeof terminalPlan>;
}) {
  return (
    <View style={[styles.config, plan.ready ? styles.configReady : styles.configMissing]}>
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

const styles = StyleSheet.create({
  pad: { gap: 16, padding: 16, paddingBottom: 32 },
  empty: { color: colors.onSurface, fontSize: 16 },
  waiting: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  waitingText: { color: colors.onSurface, fontSize: 16 },
  config: { borderRadius: 12, gap: 4, padding: 12 },
  configReady: { backgroundColor: colors.surfaceVariant },
  configMissing: { backgroundColor: 'rgba(249, 222, 220, 0.7)' },
  configTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  configLine: { color: colors.onSurfaceVariant, fontSize: 12 },
  issue: { color: colors.error, fontSize: 12 },
});
