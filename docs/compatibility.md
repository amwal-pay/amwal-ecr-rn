# Compatibility

| Layer | Version or minimum |
|---|---|
| `react-native-amwal-ecr` | 0.3.0 |
| React Native | 0.87.1 development baseline; peer dependency accepts supported host versions |
| Android provider | `com.amwal-pay:ecr-sdk:1.0.11` (Maven), or a local `:ecr-sdk` / JAR |
| Android | API 24+, Java 17, compile SDK 36 |
| iOS provider | `AmwalECR ~> 0.3.0`, or a local CocoaPods / SwiftPM checkout |
| iOS | 15.1+ with the current React Native baseline |
| Protocol | ECR protocol version 1 |

Android is pinned exactly because changing how a payment outcome is interpreted
must be deliberate. iOS uses the provider's compatible patch line so CocoaPods
can resolve a host application that also uses `AmwalECR` directly.

The two provider versions must move together and only after their cross-platform
contract fixtures pass. On iOS, Wi-Fi and Web Service open through
`EcrSessions.plan` / `EcrSessions.open` in AmwalECR 0.3.0, the same path the
Flutter iOS bridge uses. USB cable is a link in that SDK and needs a byte
channel this bridge does not supply, so USB and app to app answer unsupported
on iOS. Sign-on runs on Wi-Fi (and USB on Android). Close receipt runs on
Wi-Fi, USB on Android, and Web Service on both. Settlement runs on Wi-Fi,
USB, app to app, and Web Service on Android, and on Wi-Fi and Web Service on
iOS. Bluetooth is refused before anything is sent. There is no ethernet
transport. Web Service uses a 130 second read timeout unless the caller set one.

## Transport support

| Transport (`ecrMode`) | Android | iOS |
|---|---|---|
| `usbCable` (1) | USB accessory channel | `unsupported` |
| `wifi` (2) | Yes | Yes |
| `bluetooth` (3) | Refused | Refused |
| `webService` (4) | Yes | Yes |
| `appToApp` (5) | `com.amwalpay.pos` on the same device | `unsupported` |

Sign-on: Wi-Fi on both platforms, USB on Android. Close receipt: Wi-Fi and
Web Service on both, USB on Android. Settlement: Wi-Fi and Web Service on
both, USB and app to app on Android. App-to-app close receipt and Bluetooth answer without sending anything.
App-to-app print of a 384 px receipt image runs on Android. iOS answers
`FAILED` and sends nothing.

## Example app tooling

| Item | Value |
|---|---|
| Yarn | 4.11.0 (bundled in `.yarn/releases`) |
| Example storage | `@react-native-async-storage/async-storage` (native module) |
| Example QR receipt | `qrcode` |
| Example iOS pods | Deployment target raised to the project minimum in `post_install` |
