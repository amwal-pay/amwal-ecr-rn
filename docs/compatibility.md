# Compatibility

| Layer | Version or minimum |
|---|---|
| `react-native-amwal-ecr` | 0.1.0 |
| React Native | 0.87.1 development baseline; peer dependency accepts supported host versions |
| Android provider | `com.amwal-pay:ecr-sdk:1.0.5` exactly |
| Android | API 24+, Java 17, compile SDK 36 |
| iOS provider | `AmwalECR ~> 0.2.1` |
| iOS | 15.1+ with the current React Native baseline |
| Protocol | ECR protocol version 1 |

Android is pinned exactly because changing how a payment outcome is interpreted
must be deliberate. iOS uses the provider's compatible patch line so CocoaPods
can resolve a host application that also uses `AmwalECR` directly.

The two provider versions must move together and only after their cross-platform
contract fixtures pass. `ethernet`, `wifi` and `webService` are supported —
the first two over TCP on the local network, `webService` through the Amwal
payment host over REST (`merchantId`, `terminalId` and `environment` in the
config select the terminal; receipt fetch stays local-only). `bluetooth` and
`usbCable` are reported as unsupported before anything is sent.
