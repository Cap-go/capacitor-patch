import fs from 'node:fs';

const catalogUrl = new URL('../../patches/catalog.json', import.meta.url);

export function loadBuiltinCatalog() {
  return readCatalogFile(catalogUrl);
}

export function readCatalogFile(file) {
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(catalog)) {
    throw new Error('Patch catalog must be an array.');
  }
  return catalog;
}
