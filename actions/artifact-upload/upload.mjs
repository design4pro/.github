// Copy the files named by `path` into the run's directory in the host store, laid out the way
// actions/upload-artifact lays out an artifact: relative to the least common ancestor of the
// patterns' search roots, so a single directory uploads as its contents.
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, appendFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { globToRegExp, hasGlob, runDir, toPosix, walk } from '../lib/store.mjs';

const name = process.env.INPUT_NAME || 'artifact';
const ifNoFiles = process.env.INPUT_IF_NO_FILES_FOUND || 'warn';
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const lines = (process.env.INPUT_PATH || '').split('\n').map((l) => l.trim()).filter(Boolean);

if (/[\\/":<>|*?\r\n]/.test(name)) throw new Error(`invalid artifact name: ${name}`);

const includes = lines.filter((l) => !l.startsWith('!'));
const excludes = lines.filter((l) => l.startsWith('!')).map((l) => globToRegExp(toPosix(resolve(workspace, l.slice(1)))));

const files = new Set();
const roots = [];
for (const pattern of includes) {
  const absolute = toPosix(resolve(workspace, pattern));
  const segments = absolute.split('/');
  const firstGlob = segments.findIndex(hasGlob);
  if (firstGlob === -1) {
    if (!existsSync(absolute)) continue;
    if (statSync(absolute).isDirectory()) {
      roots.push(absolute);
      walk(absolute).forEach((f) => files.add(toPosix(f)));
    } else {
      roots.push(dirname(absolute));
      files.add(absolute);
    }
    continue;
  }
  const root = segments.slice(0, firstGlob).join('/') || '/';
  const matcher = globToRegExp(absolute);
  const matched = walk(root).map(toPosix).filter((f) => matcher.test(f));
  if (matched.length) roots.push(root);
  matched.forEach((f) => files.add(f));
}

const selected = [...files].filter((f) => !excludes.some((re) => re.test(f)));

if (selected.length === 0) {
  const message = `No files were found with the provided path: ${lines.join(', ')}. No artifact will be uploaded.`;
  if (ifNoFiles === 'error') { console.log(`::error::${message}`); process.exit(1); }
  if (ifNoFiles === 'warn') console.log(`::warning::${message}`);
  else console.log(message);
  process.exit(0);
}

const common = roots.map((r) => r.split('/')).reduce((a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}).join('/') || '/';

const target = join(runDir(), name);
const staging = `${target}.partial-${process.pid}`;
rmSync(staging, { recursive: true, force: true });
for (const file of selected) {
  const dest = join(staging, relative(common, file));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(file, dest);
}
// Same-name uploads replace, as a re-run attempt of the same job would on GitHub.
rmSync(target, { recursive: true, force: true });
renameSync(staging, target);

console.log(`Stored ${selected.length} file(s) as artifact "${name}" in ${target}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- artifact \`${name}\`: ${selected.length} file(s) on the runner host at \`${target.replace(/^\/ci-artifacts/, '/srv/ci-artifacts')}\`\n`);
}
