import type { EcrTerminalCapabilities } from 'react-native-amwal-ecr';

export type SignOnView =
  | { kind: 'asking' }
  | { kind: 'ready'; capabilities: EcrTerminalCapabilities }
  | { kind: 'notReady'; reason: string; capabilities?: EcrTerminalCapabilities }
  | { kind: 'noAnswer'; reason: string };
