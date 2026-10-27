# Amwal ECR SDK for React Native

`react-native-amwal-ecr` drives an Amwal POS terminal from a React Native till on Android and iOS: sale, void, refund, inquiry, e-receipt, close receipt, and sign-on. Wi-Fi uses the terminal's ECR port. On Android, USB uses the cable and app to app hands the request to the payment app on the same device. Web Service uses HTTPS to the Amwal Hub. Card data stays on the terminal.

Package `react-native-amwal-ecr` **0.2.0**. Open one terminal, call the operation, then read the result. The package is a typed bridge over the native Amwal ECR SDKs, used unchanged: `com.amwal-pay:ecr-sdk` **1.0.6** on Android and `AmwalECR` **~> 0.2.1** on iOS.

## Install

- React Native New Architecture (TurboModules), Java 17, Android API 24 or later, iOS 15.1 or later.
- On iOS, Wi-Fi needs the local network permission in the app's `Info.plist`:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Connects to the payment terminal to take card payments.</string>
```

```bash
yarn add react-native-amwal-ecr
cd ios && pod install
```

Autolinking installs the Android module. Its manifest entries merge into your app: `INTERNET` and `ACCESS_NETWORK_STATE`, `android.hardware.usb.host` (not required), and `<queries>` for `com.amwalpay.pos` and its `com.amwalpay.pos.ecr.TRANSACTION` action.

Pin the version. A patch release can add API.

## Open a session

<a id="ecropenedsession"></a>

Create one `EcrTerminal` for the terminal and keep it, every sale, void, refund, inquiry, e-receipt, and close receipt can use it. Modes match the TMS `ecrMode` values: `usbCable` 1, `wifi` 2, `bluetooth` 3 (refused before anything is sent), `webService` 4, `appToApp` 5.

### Wi-Fi implementation

Each terminal shows its IP and port on the idle screen. Use that IP and port to connect from the till and send operations to that terminal. The till and the terminal must be on the same Wi-Fi.

```tsx
import { EcrTerminal } from 'react-native-amwal-ecr';

const terminal = new EcrTerminal({
  host: '192.168.1.50',          // port defaults to 9100
  serialNumber: 'P653200085189',
  transport: 'wifi',
  config: { secureHashKey: wifiKey },
});
```

### Web Service implementation

```tsx
const terminal = new EcrTerminal({
  serialNumber: 'P653200008251',
  transport: 'webService',
  config: {
    merchantId: '13593',
    terminalId: '101311',
    environment: 'UAT',          // 'SIT' is the default; 'PROD' for live
    secureHashKey: webServiceKey,
  },
});
```

Hub addresses stay inside the SDK. A Web Service terminal without `merchantId` or `terminalId` throws when it is created.

### USB cable implementation

Android only. There is no IP address. The terminal profile is USB cable, and the signing key is the Wi-Fi key. On iOS the call answers `failed` with `unsupported`, without sending anything.

```tsx
const terminal = new EcrTerminal({
  serialNumber: 'P653200085189',
  transport: 'usbCable',
  config: { secureHashKey: wifiKey },
});
```

A cable terminal uses the same sale, void, refund, inquiry, e-receipt, and close receipt calls as Wi-Fi.

### App to app implementation

Android only. Use app to app when the till is installed on the terminal itself. There is no address: the payment app is `com.amwalpay.pos`. The key is the Wi-Fi key. The payment app must be installed and a foreground Activity must exist, because the request is an Activity result exchange. The library never launches the payment app just to check for it.

```tsx
const terminal = new EcrTerminal({
  serialNumber: 'P653200085189',
  transport: 'appToApp',
  config: { secureHashKey: wifiKey },
});
```

## Operations

Amounts are plain decimal strings in major units (`'1.234'`), never a JavaScript number. Anything else throws `TypeError`. `merchantReferenceId` names this attempt. Save it before the call. Leave it blank and the SDK generates one and returns it on the result.

Every operation also has a `start…` form that returns an `EcrOperation` with `cancel()` and `result`. Cancelling stops your wait; it does not stop the terminal, and a cancelled sale is an unknown outcome.

### Sale

The cardholder presents the card on the terminal.

```tsx
const reference = 'ORDER-1001-1';
save(reference);

const result = await terminal.sale('1.234', { merchantReferenceId: reference });
```

Read `result` with the `switch` in [Read the result](#read-the-result).

### Void

Cancels an earlier transaction for its full amount. No card. The first argument is the receipt number (STAN). `originalTerminalId` names another terminal when the original was not taken on this one. The void has its own merchant reference.

```tsx
const result = await terminal.voidTransaction(stan, {
  originalTerminalId: '',
  merchantReferenceId: 'ORDER-1001-V1',
});
```

### Refund

Returns some or all of an earlier transaction. The cardholder presents the card. `transactionDate` is the original day, `yyyyMMdd`.

```tsx
const result = await terminal.refund('1.000', {
  receiptNumber: stan,
  transactionDate: '20261019',
  originalTerminalId: '',
  merchantReferenceId: 'ORDER-1001-R1',
});
```

### Inquiry by receipt number

Reads a transaction. No card, no money. Safe to repeat, and the terminal answers even while another payment is in progress.

```tsx
const inquiry = await terminal.inquire({
  receiptNumber: stan,
  transactionDate: '20261019',
});
```

### Inquiry by merchant reference

Reads the attempt you named. Use this when the sale, void, or refund never answered: you still have the reference you sent, and you do not yet have a receipt number. `transactionDate` is optional, and `originalTerminalId` names another terminal.

```tsx
const inquiry = await terminal.inquireByReference('ORDER-1001-1');
```

### E-receipt

Wi-Fi, USB, and app to app. Returns a URL for a QR code. Safe to repeat. `ready` carries `url`. `unavailable` means there is no receipt to show. `failed` means the exchange failed; repeat the call.

```tsx
const receipt = await terminal.receipt({
  receiptNumber: stan,
  transactionDate: '20261019',
});

if (receipt.outcome === 'ready') showQr(receipt.url);
```

On Web Service there is no receipt URL to return.

### Close receipt

<a id="close-receipt"></a>

Wi-Fi on Android and iOS, USB on Android. Asks the terminal to leave the receipt screen and return to idle. Call it from the till's Close receipt action when the cashier is finished. Sale, void, refund, and dismissing a dialog do not send it. Safe to repeat: `idle` means the terminal is idle, whether a receipt was up or not.

```tsx
const closed: any = await terminal.closeReceipt();

switch (closed.outcome) {
  case 'idle':
    break;
  case 'refused':
    show(closed.reason);            // firmware has no CLOSE_RECEIPT; leave the receipt up
    break;
  case 'failed':
    show(closed.failure.message);   // nothing changed; the call can be repeated
    break;
}
```

Over app to app and Web Service the call answers `failed` with `unsupported`, without sending anything: app to app has already closed the receipt by the time the till has its answer, and over Web Service the terminal is not on this counter.

### Settlement

<a id="settlement"></a>

Not in this package yet. The terminal settles its batch from a till over Wi-Fi, USB, app to app, and Web Service, and the [Kotlin SDK](https://github.com/amwal-pay/ECR-simulator/blob/main/ecr-sdk/README.md#settlement) from 1.0.11 sends it over Wi-Fi, USB, and app to app. `react-native-amwal-ecr` 0.2.0 has no settlement call; settle from the terminal's merchant menu.

### Sign-on

Wi-Fi on Android and iOS, USB on Android. Asks the terminal what it will accept before you offer operations to the cashier. `available` carries `capabilities`: the terminal name, `ecrMode`, currency, whether e-receipt and physical receipt are on, and the permitted operations with their limits.

```tsx
const signOn = await terminal.signOn();

switch (signOn.outcome) {
  case 'available': {
    const { terminalName, permitted } = signOn.capabilities;
    // permitted: [{ messageType, minAmount, maxAmount }, ...]
    break;
  }
  case 'unavailable':
    show(signOn.reason);
    break;
  case 'failed':
    show(signOn.failure.message);
    break;
}
```

Over app to app and Web Service it answers without sending anything. A later decline can carry `capabilities` when the terminal refused because its profile changed, so the till can refresh what is permitted without signing on again.

### Reachability

Wi-Fi, before a sale. Proves the port answers. It does not prove the terminal is idle.

```tsx
if (!(await terminal.isReachable())) show('The terminal is not reachable');
```

`probeTimeoutMs` is 3 seconds. `isReachable()` resolves `false` for every transport that has no local listener to probe, including Web Service.

## Read the result

<a id="handle-the-result"></a>

`sale`, `voidTransaction`, and `refund` return `EcrResult`, a union on `outcome`.

```tsx
switch (result.outcome) {
  case 'approved':
    record(result.merchantReferenceId, result.amount, result.rrn, result.authCode);
    if (result.partialApproval) collectBalance(result.requestedAmount, result.amount);
    break;

  case 'declined':
    if (result.outcomeIsUnknown) markUnresolved(result.merchantReferenceId);   // 91
    else show(result.reason);
    break;

  case 'failed':
    if (result.settled && result.recovered?.outcome === 'found') apply(result.recovered.transaction);
    else if (result.outcomeIsUnknown) markUnresolved(result.merchantReferenceId);
    else show(result.failure.message);
    break;
}
```

| Result                                  | Meaning                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approved`                              | Money moved. `amount` is what was taken or returned. `responseCode` is `00` on a plain approval. `maskedPan` is masked.                                                |
| `approved` with `partialApproval`       | The issuer authorised less than you asked. `requestedAmount` is what you asked. Collect the difference before you hand over the goods.                                 |
| `declined`                              | The terminal answered and refused. `reason` is the text to show. Code `91` has `outcomeIsUnknown` true: inquire.                                                       |
| `failed` and `unreachable`              | Nothing was sent.                                                                                                                                                       |
| `failed` and `outcomeIsUnknown`         | The request went out and the answer did not settle it: timeout, connection lost, malformed answer, a signature that does not match, or a cancelled wait. The payment may have completed. |
| `failed` and `settled`                  | The SDK already inquired. `recovered` is `found`. Record that transaction.                                                                                              |
| `failed` and `unsupported`              | This platform or transport cannot do it. Nothing was sent.                                                                                                              |
| `TypeError`                             | The call was rejected before anything was sent. A merchant reference longer than 32 characters, or one that contains whitespace, `&`, or `=`, throws here.             |

`outcomeIsUnknown` is the field to decide on.

### Inquiry

| Result     | Meaning                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `found`    | `transaction` is the record. `status` is the outcome (`Approved`, `Declined`, `Voided`, or other text from the backend). Compare it ignoring case. |
| `notFound` | This lookup returned no record. `reason` is the backend's text when it sent any.                                                                   |
| `failed`   | The lookup itself failed. Repeat the inquiry. An inquiry does not move money.                                                                      |

On `found`, `transaction.stan` is the receipt number. `canVoid` and `canRefund` say whether the terminal would accept that operation now. When `partialApproval` is set, `amount` is what was asked and `authorizedAmount` is what was charged.

## Important notes

### Resolve an unknown outcome

<a id="resolve-an-unknown-outcome"></a>

`outcomeIsUnknown` means the payment may have completed. Inquire by the merchant reference of that attempt. Charge the order again only after `transaction.status` is `Declined`, or after the terminal confirms the attempt did not complete.

1. Save the reference before `sale`, `voidTransaction`, or `refund`.
2. Read `result.settled` first. With `autoInquireOnFailure` left on (the default), the SDK has already called `inquireByReference` once. `found` settles the attempt. `notFound`, `failed`, or no `recovered` leaves it unknown.
3. Call `inquireByReference` with the saved reference.
4. Read `transaction.status`, ignoring case.
   - `Approved` — the attempt completed. On a void or refund, the void or refund completed.
   - `Declined` — it did not. A new attempt needs a new reference.
   - Any other value, including `Voided` and `Reversed` — leave the order unresolved.
5. `notFound` after a lost answer means this lookup returned no record. The same answer follows a terminal reset, or a record that has aged out. Confirm on the terminal, or with Amwal, before you take payment again.
6. `failed` means the lookup failed. Inquire again.
7. On startup, inquire every attempt still marked unresolved.

`unreachable` means the connection was never made. There is no attempt to look up.

### Merchant reference

32 characters maximum, with whitespace, `&`, and `=` excluded. The package trims the value. Use one reference per attempt; an order number plus an attempt suffix fits. A void and a refund each get a new reference.

### Receipt number

`approved` does not carry it. Read `transaction.stan` from an inquiry by merchant reference, or read the printed receipt. Pass that receipt's day as `yyyyMMdd` to refund, inquiry by receipt number, and e-receipt. A receipt number is unique on one terminal for one day.

### Amounts and currency

`currencyCode` defaults to `'512'` and `minorUnitDigits` to `3` (OMR). Another currency needs both. The native SDK converts to minor units once. Amounts come back as strings in major units (`'1.234'`).

### Timeouts

| Transport          | Wait                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Wi-Fi              | `connectTimeoutMs` 10 s, then `responseTimeoutMs` 120 s. A lost answer can add one more wait for the automatic inquiry. |
| USB and app to app | `responseTimeoutMs` 120 s.                                                                                   |
| Web Service        | 130 s when `responseTimeoutMs` is left at 120 s. Any other value is kept.                                    |

The default wait covers card present and PIN. Cancelling ends the wait in your app. A request that already reached the terminal can still complete.

### Keys

Amwal issues the secret per terminal. Wi-Fi, USB, and app to app share one key; Web Service uses its own. Both travel through `config.secureHashKey`. Keep them in the platform keychain or keystore, never in source, logs, analytics, or crash reports.

### Logging

The bridge does not log, and it opens the native SDK with its logger off. Log the results you receive in your own app if you need a record.

## When you build the message yourself

This package does not expose the message types or the wire format; every operation is a typed method on `EcrTerminal`. The wire format is in [the protocol](https://github.com/amwal-pay/ECR-simulator/blob/main/ecr-sdk/docs/protocol.md). Local native SDKs, development, the example app, and continuous integration are in [Development](docs/development.md).
