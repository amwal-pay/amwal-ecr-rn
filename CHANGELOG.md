# Changelog

## 0.3.1

Republishes 0.3.0, which never reached npm because its build failed.

- The library build declares `btoa` (provided by Hermes). The type
  definitions failed to build without it.
- Source formatting brought in line with Prettier.

## 0.3.0

Brings the package level with `amwal_ecr` 0.5.0, Android `ecr-sdk` 1.0.11,
and iOS `AmwalECR` 0.3.0.

- **Manual settlement.** `EcrTerminal.settlement()` closes the current batch
  and returns `settled` (batch totals in major units), `nothingToSettle`,
  `notSettled`, or `failed`. Wi-Fi, USB, app to app, and Web Service
  (`/Ecr/settle`). iOS drives Wi-Fi and Web Service. Confirm with the cashier
  first: the terminal starts at once.
- **Web Service close receipt.** `closeReceipt({ originalMerchantReference })`
  posts `/Ecr/closeReceipt` for the sale, void, or refund. Wi-Fi and USB still
  send `CLOSE_RECEIPT` and ignore that reference. App to app stays excluded.
- Web Service read timeout is 130 seconds when the caller left the 120 second
  default.
- The example offers Manual settlement and a Close receipt button on the
  result. Closing the result dialog no longer clears the terminal screen.
- Android example builds the sibling `ECR-simulator` module. Maven Central
  has no `ecr-sdk` 1.0.11.
- **App-to-app print receipt.** `printReceipt(imagePng)` sends a 384 px image
  to the payment app on Android. `status` and `message` stay separate.
  Other transports and iOS answer `FAILED` and send nothing. The example
  shows **Print receipt** on an approved app-to-app result.
- `isReachable()` probes USB and app to app as well as Wi-Fi. Web Service and
  Bluetooth still answer `false` without a probe. On iOS, USB and app to app
  answer `false` because those channels are Android only.
- The public reference field is `merchantReference`, the same name as
  `amwal_ecr`. The native bridge still carries `merchantReferenceId`.
- `probeReachability()` returns host, port, endpoint, and the link error.
  `ethernet` is no longer a transport. App to app accepts only
  `com.amwalpay.pos` (`EcrTerminal.appToApp`).
- `run` / `startRun` drive sale, void, and refund from `EcrTransactionType`.
  Transport flags, `EcrResponseCode`, and `displayMessageFromRaw` are part of
  the package. Web Service receipt and sign-on are refused before anything is
  sent, including on iOS.
- The example follows the Flutter example: a countdown and Cancel while an
  operation runs, an inquiry keeps its own reference, Close receipt is offered
  after settlement, and sign-on is asked only for Wi-Fi and USB.

## 0.2.0

Brings the package level with `com.amwal-pay:ecr-sdk` 1.0.6 and the current
local `AmwalECR` sources (CocoaPods and SwiftPM).

- **Sign-on.** `EcrTerminal.signOn()` asks a Wi-Fi or USB terminal what it is.
  Android calls the SDK for both. iOS calls AmwalECR `signOn` on Wi-Fi.
  USB, app to app, and Web Service still send nothing on iOS: there is no
  cable channel, and Web Service has nothing to sign on to.
  Closing the result popup calls `closeReceipt()` on Wi-Fi, on Android and iOS.
  USB still sends nothing on iOS.
- **USB cable and app to app on Android.** `usbCable` opens an accessory
  channel. `appToApp` hands the request to `com.amwalpay.pos` on the same
  device. iOS still answers `unsupported` for both. Wi-Fi and Web Service on
  iOS open through `EcrSessions.plan` / `EcrSessions.open`, the same path as
  the Flutter bridge.
- **Modes match TMS `ecrMode`.** 1 USB, 2 Wi-Fi, 3 Bluetooth, 4 Web Service,
  5 app to app. Bluetooth is stored and
  refused before anything is sent.
- **Local native SDKs.** `android/gradle.properties` and
  `ios/ecr_sdk.properties`, overridden by the example, select Maven / a sibling
  `:ecr-sdk` module / a JAR, and CocoaPods trunk / a sibling
  `AmwalECR-iOS-CocoaPods` checkout / the SwiftPM checkout path.
- The example app follows the Android ECR simulator: a terminal list (Check =
  sign-on), an editor for each mode, and a transaction screen for sale, void,
  refund, inquiry, and receipt. It saves terminals and keys with AsyncStorage
  and renders receipt QR codes with `qrcode`.
- Android manifest: `usb.host` feature (not required) and `<queries>` for
  `com.amwalpay.pos`, so USB and app to app work without app-side changes.
- Fix: the example's screen container lost its `flex: 1` to a duplicate style
  key, so every screen rendered empty and could not scroll.
- Fix: the example's iOS pods are raised to the project minimum deployment
  target, so AsyncStorage's resource bundle builds on current Xcode.
- Docs: transport support tables, sign-on / close receipt, Android manifest
  entries, and how to run the example (Yarn, `adb reverse`, rebuilding after
  native dependency changes, using the local Android SDK).

## 0.1.0

Never published before this entry — the two sections below ship together as the
first release.

- Add the `webService` transport: the terminal is driven through the Amwal
  payment host over REST, selected by `merchantId`, `terminalId` and
  `environment` in the config. No host address is needed; receipt fetch stays
  local-only and answers `unavailable`.
- Extend `EcrConfig` with `merchantId`, `terminalId` and `environment`
  (`'SIT' | 'UAT' | 'PROD'`), matching `com.amwal-pay:ecr-sdk` 1.0.5 and
  `AmwalECR` 0.2.1, which the native bridges now require. The native session
  path also now refuses an unsigned link (`secureHashKey` is required in
  practice — the terminal refuses what it cannot verify).
- Add `usbCable` to `EcrTransport`. It names the terminal profile's cable mode
  but is not driven by this library; it answers with a typed `unsupported`
  failure, like `bluetooth`.
- Report `partialApproval` and `authorizedAmount` on inquiry transactions.

And from the 2026-09-02 draft:

- Add the React Native TurboModule for Android and iOS.
- Wrap native ECR sale, void, refund, inquiry, inquiry-by-reference, receipt,
  reachability, and cancellation operations.
- Preserve approved, declined, failed, recovered, and unknown-outcome semantics
  across both platforms.
- Add a typed TypeScript API, example application, tests, packaging checks, and
  Codemagic verify/release workflows.
