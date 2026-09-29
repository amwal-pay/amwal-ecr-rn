import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {
  EcrTerminal,
  type EcrSignOn,
  type EcrTerminalCapabilities,
} from 'react-native-amwal-ecr';
import {
  secureHashKeyFor,
  type AppSettings,
  type SavedTerminal,
} from './model';
import { TerminalEditScreen } from './screens/TerminalEditScreen';
import { TerminalsScreen } from './screens/TerminalsScreen';
import { TransactionScreen } from './screens/TransactionScreen';
import type { SignOnView } from './signOn';
import { loadTill, saveTill } from './storage';
import { colors } from './theme';

type Screen =
  | { name: 'pay' }
  | { name: 'terminals' }
  | { name: 'edit'; originalSerial: string | null };

export default function App() {
  const [ready, setReady] = useState(false);
  const [terminals, setTerminals] = useState<SavedTerminal[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    environment: 'SIT',
    wifiSecureHashKey: '',
    webServiceSecureHashKey: '',
  });
  const [screen, setScreen] = useState<Screen>({ name: 'pay' });
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [signOns, setSignOns] = useState<Record<string, SignOnView>>({});

  useEffect(() => {
    loadTill()
      .then((loaded) => {
        setTerminals(loaded.terminals);
        setSettings(loaded.settings);
        setSelectedSerial(loaded.terminals[0]?.serialNumber ?? null);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveTill({ terminals, settings }).catch(() => undefined);
  }, [ready, terminals, settings]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen.name === 'edit') {
          setScreen({ name: 'terminals' });
          return true;
        }
        if (screen.name === 'terminals') {
          setScreen({ name: 'pay' });
          return true;
        }
        return false;
      }
    );
    return () => subscription.remove();
  }, [screen]);

  const open = (terminal: SavedTerminal) =>
    new EcrTerminal({
      host: terminal.ipAddress,
      serialNumber: terminal.serialNumber,
      transport: terminal.transport,
      config: {
        port: terminal.port || 9100,
        merchantId: terminal.merchantId,
        terminalId: terminal.terminalId,
        environment: settings.environment,
        secureHashKey: secureHashKeyFor(terminal, settings),
      },
    });

  const applySignOn = (serial: string, answer: EcrSignOn) => {
    if (answer.outcome === 'available') {
      setSignOns((current) => ({
        ...current,
        [serial]: answer.capabilities.available
          ? { kind: 'ready', capabilities: answer.capabilities }
          : {
              kind: 'notReady',
              reason: answer.capabilities.reason || 'Not ready',
              capabilities: answer.capabilities,
            },
      }));
    } else if (answer.outcome === 'unavailable') {
      setSignOns((current) => ({
        ...current,
        [serial]: {
          kind: 'notReady',
          reason: answer.reason,
          capabilities: answer.capabilities,
        },
      }));
    } else {
      setSignOns((current) => ({
        ...current,
        [serial]: { kind: 'noAnswer', reason: answer.failure.message },
      }));
    }
  };

  const check = async (terminal: SavedTerminal) => {
    if (terminal.transport === 'appToApp') {
      setSignOns((current) => {
        const next = { ...current };
        delete next[terminal.serialNumber];
        return next;
      });
      return;
    }
    const key = secureHashKeyFor(terminal, settings);
    if (!key.trim()) {
      setSignOns((current) => ({
        ...current,
        [terminal.serialNumber]: {
          kind: 'notReady',
          reason:
            terminal.transport === 'webService'
              ? 'Web Service signing key is not configured'
              : 'Wi-Fi signing key is not configured',
        },
      }));
      return;
    }
    setSignOns((current) => ({
      ...current,
      [terminal.serialNumber]: { kind: 'asking' },
    }));
    try {
      applySignOn(terminal.serialNumber, await open(terminal).signOn());
    } catch (error) {
      setSignOns((current) => ({
        ...current,
        [terminal.serialNumber]: {
          kind: 'noAnswer',
          reason: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (screen.name === 'terminals') {
    return (
      <TerminalsScreen
        settings={settings}
        signOns={signOns}
        terminals={terminals}
        onAdd={() => setScreen({ name: 'edit', originalSerial: null })}
        onBack={() => setScreen({ name: 'pay' })}
        onCheck={(terminal) => {
          check(terminal).catch(() => undefined);
        }}
        onDelete={(serial) => {
          setTerminals((current) =>
            current.filter((terminal) => terminal.serialNumber !== serial)
          );
          if (selectedSerial === serial) setSelectedSerial(null);
        }}
        onEdit={(serial) => setScreen({ name: 'edit', originalSerial: serial })}
        onSettings={setSettings}
      />
    );
  }

  if (screen.name === 'edit') {
    return (
      <TerminalEditScreen
        original={
          terminals.find(
            (terminal) => terminal.serialNumber === screen.originalSerial
          ) ?? null
        }
        others={terminals.filter(
          (terminal) => terminal.serialNumber !== screen.originalSerial
        )}
        onDone={() => setScreen({ name: 'terminals' })}
        onSave={(terminal) => {
          setTerminals((current) => {
            const without = current.filter(
              (item) => item.serialNumber !== screen.originalSerial
            );
            return [...without, terminal];
          });
          setSelectedSerial(terminal.serialNumber);
          setScreen({ name: 'terminals' });
        }}
      />
    );
  }

  return (
    <TransactionScreen
      open={open}
      selectedSerial={selectedSerial}
      settings={settings}
      signOn={selectedSerial ? signOns[selectedSerial] : undefined}
      terminals={terminals}
      onOpenTerminals={() => setScreen({ name: 'terminals' })}
      onProfile={(serial, capabilities: EcrTerminalCapabilities) =>
        setSignOns((current) => ({
          ...current,
          [serial]: { kind: 'ready', capabilities },
        }))
      }
      onSelect={(terminal) => {
        setSelectedSerial(terminal.serialNumber);
        check(terminal).catch(() => undefined);
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    flex: 1,
    justifyContent: 'center',
  },
});
