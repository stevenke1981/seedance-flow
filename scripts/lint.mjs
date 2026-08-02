import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const files = ['src/app.js', 'src/prompt-engine.mjs', 'src/ark-adapter.mjs', 'src/generation-policy.mjs', 'scripts/dev-server.mjs', 'scripts/api-server.mjs', 'scripts/build.mjs'];
for (const file of files) await exec(process.execPath, ['--check', join(root, file)]);
console.log(`Linted ${files.length} JavaScript modules.`);
