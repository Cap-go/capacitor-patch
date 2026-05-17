import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuickPatchComment,
  createCatalogEntry,
  createUpstreamStatus,
  groupPatchTargets,
  isExternalAuthor,
  parseSyncBranchNumber,
  sortCatalogEntries,
} from './capacitor-patch/upstream-sync.mjs';

test('sync branch parser extracts upstream PR numbers', () => {
  assert.equal(parseSyncBranchNumber('origin/sync/upstream-pr-8418'), 8418);
  assert.equal(parseSyncBranchNumber('capgo/sync/upstream-pr-6991'), 6991);
  assert.equal(parseSyncBranchNumber('origin/main'), null);
});

test('external author detection treats Capacitor team roles as internal', () => {
  assert.equal(isExternalAuthor('CONTRIBUTOR'), true);
  assert.equal(isExternalAuthor('NONE'), true);
  assert.equal(isExternalAuthor('FIRST_TIMER'), true);
  assert.equal(isExternalAuthor('MEMBER'), false);
  assert.equal(isExternalAuthor('OWNER'), false);
  assert.equal(isExternalAuthor('COLLABORATOR'), false);
});

test('target grouping keeps shipped package files and excludes tests', () => {
  const grouped = groupPatchTargets([
    'android/capacitor/src/main/java/com/getcapacitor/Bridge.java',
    'android/capacitor/src/test/java/com/getcapacitor/BridgeTest.java',
    'ios/Capacitor/Capacitor/CAPBridgeViewController.swift',
    'core/src/web-plugin.ts',
    'core/src/tests/web-plugin.spec.ts',
    'core/native-bridge.ts',
    'cli/src/ios/build.ts',
    'cli/src/tasks/build.spec.ts',
    'README.md',
  ]);

  assert.deepEqual(
    grouped.directTargets.map((target) => target.key),
    ['android', 'ios'],
  );
  assert.deepEqual(
    grouped.compiledTargets.map((target) => target.key),
    ['core', 'cli', 'android-native-bridge', 'ios-native-bridge'],
  );
});

test('catalog entries use stable IDs and external source metadata', () => {
  const entry = createCatalogEntry({
    pr: {
      number: 8418,
      title: 'fix(android): range request truncation',
      author: 'bwees',
      authorAssociation: 'CONTRIBUTOR',
      state: 'open',
      mergedAt: null,
    },
    target: {
      packageName: '@capacitor/android',
      suffix: 'android',
      titleSuffix: 'android',
      versionRange: '>=8.0.0 <9.0.0',
    },
    patchFile: 'patches/upstream-pr-8418-android.patch',
    upstreamStatus: createUpstreamStatus({ state: 'open', mergedAt: null }),
    branchUrl: 'https://github.com/Cap-go/capacitor-plus/tree/sync/upstream-pr-8418',
  });

  assert.equal(entry.id, 'upstream-pr-8418-android');
  assert.equal(entry.source.authorAssociation, 'external');
  assert.equal(entry.upstream.status, 'not-merged');
  assert.equal(entry.target.packageName, '@capacitor/android');
});

test('catalog sorting is stable by upstream PR and patch ID', () => {
  const sorted = sortCatalogEntries([
    { id: 'upstream-pr-9000-ios' },
    { id: 'upstream-pr-8418-android' },
    { id: 'upstream-pr-6991-ios' },
    { id: 'upstream-pr-6991-android' },
  ]);

  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ['upstream-pr-6991-android', 'upstream-pr-6991-ios', 'upstream-pr-8418-android', 'upstream-pr-9000-ios'],
  );
});

test('quick patch comment supports one or many patch IDs', () => {
  const single = buildQuickPatchComment([{ id: 'upstream-pr-8418-android' }]);
  assert.match(single, /Patch ID: `upstream-pr-8418-android`/);
  assert.match(single, /patches: \['upstream-pr-8418-android'\]/);

  const multiple = buildQuickPatchComment([{ id: 'upstream-pr-6991-ios' }, { id: 'upstream-pr-6991-android' }]);
  assert.match(multiple, /Patch IDs: `upstream-pr-6991-android`, `upstream-pr-6991-ios`/);
  assert.match(multiple, /patches: \[/);
});
