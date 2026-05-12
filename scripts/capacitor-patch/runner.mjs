import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

import { loadBuiltinCatalog } from './catalog.mjs';
import { getPluginConfig } from './config.mjs';
import { PatchApplyError, applyUnifiedDiff } from './diff.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function runCapacitorPatch(options) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const phase = options.phase;
  const catalog = options.catalog ?? loadBuiltinCatalog();
  const extConfig = options.extConfig ?? {};
  const patchConfig = options.patchConfig ?? getPluginConfig(extConfig);
  const patchBaseDir = path.resolve(options.patchBaseDir ?? packageRoot);
  const selected = selectPatches(catalog, patchConfig, phase);
  const results = [];

  for (const unknownId of selected.unknownIds) {
    results.push({
      id: unknownId,
      phase,
      status: 'failed',
      reason: 'Patch ID was not found in the catalog.',
    });
  }

  for (const entry of selected.superseded) {
    results.push({
      id: entry.patch.id,
      title: entry.patch.title,
      phase,
      selectedBy: entry.selectedBy,
      status: 'skipped',
      changedFiles: [],
      reason: `Superseded by ${entry.supersededBy}.`,
    });
  }

  for (const entry of selected.patches) {
    results.push(
      await applyCatalogPatch({
        rootDir,
        patchBaseDir,
        patch: entry.patch,
        selectedBy: entry.selectedBy,
        phase,
        platformName: options.platformName,
        strict: patchConfig.strict,
        dryRun: options.dryRun === true,
      }),
    );
  }

  const failures = results.filter((result) => result.status === 'failed');
  if (patchConfig.strict && failures.length > 0) {
    throw new Error(failures.map((failure) => `${failure.id}: ${failure.reason}`).join('\n'));
  }

  return {
    phase,
    selectedCount: selected.patches.length + selected.unknownIds.length + selected.superseded.length,
    results,
  };
}

export function selectPatches(catalog, patchConfig, phase) {
  const disabled = new Set(patchConfig.disabled);
  const explicit = new Set(patchConfig.patches);
  const catalogById = new Map(catalog.map((patch) => [patch.id, patch]));
  const selectedEntries = [];

  for (const patch of catalog) {
    if (!patch?.id || patch.phase !== phase || disabled.has(patch.id)) {
      continue;
    }

    if (explicit.has(patch.id)) {
      selectedEntries.push({ patch, selectedBy: 'explicit' });
    } else if (patchConfig.recommended && patch.recommended === true) {
      selectedEntries.push({ patch, selectedBy: 'recommended' });
    }
  }

  const selectedIds = new Set(selectedEntries.map((entry) => entry.patch.id));
  const supersededBy = new Map();
  for (const entry of selectedEntries) {
    for (const supersededId of entry.patch.supersedes ?? []) {
      if (selectedIds.has(supersededId) && !disabled.has(supersededId)) {
        supersededBy.set(supersededId, entry.patch.id);
      }
    }
  }

  const patches = [];
  const superseded = [];
  for (const entry of selectedEntries) {
    const replacementId = supersededBy.get(entry.patch.id);
    if (replacementId) {
      superseded.push({ ...entry, supersededBy: replacementId });
    } else {
      patches.push(entry);
    }
  }

  return {
    patches,
    superseded,
    unknownIds: patchConfig.patches.filter((id) => !disabled.has(id) && !catalogById.has(id)),
  };
}

async function applyCatalogPatch(options) {
  const { patch, rootDir, patchBaseDir, selectedBy, platformName, strict, dryRun } = options;
  const baseResult = {
    id: patch.id,
    title: patch.title,
    phase: patch.phase,
    selectedBy,
    status: 'skipped',
    changedFiles: [],
  };

  if (Array.isArray(patch.platforms) && platformName && !patch.platforms.includes(platformName)) {
    return {
      ...baseResult,
      reason: `Patch is for ${patch.platforms.join(', ')}, current platform is ${platformName}.`,
    };
  }

  const target = patch.target ?? {};
  const targetType = target.type ?? (target.packageName ? 'package' : 'native');
  const targetRoot = resolveTargetRoot(rootDir, targetType, target);
  if (!targetRoot) {
    return {
      ...baseResult,
      reason: `Target package ${target.packageName} is not installed.`,
    };
  }

  const versionCheck = checkTargetVersion(targetRoot, target);
  if (!versionCheck.ok) {
    return {
      ...baseResult,
      status: strict ? 'failed' : 'skipped',
      reason: versionCheck.reason,
    };
  }

  const patchFile = path.resolve(patchBaseDir, patch.patchFile);
  if (!fs.existsSync(patchFile)) {
    return {
      ...baseResult,
      status: 'failed',
      reason: `Patch file is missing: ${patch.patchFile}`,
    };
  }

  const diffText = fs.readFileSync(patchFile, 'utf8');

  try {
    const applied = applyUnifiedDiff(targetRoot, diffText, { dryRun });
    const status = dryRun ? 'would-apply' : 'applied';

    return {
      ...baseResult,
      status,
      changedFiles: applied.changedFiles,
      note:
        patch.target?.packageName === '@capacitor/cli' && !dryRun
          ? 'This patch changes @capacitor/cli. Run the next cap command to use the patched CLI code.'
          : undefined,
    };
  } catch (error) {
    if (error instanceof PatchApplyError && isAlreadyApplied(targetRoot, diffText)) {
      return {
        ...baseResult,
        status: 'already-applied',
      };
    }

    return {
      ...baseResult,
      status: strict ? 'failed' : 'failed',
      reason: error?.message ?? String(error),
    };
  }
}

function resolveTargetRoot(rootDir, targetType, target) {
  if (targetType === 'native') {
    return rootDir;
  }

  const packageName = target.packageName;
  if (!packageName) {
    return null;
  }

  const packageRootDir = path.join(rootDir, 'node_modules', ...packageName.split('/'));
  const packageJson = path.join(packageRootDir, 'package.json');
  return fs.existsSync(packageJson) ? packageRootDir : null;
}

function checkTargetVersion(targetRoot, target) {
  if (!target.versionRange) {
    return { ok: true };
  }

  const packageJsonPath = path.join(targetRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { ok: false, reason: 'Target package has no package.json for version checking.' };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  if (!semver.valid(version) || !semver.satisfies(version, target.versionRange, { includePrerelease: true })) {
    return {
      ok: false,
      reason: `Installed version ${version ?? 'unknown'} does not satisfy ${target.versionRange}.`,
    };
  }

  return { ok: true };
}

function isAlreadyApplied(targetRoot, diffText) {
  try {
    applyUnifiedDiff(targetRoot, diffText, { reverse: true, dryRun: true });
    return true;
  } catch {
    return false;
  }
}

export function printPatchResults(result, options = {}) {
  if (options.quietWhenEmpty && result.selectedCount === 0) {
    return;
  }

  if (result.selectedCount === 0) {
    console.log('[CapacitorPatch] No patches selected. Enable plugins.CapacitorPatch.recommended or list patch IDs.');
    return;
  }

  for (const item of result.results) {
    const label = item.title ? `${item.id} (${item.title})` : item.id;
    if (item.status === 'applied' || item.status === 'would-apply') {
      const action = item.status === 'would-apply' ? 'Would apply' : 'Applied';
      console.log(`[CapacitorPatch] ${action} ${label}.`);
      for (const file of item.changedFiles ?? []) {
        console.log(`[CapacitorPatch]   ${file}`);
      }
      if (item.note) {
        console.log(`[CapacitorPatch] ${item.note}`);
      }
    } else if (item.status === 'already-applied') {
      console.log(`[CapacitorPatch] Already applied ${label}.`);
    } else if (item.status === 'skipped') {
      console.log(`[CapacitorPatch] Skipped ${label}: ${item.reason}`);
    } else {
      console.warn(`[CapacitorPatch] Failed ${label}: ${item.reason}`);
    }
  }
}
