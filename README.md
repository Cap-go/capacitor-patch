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

## Compatibility

| Plugin version | Capacitor compatibility | Maintained |
| -------------- | ----------------------- | ---------- |
| v8.\*.\*       | v8.\*.\*                | Yes        |
| v7.\*.\*       | v7.\*.\*                | On demand  |
| v6.\*.\*       | v6.\*.\*                | On demand  |

## Development

```bash
bun install
bun run build
bun run test
bun run lint
```

Use `bun run verify` before opening a pull request.
