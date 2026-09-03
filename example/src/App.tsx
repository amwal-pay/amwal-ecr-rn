import { useState } from 'react';
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EcrTerminal, type EcrResult } from 'react-native-amwal-ecr';

export default function App() {
  const [host, setHost] = useState('192.168.1.50');
  const [serialNumber, setSerialNumber] = useState('');
  const [secureHashKey, setSecureHashKey] = useState('');
  const [amount, setAmount] = useState('0.001');
  const [merchantReferenceId, setMerchantReferenceId] =
    useState('DEMO-ORDER-1');
  const [status, setStatus] = useState('Ready');
  const [result, setResult] = useState<EcrResult | null>(null);
  const [busy, setBusy] = useState(false);

  const makeTerminal = () =>
    new EcrTerminal({
      host,
      serialNumber,
      config: { secureHashKey },
    });

  const probe = async () => {
    setBusy(true);
    setResult(null);
    try {
      const reachable = await makeTerminal().isReachable();
      setStatus(
        reachable ? 'Terminal is reachable' : 'Terminal did not answer'
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const sale = async () => {
    setBusy(true);
    setResult(null);
    setStatus('Waiting for the terminal…');
    try {
      const next = await makeTerminal().sale(amount, { merchantReferenceId });
      setResult(next);
      setStatus(
        next.outcomeIsUnknown
          ? 'Outcome unknown — inquire before retrying'
          : `Completed with outcome: ${next.outcome}`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Amwal ECR</Text>
        <Text style={styles.subtitle}>
          React Native native-provider smoke test
        </Text>

        <Text style={styles.label}>Terminal address</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setHost}
          style={styles.input}
          value={host}
        />

        <Text style={styles.label}>Serial number</Text>
        <TextInput
          autoCapitalize="characters"
          onChangeText={setSerialNumber}
          placeholder="P653200085189"
          style={styles.input}
          value={serialNumber}
        />

        <Text style={styles.label}>ECR secret (not stored or logged)</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setSecureHashKey}
          secureTextEntry
          style={styles.input}
          value={secureHashKey}
        />

        <Text style={styles.label}>Amount in major units</Text>
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={setAmount}
          style={styles.input}
          value={amount}
        />

        <Text style={styles.label}>Merchant reference</Text>
        <TextInput
          autoCapitalize="characters"
          onChangeText={setMerchantReferenceId}
          style={styles.input}
          value={merchantReferenceId}
        />

        <View style={styles.button}>
          <Button disabled={busy} onPress={probe} title="Check reachability" />
        </View>
        <View style={styles.button}>
          <Button disabled={busy} onPress={sale} title="Start sale" />
        </View>

        {busy ? <ActivityIndicator size="large" /> : null}
        <Text style={styles.status}>{status}</Text>
        {result ? (
          <Text selectable style={styles.result}>
            {JSON.stringify(result, null, 2)}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f5f7fb',
    flex: 1,
  },
  container: {
    padding: 24,
  },
  title: {
    color: '#13213c',
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: '#53627a',
    marginBottom: 24,
    marginTop: 4,
  },
  label: {
    color: '#25334d',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#ccd4e0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#13213c',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 16,
  },
  status: {
    color: '#13213c',
    fontWeight: '600',
    marginTop: 20,
  },
  result: {
    backgroundColor: '#e9eef6',
    borderRadius: 8,
    color: '#1a2942',
    fontFamily: 'Courier',
    marginTop: 12,
    padding: 12,
  },
});
