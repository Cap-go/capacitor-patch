# Contributing

This guide provides instructions for contributing to `@capgo/capacitor-patch`.

## Developing

### Local Setup

1. Fork and clone the repo.
2. Install dependencies.

```shell
bun install
```

### Scripts

#### `bun run build`

Builds the TypeScript package and Rollup bundles.

#### `bun run verify`

Builds the package and runs the patch runner tests.

#### `bun run lint` / `bun run fmt`

Checks or auto-fixes formatting and linting.

## Publishing

The `prepublishOnly` hook prepares the plugin before publishing.

```shell
bun publish
```

> The `files` array in `package.json` controls what is published. Update it if you move files.

## PR Beta Packages

Each PR gets a bot comment that explains how to publish a temporary npm build for testing.

Maintainers can comment `/publish-beta` on a PR once checks are green. CI will publish the PR head to:

- the shared `beta` dist-tag
- a pinned `pr-<number>` dist-tag for that exact PR build
