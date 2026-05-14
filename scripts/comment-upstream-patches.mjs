#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { commentOnUpstreamPullRequests } from './capacitor-patch/upstream-sync.mjs';

const options = parseArgs(process.argv.slice(2));

if (!options.baseRef || !options.headRef) {
  console.error('Missing --base <ref> and --head <ref>.');
  process.exit(2);
}

try {
  const token = getGitHubToken();
  if (!token && !options.dryRun) {
    console.log('[patch-comment] no token configured; skipping upstream comments.');
    process.exit(0);
  }

  const result = await commentOnUpstreamPullRequests({
    baseRef: options.baseRef,
    headRef: options.headRef,
    githubToken: token,
    dryRun: options.dryRun,
  });

  for (const posted of result.posted) {
    console.log(`[patch-comment] ${options.dryRun ? 'would comment on' : 'commented on'} upstream PR #${posted.pr}`);
  }
  if (!result.posted.length) {
    console.log('[patch-comment] no new upstream patch entries found.');
  }
} catch (error) {
  console.error(`[patch-comment] ${error?.stack || error?.message || error}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    baseRef: '',
    headRef: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') {
      options.baseRef = argv[++index];
    } else if (arg === '--head') {
      options.headRef = argv[++index];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function getGitHubToken() {
  const envToken = process.env.PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) {
    return envToken;
  }

  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return result.status === 0 ? result.stdout.trim() : '';
}
