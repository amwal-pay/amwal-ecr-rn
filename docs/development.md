# Development

Local native SDKs, development, the example app, continuous integration, and the licence for `react-native-amwal-ecr`. Using the package is in the [README](../README.md).

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

[`codemagic.yaml`](../codemagic.yaml) runs on Codemagic. Every push and pull
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
