# AGENTS.md

This file provides guidance to AI agents and contributors working on this hook-only Capacitor patch package.

## Public Release Requirements (Mandatory)

When shipping this plugin, the agent must perform all of the following:

1. Publish the repository under `Cap-go` and make it public.
2. Set the GitHub repository description and ensure it starts with:
   - `Capacitor plugin for ...`
3. Set the GitHub repository homepage to:
   - `https://capgo.app/docs/plugins/<plugin-slug>/`
4. Open a pull request on `https://github.com/Cap-go/website` (or monorepo folder `landing/`) and update:
   - `src/config/plugins.ts` (plugin registry entry)
   - `src/content/docs/docs/plugins/index.mdx` (plugin card in docs index)
   - `src/content/docs/docs/plugins/<plugin-doc-slug>/index.mdx`
   - `src/content/docs/docs/plugins/<plugin-doc-slug>/getting-started.mdx`
   - `src/content/docs/docs/plugins/<plugin-doc-slug>/ios.mdx` and `android.mdx` when platform setup differs
   - `astro.config.mjs` (pagefind bucket + docs sidebar entry)
   - `src/content/plugins-tutorials/en/<plugin-repo-slug>.md` (SEO tutorial page)
   - `public/icons/plugins/<plugin-doc-slug>.svg` when the docs hero references a plugin icon
5. Keep the README Capgo CTA header block and replace:
   - `{{PLUGIN_REF_SLUG}}` with the tracking slug (example: `native_audio`)
6. Keep the README banner on the dynamic endpoint:
   - `https://capgo.app/readme-banner.svg?repo=<GitHubOrg>/capacitor-<plugin-slug>`
   - Re-check the `repo=` value after changing the Git remote or GitHub org.

Website slug rule:

- Docs routes use `<plugin-doc-slug>` under `/docs/plugins/<plugin-doc-slug>/`.
- Tutorial routing uses `<plugin-repo-slug>` extracted from the plugin GitHub URL in `src/config/plugins.ts`.
- Example: repo URL `https://github.com/Cap-go/capacitor-app-attest/` maps to tutorial file
  `src/content/plugins-tutorials/en/capacitor-app-attest.md`.

Reference commands:

```bash
# Create public repo directly
gh repo create Cap-go/capacitor-<plugin-slug> --public --source=. --remote=origin --push

# Or switch existing private repo to public
gh repo edit Cap-go/capacitor-<plugin-slug> --visibility public --accept-visibility-change-consequences

# Enforce description + homepage
gh repo edit Cap-go/capacitor-<plugin-slug> \
  --description "Capacitor plugin for <what-it-does>." \
  --homepage "https://capgo.app/docs/plugins/<plugin-slug>/"
```

## Quick Start

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Full verification
bun run verify

# Format code
bun run fmt

# Lint without fixing
bun run lint
```

## Development Workflow

1. **Install** - `bun install` (never use npm)
2. **Build** - `bun run build` compiles TypeScript and bundles with Rollup
3. **Verify** - `bun run verify` builds and runs patch tests. Always run this before submitting work
4. **Format** - `bun run fmt` auto-fixes ESLint and Prettier issues
5. **Lint** - `bun run lint` checks code quality without modifying files

## Capacitor Hook Scripts

Use Capacitor lifecycle hooks in `package.json` when plugin setup must run automatically during `cap sync` / `cap update`.

Recommended hooks:

- `capacitor:sync:before` for code generation that must exist before native project sync.
- `capacitor:update:before` for code generation that must exist before native project update.
- `capacitor:sync:after` for post-sync native patching/configuration.
- `capacitor:update:after` for post-update native patching/configuration.

Example:

```json
{
  "scripts": {
    "generate:version-share": "bun run scripts/generate-version-share-data.mjs",
    "configure:dependencies": "bun run scripts/configure-dependencies.mjs",
    "capacitor:sync:before": "bun run generate:version-share",
    "capacitor:update:before": "bun run generate:version-share",
    "capacitor:sync:after": "bun run configure:dependencies"
  }
}
```

Notes:

- Prefer `*:before` for deterministic inputs needed by native build/sync.
- Use `*:after` only when the task depends on generated native files.
- Keep hook scripts idempotent so repeated `cap sync` runs are safe.

## Project Structure

- `src/definitions.ts` - TypeScript config interfaces
- `scripts/capacitor-patch/` - patch selection, config loading, and unified-diff runner
- `scripts/capacitor-patch-hook.mjs` - Capacitor hook entrypoint
- `bin/capgo-capacitor-patch` - manual CLI entrypoint
- `patches/catalog.json` - shipped patch catalog
- `dist/` - Generated output (do not edit manually)

## Versioning

- New plugins must start at version `8.0.0` (Capacitor 8 baseline).
- The plugin major version must always follow the Capacitor major version.
- By default, ship and maintain Capacitor 8 support first.
- Do not introduce breaking changes in `src/definitions.ts` unless explicitly asked or the current definition is broken or unusable.
- Document any important default or future-major default candidate in `src/definitions.ts` so the next Capacitor major upgrade can change it deliberately.
- Backward compatibility for older Capacitor majors is supported on demand.
- Ship breaking changes only with a Capacitor major migration.

## Changelog

`CHANGELOG.md` is managed automatically by CI/CD. Do not edit it manually.

## Common Pitfalls

- This package is hook-only. Do not add native iOS or Android runtime code unless the CLI discovery model changes.
- Keep patch files idempotent and version-gated.
- Default runtime behavior must stay no-op unless the app enables `plugins.CapacitorPatch.recommended` or lists patch IDs.
- `dist/` is regenerated on every build and should never be edited directly.
- Use Bun for everything. If a command needs a package binary, use `bunx`.
