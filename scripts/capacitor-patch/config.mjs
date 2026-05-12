import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const PLUGIN_CONFIG_KEY = 'CapacitorPatch';

export function parseCapacitorConfig(rawValue) {
  if (!rawValue) {
    return {};
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`Unable to parse CAPACITOR_CONFIG: ${error.message}`);
  }
}

export function normalizePatchConfig(rawConfig = {}) {
  return {
    recommended: rawConfig.recommended === true,
    patches: normalizeStringArray(rawConfig.patches),
    disabled: normalizeStringArray(rawConfig.disabled),
    strict: rawConfig.strict === true,
  };
}

export function getPluginConfig(extConfig = {}) {
  return normalizePatchConfig(extConfig.plugins?.[PLUGIN_CONFIG_KEY]);
}

export async function loadCapacitorExtConfig(rootDir, env = process.env) {
  if (env.CAPACITOR_CONFIG) {
    return parseCapacitorConfig(env.CAPACITOR_CONFIG);
  }

  const fromCli = await loadConfigWithCapacitorCli(rootDir);
  if (fromCli) {
    return fromCli;
  }

  const jsonConfigPath = path.join(rootDir, 'capacitor.config.json');
  if (fs.existsSync(jsonConfigPath)) {
    return JSON.parse(fs.readFileSync(jsonConfigPath, 'utf8'));
  }

  return {};
}

async function loadConfigWithCapacitorCli(rootDir) {
  const require = createRequire(import.meta.url);
  const cwd = process.cwd();

  try {
    const { loadConfig } = require('@capacitor/cli/dist/config');
    process.chdir(rootDir);
    const config = await loadConfig();
    return config.app?.extConfig ?? {};
  } catch {
    return null;
  } finally {
    process.chdir(cwd);
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === 'string' && item.length > 0);
}
