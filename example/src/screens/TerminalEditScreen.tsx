import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  FormScroll,
  OutlinedField,
  PrimaryButton,
  RadioRow,
  Screen,
} from '../chrome';
import {
  MODES,
  hasTerminalErrors,
  validateTerminal,
  type SavedTerminal,
  type TerminalErrors,
} from '../model';
import { colors } from '../theme';

export function TerminalEditScreen({
  original,
  others,
  onDone,
  onSave,
}: {
  original: SavedTerminal | null;
  others: SavedTerminal[];
  onDone: () => void;
  onSave: (terminal: SavedTerminal) => void;
}) {
  const [draft, setDraft] = useState<SavedTerminal>(
    original ?? {
      name: '',
      serialNumber: '',
      transport: 'wifi',
      ipAddress: '',
      port: 9100,
      terminalId: '',
      merchantId: '',
    }
  );
  const [errors, setErrors] = useState<TerminalErrors>({});
  const patch = (values: Partial<SavedTerminal>) =>
    setDraft((current) => ({ ...current, ...values }));

  return (
    <Screen onBack={onDone} title={original ? 'Terminal' : 'Add terminal'}>
      <FormScroll contentContainerStyle={styles.pad}>
        <OutlinedField
          autoCapitalize="words"
          error={errors.name}
          label="Terminal name"
          value={draft.name}
          onChangeText={(name) => patch({ name })}
        />
        <OutlinedField
          autoCapitalize="characters"
          error={errors.serial || errors.duplicate}
          label="Serial number"
          value={draft.serialNumber}
          onChangeText={(serialNumber) => patch({ serialNumber })}
        />
        <Text style={styles.modeLabel}>ECR mode</Text>
        {MODES.map((mode) => (
          <RadioRow
            key={mode.id}
            caption={
              mode.supported ? undefined : 'Not available in this simulator'
            }
            label={mode.label}
            selected={draft.transport === mode.id}
            onPress={() => patch({ transport: mode.id })}
          />
        ))}
        {draft.transport === 'usbCable' ? (
          <Text style={styles.hint}>
            Connect the till to the terminal with a USB cable. There is no
            address to enter - the cable is found when it is plugged in.
          </Text>
        ) : null}
        {draft.transport === 'wifi' ? (
          <>
            <OutlinedField
              error={errors.ip}
              keyboardType="decimal-pad"
              label="IP address"
              value={draft.ipAddress}
              onChangeText={(ipAddress) =>
                patch({ ipAddress: ipAddress.replace(/[^\d.]/g, '') })
              }
            />
            <Text style={styles.hint}>
              Use the IP shown on the POS terminal under the card logos. Default
              port is 9100. Same phone: try 127.0.0.1.
            </Text>
            <OutlinedField
              error={errors.port}
              keyboardType="number-pad"
              label="Port"
              value={draft.port ? String(draft.port) : ''}
              onChangeText={(port) =>
                patch({ port: Number(port.replace(/\D/g, '')) })
              }
            />
          </>
        ) : null}
        {draft.transport === 'webService' ? (
          <>
            <OutlinedField
              error={errors.merchantId}
              keyboardType="number-pad"
              label="Merchant ID"
              value={draft.merchantId}
              onChangeText={(merchantId) =>
                patch({ merchantId: merchantId.replace(/\D/g, '') })
              }
            />
            <OutlinedField
              error={errors.terminalId}
              keyboardType="number-pad"
              label="Terminal ID"
              value={draft.terminalId}
              onChangeText={(terminalId) =>
                patch({ terminalId: terminalId.replace(/\D/g, '') })
              }
            />
          </>
        ) : null}
        {draft.transport === 'bluetooth' ? (
          <Text style={styles.hint}>
            Bluetooth ECR cannot be exercised from this simulator.
          </Text>
        ) : null}
        {draft.transport === 'appToApp' ? (
          <Text style={styles.hint}>
            The terminal is this device. There is no address: the transaction is
            handed to the Amwal payment app installed here, and the serial
            number still has to be the one that app drives.
          </Text>
        ) : null}
        <PrimaryButton
          label="Save"
          onPress={() => {
            const next = validateTerminal(draft, others);
            setErrors(next);
            if (!hasTerminalErrors(next)) onSave(draft);
          }}
        />
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 16, padding: 16, paddingBottom: 32 },
  modeLabel: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.onSurfaceVariant, fontSize: 12 },
});
