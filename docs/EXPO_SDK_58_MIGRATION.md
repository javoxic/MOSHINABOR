# Expo SDK 54 → SDK 58 migration (mobile)

|        |                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch | `upgrade/expo-sdk-58`, from `release/staging-pilot` at `4b927ea`                                                                                                                                                                                                                                                          |
| Date   | 2026-11-10                                                                                                                                                                                                                                                                                                                |
| Goal   | Open MOSHINA BOR in the current **Expo Go (SDK 58)** on iPhone                                                                                                                                                                                                                                                            |
| Result | Dependencies, configuration and code are on SDK 58. Typecheck, lint, all automated tests, both `expo export` variants and an iOS dev bundle served by `expo start` pass. **Not yet verified on a physical iPhone in Expo Go** (no device in this environment); see [What still needs a phone](#what-still-needs-a-phone). |

`release/staging-pilot` and `claude/jolly-mayer-wxbmkx` were not modified. The working tree was clean before the upgrade, so nothing needed stashing.

## Sources used

The official upgrade guide (<https://expo.dev/blog/how-to-upgrade-to-sdk-58>) and the SDK changelogs on `expo.dev` **could not be read**: `expo.dev`, `exp.host` and `api.expo.dev` are not reachable from this environment (DNS `ENOTFOUND`). These authoritative sources from the npm registry were used instead:

- `expo@58.0.23` (npm `latest`): its `bundledNativeModules.json`, the version map `expo install` uses;
- `expo-template-default@58.0.32`: the official SDK 58 project template (React, React Native, TypeScript and `@types/react` versions);
- the installed packages' own `CHANGELOG.md` files, read for every "Breaking changes" entry since the SDK 54 versions;
- `npx expo install --check/--fix`, run with `EXPO_OFFLINE=1` so the CLI reads the local `bundledNativeModules.json` (the CLI warns that offline validation is "unreliable", because it cannot fetch the online list);
- `expo-doctor` 1.21.6.

Before relying on this branch, re-read the official guide from a machine with internet access and compare.

## Platform requirements (SDK 58)

|                       | Requirement                                                      | Note                                                                |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Node.js               | `^22.13.0 \|\| ^24.3.0 \|\| ^26 \|\| >=27` (`expo@58` `engines`) | Your Node 24.20.0 is supported. This environment used Node 22.23.4. |
| pnpm                  | 10.28.0 (unchanged)                                              |                                                                     |
| iOS deployment target | 16.4 (raised in SDK 56, per the module changelogs)               | Only matters for EAS/native builds; Expo Go brings its own runtime  |
| Architecture          | New Architecture only                                            | `newArchEnabled` no longer exists in the config schema              |

## Dependency changes

`mobile/package.json` (all versions are the ones `expo@58.0.23` / the SDK 58 template specify):

| Package                                  | SDK 54   | SDK 58   |
| ---------------------------------------- | -------- | -------- |
| `@react-native-community/datetimepicker` | 8.4.4    | 9.2.1    |
| `@react-native-community/netinfo`        | 11.4.1   | 12.0.1   |
| `expo`                                   | 54.0.38  | 58.0.23  |
| `expo-application`                       | ~7.0.8   | ~58.1.2  |
| `expo-constants`                         | ~18.0.14 | ~58.0.15 |
| `expo-device`                            | ~8.0.10  | ~58.0.5  |
| `expo-font`                              | ~14.0.12 | ~58.0.11 |
| `expo-haptics`                           | ~15.0.8  | ~58.0.7  |
| `expo-image`                             | ~3.0.11  | ~58.0.18 |
| `expo-image-manipulator`                 | ~14.0.8  | ~58.0.16 |
| `expo-image-picker`                      | ~17.0.11 | ~58.0.10 |
| `expo-linking`                           | ~8.0.12  | ~58.0.16 |
| `expo-localization`                      | ~17.0.9  | ~58.0.5  |
| `expo-notifications`                     | ~0.32.17 | ~58.1.8  |
| `expo-router`                            | ~6.0.24  | ~58.0.30 |
| `expo-secure-store`                      | ~15.0.8  | ~58.0.2  |
| `expo-splash-screen`                     | ~31.0.13 | ~58.0.13 |
| `expo-status-bar`                        | ~3.0.9   | ~58.0.4  |
| `expo-system-ui`                         | ~6.0.9   | ~58.0.7  |
| `expo-web-browser`                       | ~15.0.11 | ~58.0.7  |
| `react`                                  | 19.1.0   | 19.3.0   |
| `react-native`                           | 0.81.5   | 0.88.1   |
| `react-native-gesture-handler`           | ~2.28.0  | ~3.3.0   |
| `react-native-reanimated`                | ~4.1.1   | ~4.7.1   |
| `react-native-safe-area-context`         | ~5.6.0   | ~5.11.1  |
| `react-native-screens`                   | ~4.16.0  | ~4.30.1  |
| `react-native-svg`                       | 15.12.1  | 15.16.0  |
| `react-native-worklets`                  | 0.5.1    | 0.13.0   |
| `@types/jest`                            | ^29.5.14 | ^30.0.0  |
| `@types/react`                           | ~19.1.10 | ~19.3.0  |
| `jest`                                   | ~29.7.0  | ~30.5.2  |
| `jest-expo`                              | ~54.0.18 | ~58.0.14 |
| `react-test-renderer`                    | 19.1.0   | 19.3.0   |
| `typescript`                             | ~5.9.3   | ~6.0.3   |

Unchanged (already compatible, or not SDK-managed): `@react-native-async-storage/async-storage` 2.2.0 (SDK 58 still expects 2.2.0), `@expo/vector-icons`, TanStack Query, axios, i18next/react-i18next, react-hook-form, zod, zustand, `@testing-library/react-native` 13.3.3, ESLint packages.

`admin/package.json`: `react`/`react-dom` 19.1.0 → **19.3.0**, `@types/react`/`@types/react-dom` ~19.1 → **~19.3**. Required by the workspace, see §Problems found (1).

`pnpm-lock.yaml` was regenerated by pnpm 10.28.0. `pnpm install --frozen-lockfile` succeeds from a clean state.

## Configuration changes

| File                                                   | Change                                                                         | Why                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mobile/app.config.ts`                                 | Removed `newArchEnabled: true`                                                 | The field no longer exists in SDK 58's `ExpoConfig` type; the New Architecture is the only one                                                                                                                                         |
| `mobile/app.config.ts`                                 | Removed the top-level `splash` block                                           | No longer in the config schema. The splash screen is configured by the existing `expo-splash-screen` plugin with the same image and background colour (`#0B0D10`), so the visual result is unchanged by design.                        |
| `mobile/app.config.ts`                                 | Added plugins `expo-font`, `expo-image`, `expo-status-bar`, `expo-web-browser` | `expo install --fix` reported that these SDK 58 modules ship config plugins and must be listed. It cannot edit a dynamic `app.config.ts` itself.                                                                                       |
| `mobile/tsconfig.json`                                 | Removed `baseUrl`; `"@/*": ["./src/*"]`                                        | TypeScript 6 rejects `baseUrl` (TS5101) and requires relative `paths` without it (TS5090). Resolution is identical, because `paths` resolve relative to `tsconfig.json`, which is the same directory.                                  |
| `mobile/expo-env.d.ts`                                 | No longer tracked; `mobile/.gitignore` (generated by `expo start`) ignores it  | SDK 58 regenerates this file and marks it "should be in your git ignore". Typecheck was verified to pass without it (fresh clone / CI).                                                                                                |
| `babel.config.js`, `metro.config.js`, `jest.config.js` | **No change needed**                                                           | `babel-preset-expo` adds the Reanimated 4 / worklets plugin automatically. The monorepo Metro config (`watchFolders`, `nodeModulesPaths`, `resolverMainFields`) works unchanged. `jest-expo` 58 works with the existing preset config. |
| `eas.json`                                             | No change                                                                      | Profiles validated earlier; build numbers are remote                                                                                                                                                                                   |

## Code changes (no screens, design, texts, API calls or translations changed)

| Where                                                                                                                   | Change                                                                                | Why                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 forms (`phone`, `profile-setup`, `edit-profile`, `ExpenseForm`, `ScheduleForm`, `ServiceRecordFields`, `VehicleForm`) | `onPress={submit}` → `onPress={() => void submit()}` (the same for `onSubmitEditing`) | React Native 0.88's press-event type is no longer assignable to react-hook-form's `BaseSyntheticEvent` (TS2322). react-hook-form now receives no event, and it handles that case identically.                                                                                                                                                                  |
| `verify.tsx`, `Fields.tsx`                                                                                              | `useRef<TextInput>` / `forwardRef<TextInput, …>` → `TextInputInstance`                | RN 0.88's generated types export `TextInputInstance` as the ref type. `.focus()` is still available.                                                                                                                                                                                                                                                           |
| `(tabs)/_layout.tsx`                                                                                                    | The tab icon accepts RN's `ColorValue` and passes the string to `Ionicons`            | RN 0.88 types the tab tint as `ColorValue`; the tab bar always passes a colour string                                                                                                                                                                                                                                                                          |
| `usePushRegistration.ts`                                                                                                | `addPushTokenListener` wrapped in `try/catch`; cleanup uses `tokenSub?.remove()`      | **Runtime breaking change:** since expo-notifications 55 this call **throws** in Expo Go on Android (iOS only warns). It ran synchronously inside a `useEffect` after sign-in, so the app would have crashed. The other notification listeners are still registered. New regression test `push-registration.test.ts` fails without the fix and passes with it. |

## Breaking changes reviewed against this app

Collected from each installed module's CHANGELOG between its SDK 54 and SDK 58 versions:

| Module                             | Breaking change                                                                      | Impact on MOSHINA BOR                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| expo-notifications 58.0            | Foreground notifications are shown unless `setNotificationHandler` says otherwise    | None: the app sets an explicit handler (banner, list, sound)                                               |
| expo-notifications 55.0            | Android: throw instead of warn when push is used in Expo Go                          | **Fixed** (see above)                                                                                      |
| expo-notifications 58.0            | Android FCM `dataString` no longer overrides data                                    | None: the server sends `data` only                                                                         |
| expo-status-bar 56.0               | `backgroundColor`, `translucent` and `networkActivityIndicatorVisible` props removed | None: only `style="light"` is used                                                                         |
| expo-localization 58.0             | iOS RTL follows `I18nManager`                                                        | None: uz/ru/en are left-to-right                                                                           |
| expo-font 57/58                    | Web-only and `getLoadedFonts()` naming changes                                       | None: not used                                                                                             |
| expo-device 55.0.15                | Some iPad/iPhone SE model names changed                                              | Only affects the device name shown in the admin                                                            |
| All modules 56.0                   | Minimum iOS 16.4                                                                     | Native builds only                                                                                         |
| react-native-gesture-handler 2 → 3 | Major version                                                                        | The app uses only `GestureHandlerRootView`, which still exists (typecheck passes)                          |
| expo-router 6 → 58                 | Versioning aligned with the SDK (no CHANGELOG shipped in the package)                | Typed routes, `Stack`/`Tabs`/`Redirect`, `router.push` with typed params: typecheck and routing tests pass |

## Problems found and fixed during the upgrade

1. **Two React copies (would crash at runtime).** After the upgrade, mobile needed React 19.3.0 while admin still pinned 19.1.0. With pnpm's `node-linker=hoisted`, shared libraries (`@tanstack/react-query`, `react-hook-form`, `use-sync-external-store`, …) got nested React 19.1 copies, and 19 of 31 mobile tests failed with `Cannot read properties of null (reading 'useEffect')`. **Fix:** one React version (19.3.0) across the workspace. Admin type-check, unit tests, build and Playwright end-to-end tests pass on 19.3. The served iOS dev bundle was checked to contain exactly one `node_modules/react/index.js`.
2. **Stale nested Metro package.** `expo-doctor` reported `@expo/metro` 58.0.0 with `metro-cache-key` 0.83.3 (expected 0.87.1). The lockfile was correct; the leftover came from upgrading the hoisted `node_modules` in place. **Fix:** a clean reinstall from the lockfile (`node_modules` removed, `pnpm install --frozen-lockfile`). **Do the same on your machine** (see the commands below).
3. **The Expo Go push crash** (see Code changes).

## Remaining warnings (accepted, documented)

| Warning                                                                                                         | Why it is acceptable                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo-router` optional peer `@testing-library/react-native >= 14` (13.3.3 installed)                            | The peer is marked optional and is used only by `expo-router/testing-library`, which the app doesn't use. Upgrading would mean rewriting working tests for v14's API (`test-renderer`). That's a candidate for a separate change.               |
| `react-i18next` optional peer `typescript@^5` (6.0.3 installed)                                                 | Optional peer; typecheck passes                                                                                                                                                                                                                 |
| `expo-doctor`: "Check Expo config schema" and "React Native Directory" failed                                   | Both need `exp.host` / reactnative.directory, which are unreachable here. The config was instead validated by SDK 58's `ExpoConfig` types (typecheck) and by `expo config` resolving all plugins. **Re-run `npx expo-doctor` on your machine.** |
| `expo start`: "Unable to resolve manifest assets … aborted"                                                     | Offline sandbox (`EXPO_OFFLINE=1`); asset URLs could not be prepared in time. Re-check on your machine; icons and fonts load from the dev server.                                                                                               |
| Jest: one intermittent failure in 7 full runs (`vehicles-maintenance` › "shows field errors for an empty form") | Seen once, on the first run right after reinstalling. It then passed in 6 consecutive runs, including 2 with a cleared Jest cache. The test passes on its own. Likely a 1 s `findAllByText` timeout during cold Babel transforms.               |

## Verification results (this environment, 2026-11-10)

| Check                                                               | Result                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `EXPO_OFFLINE=1 npx expo install --check`                           | "Dependencies are up to date"                                                         |
| `npx expo-doctor`                                                   | 18/20 passed; the 2 failures are network-only (see above)                             |
| `expo config --type public`                                         | `sdkVersion` 58.0.0; all 11 plugins resolve                                           |
| Typecheck (all workspaces, mobile on TypeScript 6.0.3)              | pass                                                                                  |
| ESLint (all workspaces)                                             | pass                                                                                  |
| Prettier                                                            | pass                                                                                  |
| Mobile Jest (jest 30.5.2, jest-expo 58.0.14)                        | **33/33** (31 existing + 2 new), 9 suites; one intermittent failure seen once (above) |
| Shared / validation / backend / admin unit                          | 59/59, 8/8, 130/130 (16 suites), 8/8                                                  |
| Admin Playwright end-to-end (React 19.3)                            | 10/10                                                                                 |
| Backend build, admin build                                          | pass                                                                                  |
| `expo export` production and pilot (Android + iOS, Hermes)          | pass (Android 2286 modules, iOS 2308 modules)                                         |
| `expo start` → iOS manifest (as Expo Go requests it)                | `sdkVersion` 58.0.0; `apiUrl` from `EXPO_PUBLIC_API_URL`                              |
| `expo start` → iOS dev bundle (`dev=true`, as Expo Go downloads it) | HTTP 200, 13.0 MB, 2442 modules, React 19.3.0, one React copy                         |
| `pnpm audit --prod`                                                 | 1 low (previously 2 high + 1 low: the build-time `image-size` advisory is gone)       |

## What still needs a phone

None of these were tested; they require Expo Go on a physical iPhone:

- [ ] The app opens in Expo Go SDK 58 from the QR code (no "incompatible SDK" message)
- [ ] Expo Router navigation: language → phone → code → profile → tabs → detail screens → back
- [ ] SecureStore: tokens survive an app restart (still signed in)
- [ ] Notifications: permission prompt; the in-app list. **Remote push in Expo Go is limited**: Android has none since SDK 53, and on iOS push needs an EAS project ID. Real push testing requires an EAS development or pilot build ([MOBILE_PUSH_SETUP.md](MOBILE_PUSH_SETUP.md)).
- [ ] Image Picker: camera and gallery permissions; picking a photo
- [ ] Image Manipulator: an iPhone HEIC photo is converted to JPEG and uploads
- [ ] Reanimated / Gesture Handler: screen transitions and gestures are smooth (used indirectly by the navigation)
- [ ] Haptics, the date picker, the offline banner

## Running on an iPhone with Expo Go (Windows)

The backend must be running and reachable from the phone (see the local setup instructions). Then, in PowerShell:

```powershell
cd $HOME\Documents\MOSHINABOR
git fetch origin
git checkout upgrade/expo-sdk-58
git pull
# clean reinstall: avoids the stale nested packages described in Problems (2)
Remove-Item -Recurse -Force node_modules, mobile\node_modules, admin\node_modules, backend\node_modules, packages\*\node_modules -ErrorAction SilentlyContinue
pnpm install --frozen-lockfile
pnpm build:packages
cd mobile
# mobile\.env must contain: EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:3000
npx expo-doctor
npx expo start --clear
```

Scan the QR code with the iPhone **Camera** app; it opens in Expo Go. iPhone and PC must be on the same Wi‑Fi, and Windows Firewall must allow ports 3000 and 8081 on private networks. If the phone cannot reach the PC (e.g. on a guest network), use `npx expo start --clear --tunnel`. The API URL must still be reachable from the phone.
