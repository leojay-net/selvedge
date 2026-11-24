# Selvedge for Android

An Android wallet that reviews every transaction before it is signed. It is a Mobile Wallet Adapter (MWA) wallet built on walletlib 2.2.1. Apps ask it to sign, and it decodes the transaction, simulates it against a Solana RPC, scores the risk, explains the result in plain English, and signs only after the user confirms. A `danger` verdict stops on a red warning screen and can only be overridden with a strong biometric.

Selvedge cannot intercept another wallet's Seed Vault prompt. It is the wallet the app talks to, and it signs through the Seed Vault Wallet SDK 0.4.0 behind a `SigningBackend` interface.

## What ran, honestly

| Item | Status |
| --- | --- |
| Kotlin engine (decode, risk SV-001 to SV-013, explain, mandate policy mirror) | Passes every case in `vectors/decode`, `vectors/risk` and `vectors/policy`: 14 + 21 + 289 = 324 |
| Signing backend on the emulator | The test wallet, a software Ed25519 key (BouncyCastle) stored in app storage. It is **not** hardware and the app labels it that way on screen. |
| Seed Vault backend | Code is written and compiles. It has **not** been run: no Seed Vault or Seed Vault simulator was installed on the emulator. See `docs/BLOCKED.md`. |
| MWA session against a real dapp | Code is written and compiles. It has **not** been exercised end to end. See `docs/BLOCKED.md`. |
| Mandates | Stored on the device and validated with the mirrored policy logic. The app does not submit them to Solana. |

## Layout

- `engine/`: pure Kotlin, no Android dependencies. Wire parser, instruction decoders, risk rules, scoring, explanations, `MandatePolicy`, RPC simulation client with timeouts, and the `SigningGate` state machine.
- `app/`: Compose UI, MWA session, signing backends, biometric prompt, local store.
- `../../vectors/`: shared conformance vectors, read by the JVM tests through a Gradle path with no copies.

## Run the tests

From `apps/android`, with JDK 17 and the Android SDK (platform 37.0, build-tools 36):

```
./gradlew :engine:test :app:testDebugUnitTest
```

Last run: engine 16 tests (the conformance test covers 324 vector cases), app 13 tests, all passing. The app tests include the gate state machine: a `danger` verdict cannot reach signing without a successful biometric.

Emulator tests (start an emulator first, for example `~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 -no-window -no-audio -no-boot-anim &`):

```
./gradlew :app:connectedDebugAndroidTest
```

Last run on `Medium_Phone_API_36.1`: 8 tests passing. They render every screen at 360dp and 840dp widths and save PNGs, run the Android accessibility checks on every screen, and drive the biometric override flow with a fake authenticator. The real biometric prompt was exercised by hand (see Screenshots).

## Build and install the release APK

The signing key is untracked. Create one under `keys/` (gitignored):

```
keytool -genkeypair -keystore keys/selvedge-release.jks -alias selvedge -keyalg RSA -keysize 4096 -validity 10000
```

Then write `keys/signing.properties` with `storeFile`, `storePassword`, `keyAlias` and `keyPassword`, and run:

```
./gradlew :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n net.selvedge.wallet/.MainActivity
```

The APK built and installed in the last run:

- Path: `apps/android/app/build/outputs/apk/release/app-release.apk` (not committed)
- Size: 4,349,722 bytes
- SHA-256: `eacb61118c4add820a6edfca916160115523fde809c96f6e5d43382578988b74`
- Signed with a self-signed release key (`CN=Selvedge Release`). A different key produces a different hash, so the build is not bit-for-bit reproducible across machines.

## Screenshots

Real `adb screencap` images from the release APK on the emulator, in `docs/screens/`:

- `01-onboarding.png`, `02-agents-empty.png`
- `03-spawn-agent.png`, `03b-spawn-agent-filled.png`
- `04-agents.png`, `05-mandate-editor.png`
- `06-review-paste.png` (the input field)
- `07-danger-warning.png`: the red warning for an unlimited token delegation, reviewed against devnet. The second finding is the simulation failing with `InvalidAccountForFee`, because the test transaction's fee payer has no devnet account.
- `09-override-cancelled.png`: after tapping Override, the real system biometric prompt appeared and was cancelled. The transaction stays unsigned and the override button is disabled.

The system biometric prompt itself cannot be screenshotted, because Android marks it as secure and `screencap` returns a black image. The prompt was shown on screen; only its capture is blank.

## Design

Tokens follow `docs/DESIGN-TOKENS.md`: one primary colour, a warm neutral scale and three verdict colours, no gradients. Fraunces, Inter and JetBrains Mono ship in `app/src/main/res/font/` with their OFL licences in `app/src/main/assets/licenses/`. The mark is a woven edge, drawn as an adaptive launcher icon with a monochrome variant. Motion is switched off when the system animation scale is zero.

## Toolchain

AGP 8.13.2, Gradle 8.14.3, Kotlin 2.3.21, compile SDK 37, minimum SDK 33. See `docs/DECISIONS.md` entries 14 to 22 for why AndroidX is pinned one generation behind the newest release.
