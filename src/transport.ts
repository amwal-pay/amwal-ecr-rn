import { Platform } from 'react-native';
import type { EcrTransport } from './types';

/** The Amwal payment app. App to app always hands the request to this id. */
export const PAYMENT_APP_PACKAGE = 'com.amwalpay.pos';

const TRANSPORTS: readonly EcrTransport[] = [
  'wifi',
  'usbCable',
  'bluetooth',
  'webService',
  'appToApp',
];

export function isEcrTransport(value: string): value is EcrTransport {
  return (TRANSPORTS as readonly string[]).includes(value);
}

/** TMS `ecrMode` for a transport this package knows. */
export function transportWireValue(transport: EcrTransport): number {
  switch (transport) {
    case 'usbCable':
      return 1;
    case 'wifi':
      return 2;
    case 'bluetooth':
      return 3;
    case 'webService':
      return 4;
    case 'appToApp':
      return 5;
  }
}

/** The transport for a TMS `ecrMode`, or null when this version does not know it. */
export function transportFromWireValue(value: number): EcrTransport | null {
  switch (value) {
    case 1:
      return 'usbCable';
    case 2:
      return 'wifi';
    case 3:
      return 'bluetooth';
    case 4:
      return 'webService';
    case 5:
      return 'appToApp';
    default:
      return null;
  }
}

/** Wi-Fi is the only IP transport. USB carries no address. */
export function isIpTransport(transport: EcrTransport): boolean {
  return transport === 'wifi';
}

/** Whether a till can ask, before sending anything, if the terminal is there. */
export function hasReachabilityProbe(transport: EcrTransport): boolean {
  return (
    isIpTransport(transport) ||
    transport === 'usbCable' ||
    transport === 'appToApp'
  );
}

/** E-receipt. Web Service has no receipt fetch. */
export function supportsReceipt(transport: EcrTransport): boolean {
  return hasReachabilityProbe(transport);
}

/**
 * Sign-on. App to app is excluded: a handover only to learn the next refusal.
 * Web Service is excluded: the till already addressed the terminal through Amwal.
 */
export function supportsSignOn(transport: EcrTransport): boolean {
  return isIpTransport(transport) || transport === 'usbCable';
}

/** Close receipt. App to app has already dismissed it when the answer arrives. */
export function supportsCloseReceipt(transport: EcrTransport): boolean {
  return (
    isIpTransport(transport) ||
    transport === 'usbCable' ||
    transport === 'webService'
  );
}

/** Settlement: Wi-Fi, USB, app to app, and Web Service. */
export function supportsSettlement(transport: EcrTransport): boolean {
  return supportsCloseReceipt(transport) || transport === 'appToApp';
}

/**
 * Whether this package can drive the transport on the current OS.
 * USB and app to app are Android. Wi-Fi and Web Service run on Android and iOS.
 */
export function isTransportSupported(
  transport: EcrTransport,
  os: string = Platform.OS
): boolean {
  switch (transport) {
    case 'wifi':
    case 'webService':
      return true;
    case 'usbCable':
    case 'appToApp':
      return os === 'android';
    case 'bluetooth':
      return false;
  }
}

/** The sentence Flutter uses when an operation is refused before anything is sent. */
export function unsupportedTransportMessage(
  transport: EcrTransport,
  operation: string
): string {
  if (transport === 'appToApp') {
    return (
      `${operation} could not be started. The Amwal payment app is driven by ` +
      'an Android intent, so this platform cannot start it and nothing was sent.'
    );
  }
  return (
    `${operation} is not available over ${transport}. ` +
    'A terminal opens its ECR listener for Wi-Fi, USB cable (Android), ' +
    `or Web Service REST; on ${transport} the port stays closed and ` +
    'the terminal is driven by other machinery entirely.'
  );
}
