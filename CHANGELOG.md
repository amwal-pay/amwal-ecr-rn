# Changelog

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
  5 app to app. `ethernet` is still accepted as Wi-Fi. Bluetooth is stored and
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
