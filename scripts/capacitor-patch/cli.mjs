import path from 'node:path';

import { loadBuiltinCatalog } from './catalog.mjs';
import { getPluginConfig, loadCapacitorExtConfig } from './config.mjs';
import { printPatchResults, runCapacitorPatch, selectPatches } from './runner.mjs';

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (command === 'help' || options.help) {
    printHelp();
    return;
  }

  const rootDir = path.resolve(options.root ?? process.cwd());
  const extConfig = await loadCapacitorExtConfig(rootDir, process.env);
  const patchConfig = {
    ...getPluginConfig(extConfig),
    strict: options.strict ?? getPluginConfig(extConfig).strict,
  };

  if (command === 'list') {
    listPatches(loadBuiltinCatalog(), patchConfig, options);
    return;
  }

  if (command === 'apply' || command === 'doctor') {
    const phases = options.phase === 'all' ? ['package', 'native'] : [options.phase ?? 'package'];
    let selectedCount = 0;
    for (const phase of phases) {
      const result = await runCapacitorPatch({
        rootDir,
        extConfig,
        patchConfig,
        phase,
        platformName: options.platform,
        dryRun: command === 'doctor',
      });
      selectedCount += result.selectedCount;
      printPatchResults(result, { quietWhenEmpty: true });
    }
    if (selectedCount === 0) {
      console.log('[CapacitorPatch] No patches selected. Enable plugins.CapacitorPatch.recommended or list patch IDs.');
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function listPatches(catalog, patchConfig, options) {
  const rows = [];

  for (const phase of ['package', 'native']) {
    const selected = selectPatches(catalog, patchConfig, phase);
    const selectedIds = new Set(selected.patches.map((entry) => entry.patch.id));

    for (const patch of catalog.filter((item) => item.phase === phase)) {
      if (!options.all && !selectedIds.has(patch.id)) {
        continue;
      }

      rows.push({
        id: patch.id,
        phase: patch.phase,
        recommended: patch.recommended === true ? 'yes' : 'no',
        selected: selectedIds.has(patch.id) ? 'yes' : 'no',
        title: patch.title ?? '',
      });
    }
  }

  if (options.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log('[CapacitorPatch] No patches to list.');
    return;
  }

  for (const row of rows) {
    console.log(`${row.id}\t${row.phase}\trecommended:${row.recommended}\tselected:${row.selected}\t${row.title}`);
  }
}

function parseArgs(argv) {
  const options = {
    phase: 'all',
  };
  let command = 'help';

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (index === 0 && !value.startsWith('-')) {
      command = value;
      continue;
    }

    if (value === '--root') {
      options.root = argv[++index];
    } else if (value === '--phase') {
      options.phase = argv[++index];
    } else if (value === '--platform') {
      options.platform = argv[++index];
    } else if (value === '--strict') {
      options.strict = true;
    } else if (value === '--all') {
      options.all = true;
    } else if (value === '--json') {
      options.json = true;
    } else if (value === '--help' || value === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  return { command, options };
}

function printHelp() {
  console.log(`Usage:
  capgo-capacitor-patch list [--all] [--json]
  capgo-capacitor-patch apply [--root <dir>] [--phase package|native|all] [--platform ios|android] [--strict]
  capgo-capacitor-patch doctor [--root <dir>] [--phase package|native|all] [--platform ios|android] [--strict]
`);
}
