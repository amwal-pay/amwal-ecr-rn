# Amwal ECR for React Native

Drive an Amwal POS terminal from a React Native Android or iOS application over
the local network. The package is a typed bridge over the same published native
providers used by the Amwal Flutter package:

- Android: `com.amwal-pay:ecr-sdk:1.0.4` from Maven Central
- iOS: `AmwalECR ~> 0.2.0` from CocoaPods trunk

The bridge contains no payment protocol implementation. Android and iOS use the
native Amwal ECR SDKs unchanged and return the same outcomes for sale, void,
refund, inquiry, and e-receipt operations.

## The one rule

**A failed exchange is not a decline.** A timeout or lost connection can happen
after the terminal accepted the request and completed the payment. When
`outcomeIsUnknown` is `true`, do not send the sale again. Inquire using the same
`merchantReferenceId` and reconcile first.

```tsx
const result = await terminal.sale('1.234', {
  merchantReferenceId: order.id,
});

switch (result.outcome) {
  case 'approved':
    completeOrder(result.amount, result.rrn);
    break;
  case 'declined':
    if (result.outcomeIsUnknown) {
      await terminal.inquireByReference(result.merchantReferenceId);
    } else {
      showDecline(result.reason);
    }
    break;
  case 'failed':
    if (result.settled && result.recovered?.outcome === 'found') {
      reconcile(result.recovered.transaction);
    } else if (result.outcomeIsUnknown) {
      await terminal.inquireByReference(result.merchantReferenceId);
    }
    break;
}
```

## Install

```bash
yarn add react-native-amwal-ecr
```

React Native autolinking installs the Android module. On iOS, install pods after
adding the package:

```bash
cd ios
pod install
```

The package requires React Native's New Architecture/TurboModules, Java 17,
Android API 24+, and iOS 15.1+ (the effective minimum of current React Native;
the native Amwal ECR pod itself supports iOS 12+).

### iOS local-network permission

Add a user-facing reason to the application `Info.plist`:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Connects to the payment terminal to take card payments.</string>
```

Android's `INTERNET` permission is contributed by the library manifest.

## Create a terminal

```tsx
import { EcrTerminal } from 'react-native-amwal-ecr';

const terminal = new EcrTerminal({
  host: '192.168.1.50',
  serialNumber: 'P653200085189',
  transport: 'wifi',
  config: {
    ecrId: 'TILL-01',
    currencyCode: '512',
    minorUnitDigits: 3,
    port: 9100,
    connectTimeoutMs: 10_000,
    responseTimeoutMs: 120_000,
    probeTimeoutMs: 3_000,
    secureHashKey: secretFromSecureStorage,
    autoInquireOnFailure: true,
  },
});
```

The ECR secret is issued by Amwal per terminal. Keep it in the platform keychain
or secure storage; never place it in source, logs, analytics, or crash reports.

Only `ethernet` and `wifi` open a local ECR listener. `bluetooth` and
`webService` return a typed `unsupported` failure without sending anything.

## Operations

Amounts are plain decimal strings in major units. Never pass a JavaScript
number: binary floating point cannot exactly represent OMR amounts such as
`1.234`.

```tsx
await terminal.isReachable();

await terminal.sale('1.234', {
  merchantReferenceId: 'ORDER-1001',
});

await terminal.voidTransaction('123', {
  originalTerminalId: 'TILL-01',
  merchantReferenceId: 'VOID-1001',
});

await terminal.refund('0.500', {
  receiptNumber: '123',
  transactionDate: '20260902',
  originalTerminalId: 'TILL-01',
  merchantReferenceId: 'REFUND-1001',
});

await terminal.inquire({
  receiptNumber: '123',
  transactionDate: '20260902',
});

await terminal.inquireByReference('ORDER-1001');

await terminal.receipt({
  receiptNumber: '123',
  transactionDate: '20260902',
});
```

`inquire`, `inquireByReference`, and `receipt` are read-only and safe to repeat.
The native SDK also follows an unknown money-moving failure with one inquiry by
reference when `autoInquireOnFailure` is enabled.

## Cancellation

Every operation has a `start...` form that returns an `EcrOperation`:

```tsx
const operation = terminal.startSale('1.234', {
  merchantReferenceId: 'ORDER-1001',
});

cancelButton.onPress = () => operation.cancel();
const result = await operation.result;
```

Cancellation stops this application waiting; it does not reverse or stop the
terminal. A cancelled money-moving request returns a `failed` result with an
unknown outcome. Inquire before retrying.

The cancellable forms are `startSale`, `startVoid`, `startRefund`,
`startInquire`, `startInquireByReference`, and `startReceipt`.

## Result model

`EcrResult` is a discriminated union:

- `approved`: money moved; includes amount, RRN, authorisation code, masked PAN,
  and partial-approval fields.
- `declined`: the terminal answered and refused; code `91` remains unknown and
  requests an inquiry.
- `failed`: the exchange did not produce a trustworthy answer; includes a typed
  failure and an optional recovered inquiry.

Failure kinds are `unreachable`, `timeout`, `malformed`, `connectionLost`,
`unauthenticated`, `cancelled`, and `unsupported`. The public
`outcomeIsUnknown` flag is the decision field callers should use.

## Development

```bash
corepack yarn install
corepack yarn verify

cd example/android
./gradlew :app:assembleDebug

cd ../ios
pod install
xcodebuild -workspace AmwalEcrExample.xcworkspace \
  -scheme AmwalEcrExample -sdk iphonesimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

The example intentionally does not persist terminal details or secrets.

## Releases

Versions follow semantic versioning. A `vX.Y.Z` tag triggers Codemagic after the
tag, `package.json`, and top `CHANGELOG.md` entry agree. CI verifies TypeScript,
tests, the package archive, Android, and iOS, then publishes idempotently to npm
and reads the exact version back from the registry.

Native providers must already be resolvable from Maven Central and CocoaPods
trunk before a React Native release is allowed.

## License

MIT
