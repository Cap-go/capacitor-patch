import fs from 'node:fs';
import path from 'node:path';

export class PatchApplyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PatchApplyError';
    this.details = details;
  }
}

export function applyUnifiedDiff(rootDir, diffText, options = {}) {
  const reverse = options.reverse === true;
  const dryRun = options.dryRun === true;
  const files = parseUnifiedDiff(diffText);
  const updates = [];

  for (const filePatch of files) {
    const relativePath = getTargetPath(filePatch, reverse);
    if (!relativePath) {
      throw new PatchApplyError('Patch creates or deletes a file without a usable target path.');
    }

    const absolutePath = path.resolve(rootDir, relativePath);
    assertInsideRoot(rootDir, absolutePath);

    const exists = fs.existsSync(absolutePath);
    if (!exists && !isCreateFile(filePatch, reverse)) {
      throw new PatchApplyError(`Missing patch target: ${relativePath}`, { file: relativePath });
    }

    const original = exists ? fs.readFileSync(absolutePath, 'utf8') : '';
    const updated = applyHunks(original, filePatch.hunks, reverse, relativePath);
    const deleteFile = isDeleteFile(filePatch, reverse);

    if (deleteFile || updated !== original) {
      updates.push({ absolutePath, relativePath, content: updated, deleteFile });
    }
  }

  if (!dryRun) {
    for (const update of updates) {
      if (update.deleteFile) {
        fs.rmSync(update.absolutePath, { force: true });
      } else {
        fs.mkdirSync(path.dirname(update.absolutePath), { recursive: true });
        fs.writeFileSync(update.absolutePath, update.content);
      }
    }
  }

  return {
    changedFiles: updates.map((update) => update.relativePath),
  };
}

export function parseUnifiedDiff(diffText) {
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  const files = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].startsWith('--- ')) {
      index += 1;
      continue;
    }

    const oldPath = parseDiffPath(lines[index]);
    index += 1;

    if (!lines[index]?.startsWith('+++ ')) {
      throw new PatchApplyError('Malformed patch: missing +++ file header.');
    }

    const newPath = parseDiffPath(lines[index]);
    index += 1;
    const hunks = [];

    while (index < lines.length && !lines[index].startsWith('--- ')) {
      if (!lines[index].startsWith('@@ ')) {
        index += 1;
        continue;
      }

      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index]);
      if (!match) {
        throw new PatchApplyError(`Malformed patch hunk: ${lines[index]}`);
      }

      index += 1;
      const hunkLines = [];
      while (index < lines.length && !lines[index].startsWith('@@ ') && !lines[index].startsWith('--- ')) {
        if (lines[index].startsWith('\\')) {
          index += 1;
          continue;
        }
        if (lines[index] !== '' || index < lines.length - 1) {
          hunkLines.push(lines[index]);
        }
        index += 1;
      }

      hunks.push({
        oldStart: Number(match[1]),
        oldCount: Number(match[2] ?? '1'),
        newStart: Number(match[3]),
        newCount: Number(match[4] ?? '1'),
        lines: hunkLines,
      });
    }

    files.push({ oldPath, newPath, hunks });
  }

  if (files.length === 0) {
    throw new PatchApplyError('Patch does not contain any unified diff file headers.');
  }

  return files;
}

function applyHunks(content, hunks, reverse, relativePath) {
  const original = splitContent(content);
  const lines = [...original.lines];
  let offset = 0;

  for (const hunk of hunks) {
    const expected = [];
    const replacement = [];

    for (const rawLine of hunk.lines) {
      const marker = rawLine[0];
      const value = rawLine.slice(1);

      if (marker === ' ') {
        expected.push(value);
        replacement.push(value);
      } else if (marker === '-') {
        if (reverse) {
          replacement.push(value);
        } else {
          expected.push(value);
        }
      } else if (marker === '+') {
        if (reverse) {
          expected.push(value);
        } else {
          replacement.push(value);
        }
      } else {
        throw new PatchApplyError(`Unsupported patch line marker "${marker}" in ${relativePath}.`);
      }
    }

    const start = Math.max(0, (reverse ? hunk.newStart : hunk.oldStart) - 1 + offset);
    if (!matchesAt(lines, start, expected)) {
      throw new PatchApplyError(`Patch hunk does not match ${relativePath} at line ${start + 1}.`, {
        file: relativePath,
        line: start + 1,
      });
    }

    lines.splice(start, expected.length, ...replacement);
    offset += replacement.length - expected.length;
  }

  return joinContent(lines, original.finalNewline);
}

function parseDiffPath(line) {
  const value = line.slice(4).split('\t')[0].trim();
  if (value === '/dev/null') {
    return null;
  }
  return value.replace(/^[ab]\//, '');
}

function getTargetPath(filePatch, reverse) {
  return reverse ? (filePatch.oldPath ?? filePatch.newPath) : (filePatch.newPath ?? filePatch.oldPath);
}

function isCreateFile(filePatch, reverse) {
  return reverse ? filePatch.newPath === null : filePatch.oldPath === null;
}

function isDeleteFile(filePatch, reverse) {
  return reverse ? filePatch.oldPath === null : filePatch.newPath === null;
}

function splitContent(content) {
  const finalNewline = content.endsWith('\n');
  const lines = content.split('\n');
  if (finalNewline) {
    lines.pop();
  }
  return { lines, finalNewline };
}

function joinContent(lines, finalNewline) {
  return `${lines.join('\n')}${finalNewline ? '\n' : ''}`;
}

function matchesAt(lines, start, expected) {
  if (start < 0 || start + expected.length > lines.length) {
    return false;
  }

  return expected.every((line, index) => lines[start + index] === line);
}

function assertInsideRoot(rootDir, absolutePath) {
  const relative = path.relative(path.resolve(rootDir), absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PatchApplyError(`Patch target escapes root: ${absolutePath}`);
  }
}
