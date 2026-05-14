import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INTERNAL_AUTHOR_ASSOCIATIONS = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);
const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const FAILED_CHECK_CONCLUSIONS = new Set(['action_required', 'cancelled', 'failure', 'startup_failure', 'timed_out']);

export const PACKAGE_TARGETS = [
  {
    key: 'android',
    packageName: '@capacitor/android',
    root: 'android',
    suffix: 'android',
    titleSuffix: 'android',
    versionRange: '>=8.0.0 <9.0.0',
    direct: true,
    accepts: (file) => file.startsWith('android/') && isShippedPackageFile(file, 'android'),
  },
  {
    key: 'ios',
    packageName: '@capacitor/ios',
    root: 'ios',
    suffix: 'ios',
    titleSuffix: 'ios',
    versionRange: '>=8.0.0 <9.0.0',
    direct: true,
    accepts: (file) => file.startsWith('ios/') && isShippedPackageFile(file, 'ios'),
  },
];

export const COMPILED_TARGETS = [
  {
    key: 'core',
    packageName: '@capacitor/core',
    root: 'core',
    suffix: 'core',
    titleSuffix: 'core',
    versionRange: '>=8.0.0 <9.0.0',
    build: 'core',
    generatedFiles: ['dist/index.js', 'dist/index.cjs.js'],
    triggers: (file) => file.startsWith('core/src/') && isSourceRuntimeFile(file),
  },
  {
    key: 'cli',
    packageName: '@capacitor/cli',
    root: 'cli',
    suffix: 'cli',
    titleSuffix: 'cli',
    versionRange: '>=8.0.0 <9.0.0',
    build: 'cli',
    generatedFiles: ['dist'],
    triggers: (file) => file.startsWith('cli/src/') && isSourceRuntimeFile(file),
  },
  {
    key: 'android-native-bridge',
    packageName: '@capacitor/android',
    root: 'android',
    suffix: 'android-native-bridge',
    titleSuffix: 'android-native-bridge',
    versionRange: '>=8.0.0 <9.0.0',
    build: 'nativebridge',
    generatedFiles: ['capacitor/src/main/assets/native-bridge.js'],
    triggers: (file) => file === 'core/native-bridge.ts',
  },
  {
    key: 'ios-native-bridge',
    packageName: '@capacitor/ios',
    root: 'ios',
    suffix: 'ios-native-bridge',
    titleSuffix: 'ios-native-bridge',
    versionRange: '>=8.0.0 <9.0.0',
    build: 'nativebridge',
    generatedFiles: ['Capacitor/Capacitor/assets/native-bridge.js'],
    triggers: (file) => file === 'core/native-bridge.ts',
  },
];

export function parseSyncBranchNumber(branchName) {
  const match = /(?:^|\/)sync\/upstream-pr-(\d+)$/.exec(branchName);
  return match ? Number(match[1]) : null;
}

export function sortCatalogEntries(entries) {
  return [...entries].sort((a, b) => {
    const prA = getEntryPullRequestNumber(a);
    const prB = getEntryPullRequestNumber(b);
    if (prA !== prB) {
      return prA - prB;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

export function getEntryPullRequestNumber(entry) {
  const fromSource = /\/pull\/(\d+)/.exec(entry?.source?.upstreamPullRequest ?? '')?.[1];
  const fromId = /^upstream-pr-(\d+)/.exec(entry?.id ?? '')?.[1];
  return Number(fromSource ?? fromId ?? Number.MAX_SAFE_INTEGER);
}

export function groupPatchTargets(changedFiles) {
  const directTargets = PACKAGE_TARGETS.filter((target) => changedFiles.some((file) => target.accepts(file)));
  const compiledTargets = COMPILED_TARGETS.filter((target) => changedFiles.some((file) => target.triggers(file)));
  return {
    directTargets,
    compiledTargets,
    allTargets: [...directTargets, ...compiledTargets],
  };
}

export function createCatalogEntry({ pr, target, patchFile, upstreamStatus, branchUrl }) {
  return {
    id: `upstream-pr-${pr.number}-${target.suffix}`,
    title: `${pr.title} (${target.titleSuffix})`,
    recommended: false,
    phase: 'package',
    target: {
      type: 'package',
      packageName: target.packageName,
      versionRange: target.versionRange,
    },
    source: {
      upstreamPullRequest: `https://github.com/ionic-team/capacitor/pull/${pr.number}`,
      capacitorPlusBranch: branchUrl,
      author: pr.author,
      authorAssociation: isExternalAuthor(pr.authorAssociation) ? 'external' : 'internal',
    },
    upstream: upstreamStatus,
    patchFile,
  };
}

export function createUpstreamStatus(pr) {
  const mergedAt = pr.mergedAt ?? null;
  if (mergedAt) {
    return {
      state: pr.state,
      mergedAt,
      status: 'merged-upstream',
    };
  }

  return {
    state: pr.state,
    mergedAt: null,
    status: 'not-merged',
  };
}

export function isExternalAuthor(authorAssociation) {
  return !INTERNAL_AUTHOR_ASSOCIATIONS.has(String(authorAssociation ?? '').toUpperCase());
}

export function isShippedPackageFile(file, root) {
  const relative = file.slice(root.length + 1);
  if (!relative || relative.startsWith('.')) {
    return false;
  }

  const basename = path.basename(relative);
  if (['CHANGELOG.md', 'LICENSE', 'LICENSE.md', 'README.md', 'package.json'].includes(basename)) {
    return false;
  }

  if (isTestOrGeneratedFile(relative)) {
    return false;
  }

  return true;
}

export function isSourceRuntimeFile(file) {
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) {
    return false;
  }
  return !isTestOrGeneratedFile(file);
}

export function buildQuickPatchComment(entries) {
  const ids = entries.map((entry) => entry.id).sort();
  const firstId = ids[0];
  const patches = ids.length === 1 ? `'${firstId}'` : ids.map((id) => `      '${id}',`).join('\n');
  const patchConfig = ids.length === 1 ? `    patches: [${patches}],` : `    patches: [\n${patches}\n    ],`;

  return `<!-- capgo-capacitor-patch:quick-patch -->
This fix is available as a quick patch through \`@capgo/capacitor-patch\`.

Patch ${ids.length === 1 ? 'ID' : 'IDs'}: ${ids.map((id) => `\`${id}\``).join(', ')}

\`\`\`ts
plugins: {
  CapacitorPatch: {
${patchConfig}
    strict: true,
  },
}
\`\`\`

Run \`npx cap sync\` after installing \`@capgo/capacitor-patch\`.`;
}

export async function syncUpstreamPatches(options) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const capacitorPlusDir = path.resolve(options.capacitorPlusDir);
  const remote = options.remote ?? 'origin';
  const baseRef = options.baseRef ?? `${remote}/plus`;
  const patchDir = path.join(rootDir, 'patches');
  const catalogPath = path.join(patchDir, 'catalog.json');
  const existingCatalog = readJson(catalogPath);
  const catalogById = new Map(existingCatalog.map((entry) => [entry.id, entry]));
  let remainingBuildPrs = options.maxBuildPrs ?? 3;
  const branches = options.prNumbers?.length
    ? options.prNumbers.map((number) => `${remote}/sync/upstream-pr-${number}`)
    : listSyncBranches(capacitorPlusDir, remote);
  const generatedEntries = [];
  const skipped = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capgo-capacitor-patch-sync-'));

  try {
    for (const branch of branches) {
      const prNumber = parseSyncBranchNumber(branch);
      if (!prNumber) {
        continue;
      }

      const pr = await getPullRequestMetadata(prNumber, options.githubToken);
      if (options.externalOnly !== false && !isExternalAuthor(pr.authorAssociation)) {
        skipped.push({ pr: prNumber, reason: `internal author association: ${pr.authorAssociation}` });
        continue;
      }

      const headSha = git(capacitorPlusDir, ['rev-parse', branch]).trim();
      if (options.requireChecks) {
        const checkState = await getCommitCheckState({
          owner: 'Cap-go',
          repo: 'capacitor-plus',
          ref: headSha,
          token: options.githubToken,
        });
        if (checkState.state !== 'success') {
          skipped.push({ pr: prNumber, reason: `checks are ${checkState.state}: ${checkState.summary}` });
          continue;
        }
      }

      const mergeBase = git(capacitorPlusDir, ['merge-base', baseRef, branch]).trim();
      const changedFiles = listChangedFiles(capacitorPlusDir, mergeBase, branch);
      const { directTargets, compiledTargets } = groupPatchTargets(changedFiles);
      const selectedCompiledTargets = compiledTargets.filter(
        (target) => options.refreshExisting || !catalogById.has(`upstream-pr-${prNumber}-${target.suffix}`),
      );
      const selectedDirectTargets = directTargets.filter(
        (target) => options.refreshExisting || !catalogById.has(`upstream-pr-${prNumber}-${target.suffix}`),
      );

      if (!selectedDirectTargets.length && !selectedCompiledTargets.length) {
        skipped.push({ pr: prNumber, reason: 'no new patchable package files' });
        continue;
      }

      const branchEntries = [];
      let skippedCompiledForLimit = false;
      for (const target of selectedDirectTargets) {
        const files = changedFiles.filter((file) => target.accepts(file));
        const diff = git(capacitorPlusDir, [
          'diff',
          `--relative=${target.root}`,
          `${mergeBase}..${branch}`,
          '--',
          ...files,
        ]);
        if (!diff.trim()) {
          continue;
        }
        const patchFile = writePatchFile(patchDir, prNumber, target, diff, options.dryRun);
        branchEntries.push(createCatalogEntryForTarget({ pr, target, patchFile, prNumber }));
      }

      if (selectedCompiledTargets.length) {
        if (remainingBuildPrs <= 0) {
          skippedCompiledForLimit = true;
          skipped.push({ pr: prNumber, reason: 'compiled patch generation limit reached' });
        } else {
          remainingBuildPrs -= 1;
          const built = generateCompiledDiffs({
            capacitorPlusDir,
            mergeBase,
            branch,
            targets: selectedCompiledTargets,
            tmpDir,
          });

          for (const item of built) {
            if (!item.diff.trim()) {
              continue;
            }
            const patchFile = writePatchFile(patchDir, prNumber, item.target, item.diff, options.dryRun);
            branchEntries.push(createCatalogEntryForTarget({ pr, target: item.target, patchFile, prNumber }));
          }
        }
      }

      if (!branchEntries.length) {
        if (!skippedCompiledForLimit) {
          skipped.push({ pr: prNumber, reason: 'generated diffs were empty' });
        }
        continue;
      }

      generatedEntries.push(...branchEntries);
      for (const entry of branchEntries) {
        catalogById.set(entry.id, entry);
      }
    }

    const nextCatalog = sortCatalogEntries([...catalogById.values()]);
    if (!options.dryRun && generatedEntries.length) {
      fs.writeFileSync(catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`);
    }

    return {
      generatedEntries,
      skipped,
      catalogPath,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function commentOnUpstreamPullRequests(options) {
  const baseCatalog = readCatalogFromGit(options.baseRef);
  const headCatalog = readCatalogFromGit(options.headRef);
  const baseIds = new Set(baseCatalog.map((entry) => entry.id));
  const added = headCatalog.filter((entry) => !baseIds.has(entry.id) && entry.source?.upstreamPullRequest);
  const byPullRequest = new Map();

  for (const entry of added) {
    const prNumber = getEntryPullRequestNumber(entry);
    if (!Number.isFinite(prNumber)) {
      continue;
    }
    const entries = byPullRequest.get(prNumber) ?? [];
    entries.push(entry);
    byPullRequest.set(prNumber, entries);
  }

  const posted = [];
  for (const [prNumber, entries] of byPullRequest) {
    const body = buildQuickPatchComment(entries);
    if (options.dryRun) {
      posted.push({ pr: prNumber, entries: entries.map((entry) => entry.id), dryRun: true });
      continue;
    }
    if (!options.githubToken) {
      throw new Error('GITHUB_TOKEN or PERSONAL_ACCESS_TOKEN is required to comment on upstream pull requests.');
    }

    await upsertIssueComment({
      owner: 'ionic-team',
      repo: 'capacitor',
      issueNumber: prNumber,
      token: options.githubToken,
      marker: '<!-- capgo-capacitor-patch:quick-patch -->',
      body,
    });
    posted.push({ pr: prNumber, entries: entries.map((entry) => entry.id) });
  }

  return { posted, added };
}

function createCatalogEntryForTarget({ pr, target, patchFile, prNumber }) {
  return createCatalogEntry({
    pr,
    target,
    patchFile,
    upstreamStatus: createUpstreamStatus(pr),
    branchUrl: `https://github.com/Cap-go/capacitor-plus/tree/sync/upstream-pr-${prNumber}`,
  });
}

function writePatchFile(patchDir, prNumber, target, diff, dryRun) {
  const patchFile = `patches/upstream-pr-${prNumber}-${target.suffix}.patch`;
  if (!dryRun) {
    fs.writeFileSync(path.join(patchDir, path.basename(patchFile)), diff.endsWith('\n') ? diff : `${diff}\n`);
  }
  return patchFile;
}

function listSyncBranches(repoDir, remote) {
  const output = git(repoDir, [
    'for-each-ref',
    '--format=%(refname:short)',
    `refs/remotes/${remote}/sync/upstream-pr-*`,
  ]);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => (parseSyncBranchNumber(a) ?? 0) - (parseSyncBranchNumber(b) ?? 0));
}

function listChangedFiles(repoDir, baseRef, headRef) {
  return git(repoDir, ['diff', '--name-only', `${baseRef}..${headRef}`])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function generateCompiledDiffs({ capacitorPlusDir, mergeBase, branch, targets, tmpDir }) {
  const baseDir = path.join(tmpDir, `base-${process.pid}-${Date.now()}`);
  const headDir = path.join(tmpDir, `head-${process.pid}-${Date.now()}`);
  git(capacitorPlusDir, ['worktree', 'add', '--detach', baseDir, mergeBase]);
  git(capacitorPlusDir, ['worktree', 'add', '--detach', headDir, branch]);

  try {
    buildNeededTargets(baseDir, targets);
    buildNeededTargets(headDir, targets);

    return targets.map((target) => ({
      target,
      diff: createFileSetDiff({
        baseRoot: path.join(baseDir, target.root),
        headRoot: path.join(headDir, target.root),
        files: expandGeneratedFiles(path.join(headDir, target.root), target.generatedFiles),
      }),
    }));
  } finally {
    git(capacitorPlusDir, ['worktree', 'remove', '--force', baseDir], { allowFailure: true });
    git(capacitorPlusDir, ['worktree', 'remove', '--force', headDir], { allowFailure: true });
  }
}

function buildNeededTargets(worktreeDir, targets) {
  const buildTypes = new Set(targets.map((target) => target.build));
  if (!buildTypes.size) {
    return;
  }

  run('bun', ['install', '--frozen-lockfile'], { cwd: worktreeDir });

  if (buildTypes.has('nativebridge')) {
    run('bunx', ['tsc', 'native-bridge.ts', '--target', 'es2017', '--moduleResolution', 'node', '--outDir', 'build'], {
      cwd: path.join(worktreeDir, 'core'),
    });
    run('bunx', ['rollup', '--config', 'rollup.bridge.config.js'], { cwd: path.join(worktreeDir, 'core') });
  }

  if (buildTypes.has('core')) {
    run('bun', ['run', 'clean'], { cwd: path.join(worktreeDir, 'core') });
    run('bunx', ['tsc'], { cwd: path.join(worktreeDir, 'core') });
    run('bunx', ['rollup', '--config', 'rollup.config.js'], { cwd: path.join(worktreeDir, 'core') });
  }

  if (buildTypes.has('cli')) {
    run('bun', ['run', 'clean'], { cwd: path.join(worktreeDir, 'cli') });
    run('bun', ['run', 'assets'], { cwd: path.join(worktreeDir, 'cli') });
    run('bunx', ['tsc'], { cwd: path.join(worktreeDir, 'cli') });
  }
}

function createFileSetDiff({ baseRoot, headRoot, files }) {
  if (!files.length) {
    return '';
  }

  const diffRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capgo-capacitor-patch-diff-'));
  try {
    copySelectedFiles(baseRoot, diffRoot, files);
    git(diffRoot, ['init', '--quiet']);
    git(diffRoot, ['add', '-A']);
    copySelectedFiles(headRoot, diffRoot, files);
    git(diffRoot, ['add', '-N', '.'], { allowFailure: true });
    return git(diffRoot, ['diff', '--', ...files], { allowFailure: true });
  } finally {
    fs.rmSync(diffRoot, { recursive: true, force: true });
  }
}

function expandGeneratedFiles(rootDir, entries) {
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      files.push(entry);
      continue;
    }
    for (const file of walkFiles(absolute)) {
      const relative = path.relative(rootDir, file).split(path.sep).join('/');
      if (!isTestOrGeneratedFile(relative) && !relative.endsWith('.map')) {
        files.push(relative);
      }
    }
  }
  return files.sort();
}

function copySelectedFiles(sourceRoot, destRoot, files) {
  for (const file of files) {
    const source = path.join(sourceRoot, file);
    const dest = path.join(destRoot, file);
    if (!fs.existsSync(source)) {
      fs.rmSync(dest, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
  }
}

function walkFiles(rootDir) {
  const result = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        result.push(absolute);
      }
    }
  }
  return result;
}

function isTestOrGeneratedFile(file) {
  const normalized = file.split(path.sep).join('/');
  const basename = path.basename(normalized);
  return (
    normalized.includes('/build/') ||
    normalized.includes('/coverage/') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    normalized.includes('/__tests__/') ||
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(basename) ||
    basename.endsWith('.map')
  );
}

async function getPullRequestMetadata(number, token) {
  const fallback = {
    number,
    title: `Upstream Capacitor PR #${number}`,
    state: 'unknown',
    mergedAt: null,
    author: 'unknown',
    authorAssociation: 'NONE',
  };

  const data = await githubJson(`/repos/ionic-team/capacitor/pulls/${number}`, token, { optional: true });
  if (!data) {
    return fallback;
  }

  return {
    number,
    title: data.title,
    state: data.state,
    mergedAt: data.merged_at,
    author: data.user?.login ?? 'unknown',
    authorAssociation: data.author_association ?? 'NONE',
  };
}

async function getCommitCheckState({ owner, repo, ref, token }) {
  const checkRuns = await githubJson(`/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100`, token, {
    optional: true,
  });
  const status = await githubJson(`/repos/${owner}/${repo}/commits/${ref}/status`, token, { optional: true });
  const runs = checkRuns?.check_runs ?? [];
  const statuses = status?.statuses ?? [];
  const pendingRuns = runs.filter((run) => run.status !== 'completed');
  const failedRuns = runs.filter((run) => FAILED_CHECK_CONCLUSIONS.has(run.conclusion));
  const failedStatuses = statuses.filter((item) => item.state !== 'success');

  if (!runs.length && !statuses.length) {
    return { state: 'missing', summary: 'no check runs or statuses found' };
  }
  if (pendingRuns.length) {
    return { state: 'pending', summary: pendingRuns.map((run) => run.name).join(', ') };
  }
  if (failedRuns.length || failedStatuses.length) {
    return {
      state: 'failure',
      summary: [
        ...failedRuns.map((run) => `${run.name}:${run.conclusion}`),
        ...failedStatuses.map((item) => item.context),
      ].join(', '),
    };
  }
  if (runs.some((run) => !SUCCESSFUL_CHECK_CONCLUSIONS.has(run.conclusion))) {
    return { state: 'unknown', summary: 'one or more check runs have unknown conclusions' };
  }
  return { state: 'success', summary: `${runs.length + statuses.length} checks passed` };
}

async function upsertIssueComment({ owner, repo, issueNumber, token, marker, body }) {
  const comments = await githubJson(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`, token);
  const existing = comments.find((comment) => comment.body?.includes(marker));
  if (existing) {
    await githubJson(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, token, {
      method: 'PATCH',
      body: { body },
    });
    return;
  }
  await githubJson(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
    method: 'POST',
    body: { body },
  });
}

async function githubJson(endpoint, token, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (options.optional && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

function readCatalogFromGit(ref) {
  try {
    return JSON.parse(run('git', ['show', `${ref}:patches/catalog.json`], { allowFailure: false }));
  } catch {
    return [];
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function git(cwd, args, options = {}) {
  return run('git', ['-C', cwd, ...args], options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout;
}
