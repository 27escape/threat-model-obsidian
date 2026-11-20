// Build Threat Modelling: join src/ files (order in tools/files.json) into dist/<manifest id>/{main.js,styles.css,manifest.json}.
// No dependencies. node tools/build.mjs
// A "/* @src <path> */" line before every file leads from a main.js line back to its source file.
// If there is a "sample vault" folder, the build is copied into its plugins folder too, ready to try, and README.md and
// docs/language.md are copied into it as notes (tools/vault-docs.mjs).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process'; // build tool only, never in the plugin
import { writeVaultDocs } from './vault-docs.mjs';

const o = JSON.parse(fs.readFileSync('tools/files.json', 'utf8'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\n$/, '');
const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'));

const js = [read(o.header), ...o.js.map((f) => `/* @src ${f} */\n${read(f)}`), `module.exports = ${o.main};`].join('\n') + '\n';
const css = o.css.map((f) => `/* @src ${f} */\n${read(f)}`).join('\n') + '\n';
const man = JSON.stringify(manifest, null, 2) + '\n';

const write = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/main.js`, js);
  fs.writeFileSync(`${dir}/styles.css`, css);
  fs.writeFileSync(`${dir}/manifest.json`, man);
};
const dir = `dist/${manifest.id}`;
write(dir);
fs.writeFileSync('manifest.json', man); // the community plugin list reads manifest.json at the repo root
execFileSync(process.execPath, ['--check', `${dir}/main.js`]);
if (fs.existsSync('sample vault')) {
  write(`sample vault/.obsidian/plugins/${manifest.id}`);
  writeVaultDocs();
}
console.log(`built ${dir} (${manifest.version}, ${js.split('\n').length} lines)`);
