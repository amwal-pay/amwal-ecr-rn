Sample till for `react-native-amwal-ecr`, laid out like the Android ECR simulator:

- **ECR** opens first. The app bar’s terminals icon opens **POS terminals**.
  Back returns to the transaction. **+** opens **Add terminal**; editing a
  card opens **Terminal**.
- Transaction type, amount (mills: 1234 → 1.234), sale reference, inquiry by
  receipt or reference, then the POS terminal, its sign-on line, and the
  active-terminal card. **Start transaction** / **Look up transaction** stays
  disabled until that terminal’s signing key and address are complete.
- Result dialog: approved, partial approval, declined, outcome unknown with
  Inquire by reference, raw response, and a QR receipt after an inquiry.
  Closing it asks a Wi-Fi or USB terminal to close its receipt.
- POS terminals: Wi-Fi/LAN and Web Service signing cards (SIT / UAT / PROD),
  and a card per terminal with Check, Edit, and Delete.

Terminals and signing keys are saved on the device with
`@react-native-async-storage/async-storage`, a native module: after installing
dependencies, rebuild the app (`pod install` on iOS) rather than only reloading.

Install from the repository root (the example is a workspace):

```sh
yarn   # or: node .yarn/releases/yarn-4.11.0.cjs install
```

Local native SDKs are selected in `android/gradle.properties` and
`ios/ecr_sdk.properties`. This example defaults to the sibling
`ECR-simulator` module and `AmwalECR-iOS-CocoaPods` checkout. On Android the
package's own `gradle.properties` wins over this one, so build with
`--extra-params "-PecrSdkDependency=project"` to use the local SDK. See the
package README sections "Local native SDKs" and "Running the example".

This is a [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

On a USB-connected phone also run `adb reverse tcp:8081 tcp:8081`, or the app
shows "Unable to load script".

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
