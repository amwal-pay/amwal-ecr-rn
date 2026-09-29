import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ConfirmDialog,
  FormScroll,
  OutlinedField,
  RadioRow,
  Screen,
  SignOnDot,
  SignOnSummary,
  SurfaceCard,
  TextAction,
} from '../chrome';
import {
  connectionSummary,
  isValidSecureHashKey,
  modeOf,
  reportedTransport,
  type AppSettings,
  type SavedTerminal,
} from '../model';
import type { SignOnView } from '../signOn';
import { colors } from '../theme';
import type { EcrEnvironment } from 'react-native-amwal-ecr';

const ENVIRONMENTS: EcrEnvironment[] = ['SIT', 'UAT', 'PROD'];

export function TerminalsScreen({
  terminals,
  settings,
  signOns,
  onBack,
  onAdd,
  onEdit,
  onDelete,
  onCheck,
  onSettings,
}: {
  terminals: SavedTerminal[];
  settings: AppSettings;
  signOns: Record<string, SignOnView>;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (serial: string) => void;
  onDelete: (serial: string) => void;
  onCheck: (terminal: SavedTerminal) => void;
  onSettings: (settings: AppSettings) => void;
}) {
  const [pending, setPending] = useState<SavedTerminal | null>(null);

  return (
    <Screen fab={onAdd} onBack={onBack} title="POS terminals">
      <FormScroll
        contentContainerStyle={[
          styles.pad,
          terminals.length === 0 && styles.padEmpty,
        ]}
      >
        {terminals.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              No terminals yet.{'\n'}Tap + to register a POS terminal.
            </Text>
            <SettingsCards onSettings={onSettings} settings={settings} />
          </View>
        ) : (
          <>
            <SettingsCards onSettings={onSettings} settings={settings} />
            {terminals.map((terminal) => (
              <TerminalCard
                key={terminal.serialNumber}
                signOn={signOns[terminal.serialNumber]}
                terminal={terminal}
                onCheck={() => onCheck(terminal)}
                onDelete={() => setPending(terminal)}
                onEdit={() => onEdit(terminal.serialNumber)}
              />
            ))}
          </>
        )}
      </FormScroll>
      {pending ? (
        <ConfirmDialog
          confirmLabel="Delete"
          message={`Delete “${pending.name}”? This cannot be undone.`}
          title="Delete terminal"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            onDelete(pending.serialNumber);
            setPending(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function SettingsCards({
  settings,
  onSettings,
}: {
  settings: AppSettings;
  onSettings: (settings: AppSettings) => void;
}) {
  return (
    <View style={styles.settings}>
      <SurfaceCard>
        <Text style={styles.cardTitle}>Wi‑Fi / LAN settings</Text>
        <Text style={styles.caption}>
          Signing key for Wi‑Fi, USB cable, and Bluetooth ECR (sorted key=value
          HMAC).
        </Text>
        <HashKeyField
          label="Wi-Fi/LAN secure hash key"
          value={settings.wifiSecureHashKey}
          onChangeText={(wifiSecureHashKey) =>
            onSettings({ ...settings, wifiSecureHashKey })
          }
        />
      </SurfaceCard>
      <SurfaceCard>
        <Text style={styles.cardTitle}>Web Service settings</Text>
        <Text style={styles.caption}>
          Target environment and signing key for Web Service ECR (JSON body
          HMAC).
        </Text>
        {ENVIRONMENTS.map((environment) => (
          <RadioRow
            key={environment}
            label={environment}
            selected={settings.environment === environment}
            onPress={() => onSettings({ ...settings, environment })}
          />
        ))}
        <HashKeyField
          label="Web Service secure hash key"
          value={settings.webServiceSecureHashKey}
          onChangeText={(webServiceSecureHashKey) =>
            onSettings({ ...settings, webServiceSecureHashKey })
          }
        />
      </SurfaceCard>
    </View>
  );
}

function HashKeyField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const invalid = value.length > 0 && !isValidSecureHashKey(value);
  return (
    <OutlinedField
      autoCapitalize="none"
      error={
        invalid
          ? 'Must be an even-length hex string of at least 16 characters'
          : null
      }
      keyboardType="ascii-capable"
      label={label}
      secure={!shown}
      trailing={
        <TextAction
          label={shown ? 'Hide' : 'Show'}
          onPress={() => setShown((current) => !current)}
        />
      }
      value={value}
      onChangeText={(next) => onChangeText(next.replace(/[^0-9a-fA-F]/g, ''))}
    />
  );
}

function TerminalCard({
  terminal,
  signOn,
  onEdit,
  onDelete,
  onCheck,
}: {
  terminal: SavedTerminal;
  signOn: SignOnView | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onCheck: () => void;
}) {
  const reported =
    signOn?.kind === 'ready' || signOn?.kind === 'notReady'
      ? reportedTransport(signOn.capabilities?.ecrMode ?? 0)
      : null;
  return (
    <SurfaceCard>
      <View style={styles.nameRow}>
        <SignOnDot
          signOn={terminal.transport === 'appToApp' ? undefined : signOn}
        />
        <Text style={styles.name}>{terminal.name}</Text>
      </View>
      <Text style={styles.mode}>
        {modeOf(terminal.transport).label}
        {reported ? ` · terminal reports ${reported}` : ''}
      </Text>
      {terminal.transport === 'appToApp' ? null : (
        <SignOnSummary signOn={signOn} />
      )}
      <Text style={styles.mono}>S/N {terminal.serialNumber}</Text>
      <Text style={styles.mono}>{connectionSummary(terminal)}</Text>
      <View style={styles.actions}>
        <TextAction label="Check" onPress={onCheck} />
        <TextAction label="Edit" onPress={onEdit} />
        <TextAction label="Delete" onPress={onDelete} />
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 12, padding: 16, paddingBottom: 96 },
  padEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyWrap: { gap: 16, paddingTop: 24 },
  empty: { color: colors.onSurface, fontSize: 16, textAlign: 'center' },
  settings: { gap: 12 },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '600' },
  caption: { color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 8 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: '600' },
  mode: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  mono: {
    color: colors.onSurface,
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
