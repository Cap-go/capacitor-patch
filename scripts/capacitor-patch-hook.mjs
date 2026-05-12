import { getPluginConfig, loadCapacitorExtConfig } from './capacitor-patch/config.mjs';
import { printPatchResults, runCapacitorPatch } from './capacitor-patch/runner.mjs';

const phase = process.argv[2];

if (phase !== 'package' && phase !== 'native') {
  console.error('[CapacitorPatch] Expected hook phase "package" or "native".');
  process.exitCode = 1;
} else {
  try {
    const rootDir = process.env.CAPACITOR_ROOT_DIR ?? process.cwd();
    const extConfig = await loadCapacitorExtConfig(rootDir, process.env);
    const patchConfig = getPluginConfig(extConfig);
    const result = await runCapacitorPatch({
      rootDir,
      extConfig,
      patchConfig,
      phase,
      platformName: process.env.CAPACITOR_PLATFORM_NAME,
    });

    printPatchResults(result, { quietWhenEmpty: true });
  } catch (error) {
    console.error(`[CapacitorPatch] ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}
