// Copy one artifact, or every artifact matching `pattern`, out of the run's directory in the
// host store, with actions/download-artifact's layout rules.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globToRegExp, runDir } from '../lib/store.mjs';

const name = process.env.INPUT_NAME || '';
const pattern = process.env.INPUT_PATTERN || '';
const mergeMultiple = process.env.INPUT_MERGE_MULTIPLE === 'true';
const dest = resolve(process.env.GITHUB_WORKSPACE || process.cwd(), process.env.INPUT_PATH || '.');
const dir = runDir();

const available = existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.includes('.partial-')).map((e) => e.name)
  : [];

let chosen;
if (name) {
  if (!available.includes(name)) {
    console.log(`::error::Artifact not found: ${name}`);
    process.exit(1);
  }
  chosen = [name];
} else {
  const matcher = pattern ? globToRegExp(pattern) : null;
  chosen = available.filter((a) => !matcher || matcher.test(a));
}

mkdirSync(dest, { recursive: true });
// A single named artifact lands directly in `path`; several land in a subdirectory each
// unless merge-multiple asks for them to be flattened - the upstream action's rule.
const flat = Boolean(name) || mergeMultiple;
for (const artifact of chosen) {
  cpSync(join(dir, artifact), flat ? dest : join(dest, artifact), { recursive: true });
}
console.log(`Downloaded ${chosen.length} artifact(s) to ${dest}: ${chosen.join(', ') || '(none)'}`);
