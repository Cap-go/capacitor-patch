import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import { getPluginConfig } from './capacitor-patch/config.mjs';
import { applyUnifiedDiff } from './capacitor-patch/diff.mjs';
import { runCapacitorPatch, selectPatches } from './capacitor-patch/runner.mjs';

test('default config selects no patches', () => {
  const catalog = [makePatch({ id: 'recommended', recommended: true })];
  const selected = selectPatches(catalog, getPluginConfig({}), 'package');

  assert.equal(selected.patches.length, 0);
});

test('recommended patches apply and become idempotent', async () => {
  const fixture = createPackageFixture();
  const result = await runCapacitorPatch({
    rootDir: fixture.rootDir,
    patchBaseDir: fixture.patchBaseDir,
    catalog: fixture.catalog,
    phase: 'package',
    extConfig: { plugins: { CapacitorPatch: { recommended: true } } },
  });

  assert.equal(result.results[0].status, 'applied');
  assert.equal(fs.readFileSync(fixture.targetFile, 'utf8'), 'one\nnew\n');

  const second = await runCapacitorPatch({
    rootDir: fixture.rootDir,
    patchBaseDir: fixture.patchBaseDir,
    catalog: fixture.catalog,
    phase: 'package',
    extConfig: { plugins: { CapacitorPatch: { recommended: true } } },
  });

  assert.equal(second.results[0].status, 'already-applied');
});

test('strict mode throws when a selected patch does not match', async () => {
  const fixture = createPackageFixture({ content: 'one\nunexpected\n' });

  await assert.rejects(
    () =>
      runCapacitorPatch({
        rootDir: fixture.rootDir,
        patchBaseDir: fixture.patchBaseDir,
        catalog: fixture.catalog,
        phase: 'package',
        extConfig: { plugins: { CapacitorPatch: { patches: ['package-fix'], strict: true } } },
      }),
    /package-fix/,
  );
});

test('non-strict mode reports patch mismatch without throwing', async () => {
  const fixture = createPackageFixture({ content: 'one\nunexpected\n' });
  const result = await runCapacitorPatch({
    rootDir: fixture.rootDir,
    patchBaseDir: fixture.patchBaseDir,
    catalog: fixture.catalog,
    phase: 'package',
    extConfig: { plugins: { CapacitorPatch: { patches: ['package-fix'] } } },
  });

  assert.equal(result.results[0].status, 'failed');
});

test('version gating skips incompatible recommended patches', async () => {
  const fixture = createPackageFixture({ version: '9.0.0' });
  const result = await runCapacitorPatch({
    rootDir: fixture.rootDir,
    patchBaseDir: fixture.patchBaseDir,
    catalog: fixture.catalog,
    phase: 'package',
    extConfig: { plugins: { CapacitorPatch: { recommended: true } } },
  });

  assert.equal(result.results[0].status, 'skipped');
  assert.match(result.results[0].reason, /does not satisfy/);
});

test('selected patches can supersede older overlapping patches', async () => {
  const fixture = createPackageFixture();
  fs.writeFileSync(path.join(fixture.patchBaseDir, 'newer.patch'), makeDiff('file.txt', 'old', 'newer'));

  const catalog = [
    makePatch({ id: 'older', patchFile: 'package.patch' }),
    makePatch({ id: 'newer', patchFile: 'newer.patch', supersedes: ['older'] }),
  ];

  const result = await runCapacitorPatch({
    rootDir: fixture.rootDir,
    patchBaseDir: fixture.patchBaseDir,
    catalog,
    phase: 'package',
    extConfig: { plugins: { CapacitorPatch: { patches: ['older', 'newer'] } } },
  });

  assert.equal(result.results[0].status, 'skipped');
  assert.match(result.results[0].reason, /Superseded by newer/);
  assert.equal(result.results[1].status, 'applied');
  assert.equal(fs.readFileSync(fixture.targetFile, 'utf8'), 'one\nnewer\n');
});

test('patch hunks can apply when the expected block moved uniquely', async () => {
  const fixture = createPackageFixture({ content: 'zero\none\nold\n' });
  const result = await runCapacitorPatch({
    rootDir: fixture.rootDir,
    patchBaseDir: fixture.patchBaseDir,
    catalog: fixture.catalog,
    phase: 'package',
    extConfig: { plugins: { CapacitorPatch: { recommended: true } } },
  });

  assert.equal(result.results[0].status, 'applied');
  assert.equal(fs.readFileSync(fixture.targetFile, 'utf8'), 'zero\none\nnew\n');
});

test('unified diff parser accepts standard multi-file git patches', () => {
  const rootDir = createTempDir();
  fs.writeFileSync(path.join(rootDir, 'one.txt'), 'one\nold\n');
  fs.writeFileSync(path.join(rootDir, 'two.txt'), 'two\nold\n');

  const result = applyUnifiedDiff(
    rootDir,
    `${makeDiff('one.txt', 'old', 'new')}diff --git a/two.txt b/two.txt
--- a/two.txt
+++ b/two.txt
@@ -1,2 +1,2 @@
 two
-old
+new
`,
  );

  assert.deepEqual(result.changedFiles, ['one.txt', 'two.txt']);
  assert.equal(fs.readFileSync(path.join(rootDir, 'one.txt'), 'utf8'), 'one\nnew\n');
  assert.equal(fs.readFileSync(path.join(rootDir, 'two.txt'), 'utf8'), 'two\nnew\n');
});

test('native patches respect platform filters', async () => {
  const rootDir = createTempDir();
  const patchBaseDir = path.join(rootDir, 'catalog');
  const targetFile = path.join(rootDir, 'android/app/src.txt');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.mkdirSync(patchBaseDir, { recursive: true });
  fs.writeFileSync(targetFile, 'native\nold\n');
  fs.writeFileSync(path.join(patchBaseDir, 'native.patch'), makeDiff('android/app/src.txt', 'old', 'new', 'native'));

  const catalog = [
    {
      id: 'native-fix',
      title: 'Native fixture',
      recommended: true,
      phase: 'native',
      platforms: ['android'],
      target: { type: 'native' },
      patchFile: 'native.patch',
    },
  ];

  const skipped = await runCapacitorPatch({
    rootDir,
    patchBaseDir,
    catalog,
    phase: 'native',
    platformName: 'ios',
    extConfig: { plugins: { CapacitorPatch: { recommended: true } } },
  });
  assert.equal(skipped.results[0].status, 'skipped');

  const applied = await runCapacitorPatch({
    rootDir,
    patchBaseDir,
    catalog,
    phase: 'native',
    platformName: 'android',
    extConfig: { plugins: { CapacitorPatch: { recommended: true } } },
  });
  assert.equal(applied.results[0].status, 'applied');
  assert.equal(fs.readFileSync(targetFile, 'utf8'), 'native\nnew\n');
});

test('Capacitor CLI discovers hook-only plugins with capacitor object', async () => {
  const require = createRequire(import.meta.url);
  const { runHooks } = require('@capacitor/cli/dist/common');
  const rootDir = createTempDir();
  const pluginRoot = path.join(rootDir, 'node_modules/@capgo/capacitor-patch');

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ dependencies: { '@capgo/capacitor-patch': '8.0.0' } }, null, 2),
  );
  fs.writeFileSync(
    path.join(pluginRoot, 'package.json'),
    JSON.stringify(
      {
        name: '@capgo/capacitor-patch',
        version: '8.0.0',
        capacitor: {},
        scripts: {
          'capacitor:sync:before': 'node hook.mjs',
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(pluginRoot, 'hook.mjs'),
    `import fs from 'node:fs';
fs.writeFileSync(process.env.CAPACITOR_ROOT_DIR + '/hook-ran.txt', process.env.CAPACITOR_PLATFORM_NAME);
`,
  );

  await runHooks(
    {
      app: {
        rootDir,
        webDirAbs: path.join(rootDir, 'www'),
        extConfig: {},
        package: { dependencies: { '@capgo/capacitor-patch': '8.0.0' } },
      },
    },
    'android',
    rootDir,
    'capacitor:sync:before',
  );

  assert.equal(fs.readFileSync(path.join(rootDir, 'hook-ran.txt'), 'utf8'), 'android');
});

function createPackageFixture(options = {}) {
  const rootDir = createTempDir();
  const patchBaseDir = path.join(rootDir, 'catalog');
  const packageRoot = path.join(rootDir, 'node_modules/@capacitor/android');
  const targetFile = path.join(packageRoot, 'file.txt');

  fs.mkdirSync(packageRoot, { recursive: true });
  fs.mkdirSync(patchBaseDir, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: options.version ?? '8.0.0' }));
  fs.writeFileSync(targetFile, options.content ?? 'one\nold\n');
  fs.writeFileSync(path.join(patchBaseDir, 'package.patch'), makeDiff('file.txt', 'old', 'new'));

  return {
    rootDir,
    patchBaseDir,
    targetFile,
    catalog: [makePatch()],
  };
}

function makePatch(overrides = {}) {
  return {
    id: 'package-fix',
    title: 'Package fixture',
    recommended: true,
    phase: 'package',
    target: {
      packageName: '@capacitor/android',
      versionRange: '>=8.0.0 <9.0.0',
    },
    patchFile: 'package.patch',
    ...overrides,
  };
}

function makeDiff(file, oldValue, newValue, firstLine = 'one') {
  return `diff --git a/${file} b/${file}
--- a/${file}
+++ b/${file}
@@ -1,2 +1,2 @@
 ${firstLine}
-${oldValue}
+${newValue}
`;
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'capgo-capacitor-patch-'));
}
