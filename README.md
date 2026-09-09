# Amwal ECR for React Native

Drive an Amwal POS terminal from a React Native Android or iOS application over
the local network. The package is a typed bridge over the same published native
providers used by the Amwal Flutter package:

- Android: `com.amwal-pay:ecr-sdk:1.0.5` from Maven Central
- iOS: `AmwalECR ~> 0.2.1` from CocoaPods trunk

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

Only `ethernet` and `wifi` open a local ECR listener. `webService` drives the
terminal through the Amwal payment host over REST instead — no host address,
no local network:

```tsx
const hostedTerminal = new EcrTerminal({
  serialNumber: 'P653200085189',
  transport: 'webService',
  config: {
    merchantId: '13593',
    terminalId: '742001',
    environment: 'UAT', // 'SIT' | 'UAT' | 'PROD'
    secureHashKey: webServiceSecretFromSecureStorage,
  },
});
```

The Web Service path signs with its own secret (different from the LAN key);
both are issued by Amwal and both travel through `secureHashKey`. Receipt fetch
is only available on the local transports, and `isReachable()` resolves `false`
for `webService` — there is no local listener to probe. `bluetooth` and
`usbCable` return a typed `unsupported` failure without sending anything.

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

## Continuous integration

[`codemagic.yaml`](codemagic.yaml) runs on Codemagic. Every push and pull
request runs `rn-verify`: TypeScript, lint, tests with coverage, the package
build and archive, codegen, the Android example (which compiles the Kotlin
bridge against `com.amwal-pay:ecr-sdk` from Maven Central) and the iOS example
for the simulator (which compiles the Swift bridge against `AmwalECR` from
CocoaPods trunk).

### Releasing to npm

Versions follow semantic versioning. A `vX.Y.Z` tag runs `npm-publish`, which
refuses unless the tag, `package.json` and the top `CHANGELOG.md` entry agree
and the exact native providers this bridge pins (`android/build.gradle` and
`RNAmwalEcr.podspec`) are live on Maven Central and trunk. A version already on
npm is skipped, never re-pushed, and the run ends by reading the version back
from the registry.

```bash
git tag -a v0.1.1 -m "react-native-amwal-ecr 0.1.1" && git push origin v0.1.1
```

Codemagic needs an environment group `npm_credentials` holding `NPM_TOKEN`, an
npm granular access token with publish rights on `react-native-amwal-ecr`. The
token lives only there — never in this repository.

### Distributing the example

The example (`example/`, bundle `com.amwalpay.amwalEcrRnExample`, package
`com.amwalpay.amwal_ecr_rn_example`, shown as "Amwal ECR RN Example") can be
handed to testers without a workstation:

| Tag | Workflow | Goes to |
|---|---|---|
| `example-ios-<n>` | `example-ios-testflight` | TestFlight, internal group `Testers` |
| `example-android-<n>` | `example-android-firebase` | Firebase App Distribution, group `tester` |

```bash
git tag example-ios-1 && git push origin example-ios-1
git tag example-android-1 && git push origin example-android-1
```

Both can also be started by hand from Codemagic. The build number is
Codemagic's `PROJECT_BUILD_NUMBER`, so every build installs over the previous
one. What has to exist first:

- **iOS**: the App Store Connect integration named `Amwal CodeMagic`, and an app
  record in App Store Connect for `com.amwalpay.amwalEcrRnExample`. Signing is
  automatic — the integration's API key fetches or creates the App Store
  provisioning profile; no profile or certificate is uploaded by hand.
- **Android**: environment group `A` with `FIREBASE_SERVICE_ACCOUNT` (the
  Firebase project's service-account JSON) and `FIREBASE_ANDROID_APP_ID` (the
  Android app registered in Firebase for `com.amwalpay.amwal_ecr_rn_example`).
  The release APK is signed with the template's debug keystore, which App
  Distribution accepts; a store listing would need a real upload keystore.

## License

MIT
