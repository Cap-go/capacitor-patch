# @capgo/capacitor-patch

<a href="https://capgo.app/">
  <img
    src="https://capgo.app/readme-banner.svg?repo=Cap-go/capacitor-patch"
    alt="Capgo - Instant updates for Capacitor"
  />
</a>

<div align="center">
  <h2>
    <a href="https://capgo.app/?ref=plugin_capacitor_patch">Get Instant updates for your App with Capgo</a>
  </h2>
  <h2>
    <a href="https://capgo.app/consulting/?ref=plugin_capacitor_patch">
      Missing a feature? We can build the plugin for you
    </a>
  </h2>
</div>

Capacitor plugin for applying vetted Capgo patches during `cap sync` and `cap update`.

## Why

Some Capacitor fixes can sit in upstream pull requests for a long time. This package gives apps a repeatable way to apply small, version-gated patches to Capacitor core packages, Capacitor plugins, the CLI, or generated native projects without each app maintaining its own patch scripts.

The plugin is hook-only. It has no native runtime API.

## Install

```bash
npm install @capgo/capacitor-patch
npx cap sync
```

## Enable Patches

`@capgo/capacitor-patch` is a no-op by default. List the bundled fixes, then opt in to the patch IDs your app needs:

```bash
npx capgo-capacitor-patch list --all
```

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'Example',
  webDir: 'dist',
  plugins: {
    CapacitorPatch: {
      patches: ['upstream-pr-8418-android'],
      strict: true,
    },
  },
};

export default config;
```

Then run:

```bash
npx cap sync
```

Package patches run before `sync` and `update`. Native project patches run after `sync` and `update`.

`recommended: true` is also supported for fixes Capgo marks as recommended in the catalog.

## Configuration

```ts
plugins: {
  CapacitorPatch: {
    recommended: true,
    patches: ['patch-id-a', 'patch-id-b'],
    disabled: ['patch-id-c'],
    strict: true,
  },
}
```

| Option        | Type       | Default | Description                                                       |
| ------------- | ---------- | ------- | ----------------------------------------------------------------- |
| `recommended` | `boolean`  | `false` | Apply all Capgo-recommended compatible patches.                   |
| `patches`     | `string[]` | `[]`    | Explicit patch IDs to apply.                                      |
| `disabled`    | `string[]` | `[]`    | Patch IDs to skip, even if recommended or listed.                 |
| `strict`      | `boolean`  | `false` | Throw when a selected patch is incompatible or no longer applies. |

## CLI

```bash
npx capgo-capacitor-patch list --all
npx capgo-capacitor-patch doctor
npx capgo-capacitor-patch apply
```

Commands:

- `list` shows catalog patches. Add `--all` to include unselected patches.
- `doctor` dry-runs selected patches and reports what would happen.
- `apply` applies selected patches manually.

Useful options:

- `--root <dir>` sets the app root.
- `--phase package|native|all` limits which patch phase runs.
- `--platform ios|android` applies platform filtering outside a Capacitor hook.
- `--strict` treats selected patch failures as errors.

## Patch Catalog

Patches live in `patches/catalog.json` and reference unified diff files shipped with this package.

Catalog entries use this shape:

```json
{
  "id": "capacitor-android-example",
  "title": "Short human-readable fix title",
  "recommended": true,
  "phase": "package",
  "platforms": ["android"],
  "target": {
    "packageName": "@capacitor/android",
    "versionRange": ">=8.0.0 <9.0.0"
  },
  "patchFile": "patches/capacitor-android-example.patch",
  "upstream": {
    "issue": "https://github.com/ionic-team/capacitor/issues/0000",
    "pullRequest": "https://github.com/ionic-team/capacitor/pull/0000"
  }
}
```

For generated native project files, use `"phase": "native"` and `"target": { "type": "native" }`. Diff paths are relative to the app root. For package patches, diff paths are relative to the target package root.

### Built-in patches

The bundled catalog tracks external fix PRs mirrored by Capacitor+ auto-sync branches named `sync/upstream-pr-*`. These entries are explicit opt-in patches by default, so apps can choose the fixes they need without receiving every pending upstream change automatically.

Run `capgo-capacitor-patch list --all` to see the shipped catalog. Each entry includes the original upstream Capacitor PR URL, the Capacitor+ sync branch, target package, supported version range, and patch file.

## Future Automation

The long-term goal is to make this repository the fast path for Capacitor fixes that are waiting upstream.

For every external PR opened against `ionic-team/capacitor`, the automation should:

1. Detect whether the PR is a fix that changes shipped Capacitor code.
2. Wait until the upstream PR, or the matching Capacitor+ `sync/upstream-pr-*` branch, passes its test suite.
3. Generate package-ready patch files in this repository.
4. Open or update a pull request here with the new `patches/catalog.json` entries and patch files.
5. Run this repository's tests against supported Capacitor versions.
6. Comment on the original upstream PR with the quick-patch ID and install snippet once the patch package PR is ready.

The upstream PR comment should only be posted when the patch applies cleanly and this repository's checks pass. A good comment looks like:

````md
This fix is available as a quick patch through `@capgo/capacitor-patch`.

Patch ID: `upstream-pr-8418-android`

```ts
plugins: {
  CapacitorPatch: {
    patches: ['upstream-pr-8418-android'],
    strict: true,
  },
}
```

Run `npx cap sync` after installing `@capgo/capacitor-patch`.
````

When a fix is merged and released upstream, the catalog entry should either narrow its version range to the affected releases or be removed in the next major catalog cleanup.

## Contributing Patches

Patch contributions should be small, traceable, and easy to remove once upstream ships the fix.

### Good patch candidates

- Fixes from external Capacitor PRs that are not merged or not released yet.
- Fixes mirrored by Capacitor+ `sync/upstream-pr-*` branches.
- Small bug fixes for `@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/cli`, Capacitor plugins, or generated native project files.
- Changes that can be expressed as a unified diff and safely version-gated.

Avoid broad refactors, formatting-only changes, feature work, generated lockfile changes, test-only changes, and patches that require app-specific assumptions.

### Patch file rules

Patch files live in `patches/` and must be unified diffs.

Use this naming pattern:

```text
patches/upstream-pr-<number>-<target>.patch
```

Examples:

```text
patches/upstream-pr-8418-android.patch
patches/upstream-pr-8304-ios.patch
patches/upstream-pr-8271-core.patch
patches/upstream-pr-8458-cli.patch
```

For package patches, paths are relative to the installed npm package root:

| Target package       | Patch paths look like                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@capacitor/android` | `capacitor/src/main/java/com/getcapacitor/Bridge.java`                                                          |
| `@capacitor/ios`     | `Capacitor/Capacitor/Router.swift`                                                                              |
| `@capacitor/core`    | `dist/index.js`, `dist/index.cjs.js`                                                                            |
| `@capacitor/cli`     | `dist/ios/update.js`, `dist/tasks/update.js`                                                                    |
| Native bridge assets | `capacitor/src/main/assets/native-bridge.js` on Android or `Capacitor/Capacitor/assets/native-bridge.js` on iOS |

For native project patches, use `"phase": "native"` and make paths relative to the app root, such as `android/app/build.gradle` or `ios/App/App/Info.plist`.

Capacitor packages usually ship compiled JavaScript, not TypeScript source. If the upstream fix touches CLI or core TypeScript files, patch the shipped `dist/` JavaScript files that users actually have in `node_modules`.

### Catalog entry rules

Every patch needs an entry in `patches/catalog.json`.

Use stable IDs:

```text
upstream-pr-<number>-android
upstream-pr-<number>-ios
upstream-pr-<number>-core
upstream-pr-<number>-cli
```

Use separate entries when one upstream PR patches multiple packages. For example, a fix that changes both Android and iOS should create `upstream-pr-6991-android` and `upstream-pr-6991-ios`.

Recommended shape:

```json
{
  "id": "upstream-pr-8418-android",
  "title": "fix(android): range request truncation (android)",
  "recommended": false,
  "phase": "package",
  "target": {
    "type": "package",
    "packageName": "@capacitor/android",
    "versionRange": ">=8.3.2 <9.0.0"
  },
  "source": {
    "upstreamPullRequest": "https://github.com/ionic-team/capacitor/pull/8418",
    "capacitorPlusBranch": "https://github.com/Cap-go/capacitor-plus/tree/sync/upstream-pr-8418",
    "author": "upstream-author",
    "authorAssociation": "external"
  },
  "upstream": {
    "state": "open",
    "mergedAt": null,
    "status": "not-merged-as-of-2026-05-12"
  },
  "patchFile": "patches/upstream-pr-8418-android.patch"
}
```

Set `recommended: false` by default. Only set `recommended: true` when Capgo is comfortable applying the fix automatically after a user opts into recommended patches.

Use `supersedes` when a newer patch includes or replaces an older overlapping patch:

```json
{
  "id": "upstream-pr-8429-android",
  "supersedes": ["upstream-pr-7781-android"]
}
```

### Version ranges

Start with the narrowest range you have verified. Do not use `>=8.0.0 <9.0.0` unless the patch applies cleanly across the supported Capacitor 8 releases.

If a patch is already released upstream in later Capacitor versions, cap the upper bound:

```json
"versionRange": ">=8.0.0 <8.3.1"
```

Incompatible selected patches are skipped by default and fail when users set `strict: true`, so accurate version ranges are part of the user experience.

### Local validation

Before opening a patch PR, run:

```bash
npm run lint
npm run verify
npm pack --dry-run
```

Then test the patch against a throwaway app with the target Capacitor version:

```bash
npm init -y
npm install @capgo/capacitor-patch @capacitor/android@8.3.3 @capacitor/ios@8.3.3 @capacitor/core@8.3.3 @capacitor/cli@8.3.3
CAPACITOR_CONFIG='{"plugins":{"CapacitorPatch":{"patches":["upstream-pr-8418-android"],"strict":true}}}' npx capgo-capacitor-patch doctor --root . --phase package
```

For an unpublished local branch, run the local binary from this repository and pass a config that selects the patch ID:

```bash
CAPACITOR_CONFIG='{"plugins":{"CapacitorPatch":{"patches":["upstream-pr-8418-android"],"strict":true}}}' node /path/to/capacitor-patch/bin/capgo-capacitor-patch doctor --root . --phase package
```

The patch is ready when:

- `doctor` says the patch would apply for supported versions.
- Running `apply` twice reports `already-applied` on the second run.
- Incompatible versions skip cleanly or fail only in `strict: true`.
- `npm pack --dry-run` includes the catalog entry and patch file.

## Compatibility

| Plugin version | Capacitor compatibility | Maintained |
| -------------- | ----------------------- | ---------- |
| v8.\*.\*       | v8.\*.\*                | Yes        |
| v7.\*.\*       | v7.\*.\*                | On demand  |
| v6.\*.\*       | v6.\*.\*                | On demand  |

## Development

```bash
npm install
npm run build
npm run test
npm run lint
```

Use `npm run verify` before opening a pull request.
