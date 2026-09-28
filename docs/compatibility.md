# Compatibility

| Layer | Version or minimum |
|---|---|
| `react-native-amwal-ecr` | 0.2.0 |
| React Native | 0.87.1 development baseline; peer dependency accepts supported host versions |
| Android provider | `com.amwal-pay:ecr-sdk:1.0.6` (Maven), or a local `:ecr-sdk` / JAR |
| Android | API 24+, Java 17, compile SDK 36 |
| iOS provider | `AmwalECR ~> 0.2.1`, or a local CocoaPods / SwiftPM checkout |
| iOS | 15.1+ with the current React Native baseline |
| Protocol | ECR protocol version 1 |

Android is pinned exactly because changing how a payment outcome is interpreted
must be deliberate. iOS uses the provider's compatible patch line so CocoaPods
can resolve a host application that also uses `AmwalECR` directly.

The two provider versions must move together and only after their cross-platform
contract fixtures pass. On iOS, Wi-Fi and Web Service open through
`EcrSessions.plan` / `EcrSessions.open` in AmwalECR 0.2.1, the same path the
Flutter iOS bridge uses. USB cable is a link in that SDK and needs a byte
channel this bridge does not supply, so USB and app to app answer unsupported
on iOS. Sign-on and close receipt run on Wi-Fi. Bluetooth is refused before
anything is sent. `ethernet` is accepted as Wi-Fi.

## Transport support

| Transport (`ecrMode`) | Android | iOS |
|---|---|---|
| `usbCable` (1) | USB accessory channel | `unsupported` |
| `wifi` / `ethernet` (2) | Yes | Yes |
| `bluetooth` (3) | Refused | Refused |
| `webService` (4) | Yes | Yes |
| `appToApp` (5) | `com.amwalpay.pos` on the same device | `unsupported` |

Sign-on and close receipt: Wi-Fi on both platforms, USB on Android only. Web
Service, app to app, and Bluetooth answer without sending anything.

## Example app tooling

| Item | Value |
|---|---|
| Yarn | 4.11.0 (bundled in `.yarn/releases`) |
| Example storage | `@react-native-async-storage/async-storage` (native module) |
| Example QR receipt | `qrcode` |
| Example iOS pods | Deployment target raised to the project minimum in `post_install` |
