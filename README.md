# Amwal ECR for React Native

Drive an Amwal POS terminal from a React Native Android or iOS application over
Wi-Fi, the Amwal payment host (Web Service), and on Android also a USB cable or
the Amwal payment app on the same device. The package is a typed bridge over the same published native
providers used by the Amwal Flutter package:

- Android: `com.amwal-pay:ecr-sdk:1.0.6` from Maven Central, or a local
  `ECR-simulator/ecr-sdk` module
- iOS: `AmwalECR ~> 0.2.1` from CocoaPods trunk, or a local
  `AmwalECR-iOS-CocoaPods` / `AmwalECR-iOS-SPM` checkout

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

Android's manifest entries are contributed by the library and merge into your
app automatically:

- `INTERNET` and `ACCESS_NETWORK_STATE` for Wi-Fi and Web Service.
- `uses-feature android.hardware.usb.host` (`required="false"`), so USB cable
  mode does not exclude devices without a USB host port.
- `<queries>` for the Amwal payment app (`com.amwalpay.pos`) and its
  `com.amwalpay.pos.ecr.TRANSACTION` action, so app to app can see whether the
  payment app is installed on Android 11+.

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

The Web Service path signs with its own secret (different from the Wi-Fi key);
both are issued by Amwal and both travel through `secureHashKey`. Receipt fetch
is only available on the local transports, and `isReachable()` resolves `false`
for `webService` — there is no local listener to probe.

### Transport support

Modes match the TMS `ecrMode` values.

| Transport | `ecrMode` | Android | iOS |
|---|---|---|---|
| `usbCable` | 1 | Driven over a USB accessory channel | `unsupported`, nothing sent |
| `wifi` (and `ethernet`) | 2 | Driven | Driven |
| `bluetooth` | 3 | Refused before anything is sent | Refused before anything is sent |
| `webService` | 4 | Driven over REST | Driven over REST |
| `appToApp` | 5 | Hands the request to `com.amwalpay.pos` on the same device | `unsupported`, nothing sent |

The iOS SDK (`AmwalECR` 0.2.2, the same pod the Flutter bridge uses) can describe
a USB cable link, but the till has to supply the byte channel and this bridge
does not open a cable, matching Flutter on iOS. Wi-Fi, ethernet (as Wi-Fi), and
Web Service go through `EcrSessions.plan` / `EcrSessions.open` on both
platforms.

On Android, `usbCable` and `appToApp` need no `host`. For `appToApp` the payment
app must be installed and a foreground Activity must exist, because the request
is an Activity result exchange. The library never launches the payment app just
to check for it. `isReachable()` resolves `false` for every transport that has no
local listener to probe.

### Sign-on and close receipt

`signOn()` asks the terminal what it is and which transactions it permits.
`closeReceipt()` tells it to leave its receipt and return to idle.

```tsx
const signOn = await terminal.signOn();
if (signOn.outcome === 'available') {
  const { terminalName, ecrMode, permitted } = signOn.capabilities;
  // permitted: [{ messageType, minAmount, maxAmount }, ...]
}

await terminal.closeReceipt();
```

| Transport | `signOn()` / `closeReceipt()` |
|---|---|
| Wi-Fi | Android and iOS |
| USB cable | Android only |
| App to app, Web Service, Bluetooth | Answer without sending anything |

`signOn()` returns `available`, `unavailable` (the terminal answered but is not
ready; `capabilities.reason` says why), or `failed` with a typed `failure`. It has
a cancellable `startSignOn()` form. A declined transaction can carry
`capabilities` when the terminal refused because its profile changed.

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

## Local native SDKs

The example always loads this package. The properties files choose how that
package resolves `ecr-sdk` and `AmwalECR`, the same way `amwal_ecr` does.

| Platform | Package config | Example override |
|---|---|---|
| Android | `android/gradle.properties` | `example/android/gradle.properties` |
| iOS | `ios/ecr_sdk.properties` | `example/ios/ecr_sdk.properties` |

The package defaults to the published SDKs (`maven` / `cocoapods`). On Android,
Gradle reads the library module's own `android/gradle.properties` in preference
to the example's, so the example's `ecrSdkDependency=project` does not take
effect by itself. Pass it on the command line to build the example against the
local `ECR-simulator`:

```bash
cd example
npx react-native run-android --extra-params "-PecrSdkDependency=project"
# or: cd android && ./gradlew :app:assembleDebug -PecrSdkDependency=project
```

The build log states which source was used: "Using ECR SDK from project module
:ecr-sdk" or "from Maven".

Android `ecrSdkDependency`:

| Value | Use when |
|---|---|
| `project` | Live `:ecr-sdk` from sibling `ECR-simulator` (the example default) |
| `jar` | `cd ../ECR-simulator && ./gradlew :ecr-sdk:jar` |
| `maven` | Published `com.amwal-pay:ecr-sdk` |

iOS `ecrSdkDependency`:

| Value | What the example Podfile does |
|---|---|
| `project` | `pod 'AmwalECR', :path =>` sibling `AmwalECR-iOS-CocoaPods` |
| `cocoapods` | Trunk, from `RNAmwalEcr.podspec` |
| `spm` | Prints the sibling `AmwalECR-iOS-SPM` path to add in Xcode |

Paths assume this package, `ECR-simulator`, `AmwalECR-iOS-CocoaPods`, and
`AmwalECR-iOS-SPM` sit under the same parent directory. One-off:

```bash
ECR_SDK_DEPENDENCY=cocoapods pod install
```

## Development

```bash
corepack yarn install        # or: node .yarn/releases/yarn-4.11.0.cjs install
corepack yarn verify

cd example/android
./gradlew :app:assembleDebug

cd ../ios
pod install
xcodebuild -workspace AmwalEcrExample.xcworkspace \
  -scheme AmwalEcrExample -sdk iphonesimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

The repository pins Yarn 4.11 (`.yarnrc.yml`), so the bundled release runs even
where `yarn` and `corepack` are not installed. Install from the repository root:
the example is a workspace and gets its dependencies from there.

The example saves its terminals and Wi-Fi / Web Service signing keys on the
device with `@react-native-async-storage/async-storage`. That is convenient for a
sample till; a production app should keep the ECR secret in the platform
keychain or keystore instead.

### Running the example

```bash
cd example
npx react-native start
npx react-native run-android   # or run-ios
```

- **Android on a USB device:** run `adb reverse tcp:8081 tcp:8081` so the device
  can reach Metro. Without it the app shows "Unable to load script". The mapping
  is lost when the device reconnects.
- **After adding or updating a native dependency:** rebuild the app. A JS reload
  is not enough. On Android, delete `example/android/build/generated/autolinking`
  if Gradle keeps the old module list; on iOS, run `pod install` again.
  `NativeModule: AsyncStorage is null` means the installed app predates that
  dependency.
- **iOS:** the example Podfile raises every pod's deployment target to the
  project minimum, because some resource bundles (for example AsyncStorage's)
  default to iOS 13.4, which current Xcode rejects.
- **Metro cache:** if a newly installed package is still "unable to resolve",
  restart Metro with `--reset-cache`.

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
