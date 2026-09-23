// Shared by artifact-upload and artifact-download: where a run's artifacts live on a
// self-hosted pool that mounts the store, and the glob dialect both actions speak.
import { existsSync, readdirSync, statSync, accessSync, constants } from 'node:fs';
import { join, sep } from 'node:path';

export const STORE = process.env.CI_ARTIFACTS_STORE || '/ci-artifacts';

export function storeAvailable() {
  try {
    accessSync(STORE, constants.W_OK);
    return statSync(STORE).isDirectory();
  } catch {
    return false;
  }
}

// One directory per run, not per attempt: a re-run of a failed job must still see what the
// first attempt's other jobs uploaded, exactly as the GitHub artifact store behaves.
export function runDir() {
  const repo = required('GITHUB_REPOSITORY').replace('/', '__');
  return join(STORE, repo, required('GITHUB_RUN_ID'));
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// `*` and `?` stay inside one path segment, `**` crosses them - the subset of
// @actions/glob that the workflows in this organisation use.
export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function hasGlob(segment) {
  return /[*?]/.test(segment);
}

// Hidden files and directories are skipped, as upload-artifact does by default
// (include-hidden-files: false).
export function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export const toPosix = (p) => p.split(sep).join('/');
