# Changelog

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
