#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { syncUpstreamPatches } from './capacitor-patch/upstream-sync.mjs';

const options = parseArgs(process.argv.slice(2));

if (!options.capacitorPlusDir) {
  console.error('Missing --capacitor-plus-dir <dir>.');
  process.exit(2);
}

try {
  const result = await syncUpstreamPatches({
    rootDir: process.cwd(),
    capacitorPlusDir: options.capacitorPlusDir,
    remote: options.remote,
    baseRef: options.baseRef,
    githubToken: getGitHubToken(),
    requireChecks: options.requireChecks,
    externalOnly: options.externalOnly,
    refreshExisting: options.refreshExisting,
    dryRun: options.dryRun,
    maxBuildPrs: options.maxBuildPrs,
    prNumbers: options.prNumbers,
  });

  for (const entry of result.generatedEntries) {
    console.log(`[patch-sync] generated ${entry.id} -> ${entry.patchFile}`);
  }
  for (const skipped of result.skipped) {
    console.log(`[patch-sync] skipped PR #${skipped.pr}: ${skipped.reason}`);
  }
  if (!result.generatedEntries.length) {
    console.log('[patch-sync] no new patches generated.');
  }
} catch (error) {
  console.error(`[patch-sync] ${error?.stack || error?.message || error}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    remote: 'origin',
    baseRef: '',
    requireChecks: false,
    externalOnly: true,
    refreshExisting: false,
    dryRun: false,
    maxBuildPrs: 3,
    prNumbers: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--capacitor-plus-dir') {
      options.capacitorPlusDir = argv[++index];
    } else if (arg === '--remote') {
      options.remote = argv[++index];
    } else if (arg === '--base-ref') {
      options.baseRef = argv[++index];
    } else if (arg === '--require-checks') {
      options.requireChecks = true;
    } else if (arg === '--no-require-checks') {
      options.requireChecks = false;
    } else if (arg === '--include-internal') {
      options.externalOnly = false;
    } else if (arg === '--refresh-existing') {
      options.refreshExisting = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--max-build-prs') {
      options.maxBuildPrs = Number(argv[++index]);
    } else if (arg === '--pr') {
      options.prNumbers.push(Number(argv[++index]));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.baseRef) {
    options.baseRef = `${options.remote}/plus`;
  }

  return options;
}

function getGitHubToken() {
  const envToken = process.env.GITHUB_TOKEN || process.env.PERSONAL_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return result.status === 0 ? result.stdout.trim() : '';
}
