import type { EcrEnvironment, EcrTransport } from 'react-native-amwal-ecr';

export const MODES: {
  id: EcrTransport;
  label: string;
  ecrMode: number;
  supported: boolean;
}[] = [
  { id: 'usbCable', label: 'USB Cable', ecrMode: 1, supported: true },
  { id: 'wifi', label: 'Wi-Fi', ecrMode: 2, supported: true },
  { id: 'bluetooth', label: 'Bluetooth', ecrMode: 3, supported: false },
  { id: 'webService', label: 'Web Service', ecrMode: 4, supported: true },
  { id: 'appToApp', label: 'App to app', ecrMode: 5, supported: true },
];

export type OperationId = 'sale' | 'void' | 'refund' | 'inquiry';

export const MENU: {
  id: OperationId;
  label: string;
  messageType: string;
  requiresAmount: boolean;
  requiresStan: boolean;
  requiresDate: boolean;
}[] = [
  {
    id: 'sale',
    label: 'Sale',
    messageType: 'SALE',
    requiresAmount: true,
    requiresStan: false,
    requiresDate: false,
  },
  {
    id: 'void',
    label: 'Void',
    messageType: 'VOID',
    requiresAmount: false,
    requiresStan: true,
    requiresDate: false,
  },
  {
    id: 'refund',
    label: 'Refund',
    messageType: 'REFUND',
    requiresAmount: true,
    requiresStan: true,
    requiresDate: true,
  },
  {
    id: 'inquiry',
    label: 'Inquiry',
    messageType: 'INQUIRY',
    requiresAmount: false,
    requiresStan: true,
    requiresDate: true,
  },
];

export interface SavedTerminal {
  name: string;
  serialNumber: string;
  transport: EcrTransport;
  ipAddress: string;
  port: number;
  terminalId: string;
  merchantId: string;
}

export interface AppSettings {
  environment: EcrEnvironment;
  wifiSecureHashKey: string;
  webServiceSecureHashKey: string;
}

export const EMPTY_SETTINGS: AppSettings = {
  environment: 'SIT',
  wifiSecureHashKey: '',
  webServiceSecureHashKey: '',
};

const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 100000;
const FRACTION = 3;
const MAX_DIGITS = String(Math.round(MAX_AMOUNT * 1000)).length;

export function modeOf(transport: EcrTransport) {
  return MODES.find((mode) => mode.id === transport) ?? MODES[1]!;
}

export function connectionSummary(terminal: SavedTerminal): string {
  switch (terminal.transport) {
    case 'webService': {
      const parts = [
        terminal.merchantId ? `Merchant ${terminal.merchantId}` : '',
        terminal.terminalId ? `Terminal ${terminal.terminalId}` : '',
      ].filter(Boolean);
      return parts.join(' · ') || 'Web Service';
    }
    case 'usbCable':
      return 'USB cable';
    case 'bluetooth':
      return 'Bluetooth';
    case 'appToApp':
      return 'On this device · com.amwalpay.pos';
    default:
      return terminal.port > 0
        ? `${terminal.ipAddress}:${terminal.port}`
        : terminal.ipAddress || modeOf(terminal.transport).label;
  }
}

export function secureHashKeyFor(
  terminal: SavedTerminal,
  settings: AppSettings
): string {
  return terminal.transport === 'webService'
    ? settings.webServiceSecureHashKey
    : settings.wifiSecureHashKey;
}

/** Empty is acceptable; a typed key must be even-length hex of at least 16 characters. */
export function isValidSecureHashKey(key: string): boolean {
  if (!key) return true;
  return isSecret(key);
}

function isSecret(key: string): boolean {
  return key.length >= 16 && key.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(key);
}

export function signingKeyLabel(transport: EcrTransport): string {
  return transport === 'webService'
    ? 'Web Service secure hash key'
    : 'Wi-Fi/CABLE secure hash key';
}

export function reportedTransport(ecrMode: number): string | null {
  switch (ecrMode) {
    case 1:
      return 'usb cable';
    case 2:
      return 'wifi';
    case 3:
      return 'bluetooth';
    case 4:
      return 'web service';
    default:
      return null;
  }
}

export function permittedLabel(messageType: string): string {
  return (
    MENU.find((item) => item.messageType === messageType)?.label ?? messageType
  );
}

export interface TerminalPlan {
  issues: string[];
  ready: boolean;
  hashKeyLabel: string;
  hashKeyConfigured: boolean;
  hashKeyLength: number;
  transportLabel: string;
  connection: string;
}

/** What the transaction screen's config card and Send button are gated on. */
export function terminalPlan(
  terminal: SavedTerminal,
  settings: AppSettings
): TerminalPlan {
  const mode = modeOf(terminal.transport);
  const issues: string[] = [];
  if (!mode.supported) {
    issues.push(`${mode.label} is not supported in this simulator`);
  }
  const key = secureHashKeyFor(terminal, settings).trim();
  if (key && !isSecret(key)) {
    issues.push(
      'Secure hash key must be an even-length hex string of at least 16 characters'
    );
  }
  if (terminal.transport === 'wifi' || terminal.transport === 'ethernet') {
    if (!terminal.ipAddress.trim())
      issues.push('IP address is required for Wi-Fi ECR');
    if (terminal.port < 1 || terminal.port > 65535) {
      issues.push('Port must be between 1 and 65535 (default 9100)');
    }
  }
  if (terminal.transport === 'webService') {
    if (!terminal.merchantId.trim())
      issues.push('Merchant ID is required for Web Service');
    else if (!/^\d+$/.test(terminal.merchantId.trim())) {
      issues.push('Merchant ID must be numeric');
    }
    if (!terminal.terminalId.trim())
      issues.push('Terminal ID is required for Web Service');
    else if (!/^\d+$/.test(terminal.terminalId.trim())) {
      issues.push('Terminal ID must be numeric');
    }
  }
  const configured = isSecret(key);
  if (!configured)
    issues.push(`${signingKeyLabel(terminal.transport)} is not configured`);

  const transportLabel =
    terminal.transport === 'webService'
      ? 'HTTPS Web Service (JSON HMAC)'
      : terminal.transport === 'wifi' || terminal.transport === 'ethernet'
        ? 'TCP Wi-Fi (sorted key=value HMAC)'
        : mode.label;

  const connection =
    terminal.transport === 'webService'
      ? [
          settings.environment,
          terminal.merchantId ? `merchant ${terminal.merchantId}` : '',
          terminal.terminalId ? `terminal ${terminal.terminalId}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : connectionSummary(terminal);

  return {
    issues: [...new Set(issues)],
    ready: issues.length === 0,
    hashKeyLabel: signingKeyLabel(terminal.transport),
    hashKeyConfigured: configured,
    hashKeyLength: configured ? key.length : 0,
    transportLabel,
    connection,
  };
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatDisplayDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTHS[date.getMonth()] ?? '';
  return `${day} ${month} ${date.getFullYear()}`;
}

export function wireDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}${month}${day}`;
}

export function readableTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  return `${formatDisplayDate(date)} ${match[4]}:${match[5]}`;
}

export function formatAmount(digits: string): string {
  const value = Number(digits.replace(/\D/g, '') || '0');
  const whole = Math.floor(value / 1000);
  const fraction = String(value % 1000).padStart(FRACTION, '0');
  return `${whole}.${fraction}`;
}

export function keyedDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS);
}

export function amountOf(digits: string): number {
  return Number(digits || '0') / 1000;
}

export function amountError(digits: string, required: boolean): string | null {
  if (!required) return null;
  const amount = amountOf(digits);
  if (amount === 0) return 'Required field';
  if (amount < MIN_AMOUNT) return 'minimum amount allowed is 0.010';
  if (amount > MAX_AMOUNT) return 'maximum amount allowed is 100000.000';
  return null;
}

export function todayWire(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}${month}${day}`;
}

export function displayDate(wire: string): string {
  if (!/^\d{8}$/.test(wire)) return wire;
  const date = new Date(
    Number(wire.slice(0, 4)),
    Number(wire.slice(4, 6)) - 1,
    Number(wire.slice(6, 8))
  );
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const IPV4 =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export interface TerminalErrors {
  name?: string;
  serial?: string;
  ip?: string;
  port?: string;
  terminalId?: string;
  merchantId?: string;
  duplicate?: string;
}

export function validateTerminal(
  draft: SavedTerminal,
  others: SavedTerminal[]
): TerminalErrors {
  const errors: TerminalErrors = {};
  if (!draft.name.trim()) errors.name = 'Enter a terminal name';
  if (!draft.serialNumber.trim())
    errors.serial = 'Enter the terminal serial number';
  if (
    others.some(
      (terminal) =>
        terminal.serialNumber.trim().toLowerCase() ===
        draft.serialNumber.trim().toLowerCase()
    )
  ) {
    errors.duplicate =
      'A terminal with this serial number is already registered';
  }
  if (draft.transport === 'wifi' || draft.transport === 'ethernet') {
    if (!draft.ipAddress.trim()) errors.ip = 'Enter the terminal IP address';
    else if (!IPV4.test(draft.ipAddress.trim())) {
      errors.ip = 'Enter a valid IPv4 address, for example 192.168.1.50';
    }
    if (!draft.port) errors.port = 'Enter the communication port';
    else if (draft.port < 1 || draft.port > 65535) {
      errors.port = 'Port must be between 1 and 65535';
    }
  }
  if (draft.transport === 'webService') {
    if (!draft.terminalId.trim())
      errors.terminalId = 'Enter the backend terminal ID';
    if (!draft.merchantId.trim()) errors.merchantId = 'Enter the merchant ID';
  }
  return errors;
}

export function hasTerminalErrors(errors: TerminalErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function merchantReferenceError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 32)
    return 'A merchant reference is at most 32 characters';
  if (/[\s&=]/.test(trimmed) || /[^\x21-\x7E]/.test(trimmed)) {
    return "Use printable ASCII without spaces, '&' or '='";
  }
  return null;
}

export function unreachableMessage(
  terminal: SavedTerminal,
  detail?: string
): string {
  const head = detail
    ? `${connectionSummary(terminal)} is not reachable\n(${detail})`
    : `${connectionSummary(terminal)} is not reachable`;
  if (terminal.transport === 'usbCable') {
    return (
      `${head}\n\nCheck:\n` +
      '• The USB cable is connected to the terminal\n' +
      '• POS app is in ECR mode (USB cable) and says it is waiting\n' +
      '• Serial number matches the terminal you selected\n' +
      '• This device can act as a USB host (OTG)'
    );
  }
  if (terminal.transport === 'appToApp') {
    return (
      `${head}\n\nCheck:\n` +
      '• The Amwal payment app (com.amwalpay.pos) is installed\n' +
      '• It can accept an ECR handover'
    );
  }
  return (
    `${head}\n\nCheck:\n` +
    '• POS app is in ECR mode (Wi-Fi) and shows its IP under the card logos\n' +
    `• Registered IP matches that address (port ${terminal.port || 9100})\n` +
    '• Serial number matches the terminal you selected\n' +
    '• Both devices are on the same Wi-Fi network\n' +
    '• If testing on one phone, try IP 127.0.0.1'
  );
}
