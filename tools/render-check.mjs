// Draws every view of every model in the sample vault with Pele, the Mermaid renderer Obsidian 1.15 uses,
// and reports any diagram it can't draw. A development check only: Pele is not part of the plugin.
//   npm install --no-save pele && node tools/render-check.mjs [--svg DIR]   (--svg also writes the SVGs)
import fs from 'node:fs';
import path from 'node:path';
import { load } from '../test/load.mjs';

let pele;
try {
  pele = await import('pele');
} catch {
  console.log('Pele isn\'t installed here: npm install --no-save pele');
  process.exit(2);
}
const out = process.argv.includes('--svg') ? process.argv[process.argv.indexOf('--svg') + 1] : '';
if (out) fs.mkdirSync(out, { recursive: true });
const { tmBuildModel, tmFirstBlock, tmStructure, tmSequence, tmDataflow } = load(['tmBuildModel', 'tmFirstBlock', 'tmStructure', 'tmSequence', 'tmDataflow']);

const files = [];
const walk = (d) => {
  for (const n of fs.readdirSync(d)) {
    if (n.startsWith('.')) continue;
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(md|threat)$/.test(n)) files.push(p);
  }
};
walk('sample vault');

let bad = 0;
let count = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const src = f.endsWith('.threat') ? text : tmFirstBlock(text);
  if (src === null) continue;
  const { model, errors } = tmBuildModel(src);
  if (!model || errors.length) {
    console.log(`problem: ${f}: the model has errors`);
    bad++;
    continue;
  }
  const views = {};
  for (const lvl of ['context', 'container', 'component']) {
    views[`structure-${lvl}`] = tmStructure(model, lvl);
    views[`structure-${lvl}-portable`] = tmStructure(model, lvl, { portable: true });
  }
  for (const lvl of ['context', 'container', 'component']) {
    views[`structure-${lvl}-compact`] = tmStructure(model, lvl, { compact: true });
    views[`structure-${lvl}-no-threats`] = tmStructure(model, lvl, { overlay: false });
  }
  views['dataflow-compact'] = tmDataflow(model, { compact: true });
  for (const s of ['', ...model.scenarios.map((x) => x.id)]) views[`sequence-${s || 'all'}-compact`] = tmSequence(model, s, { compact: true });
  views.dataflow = tmDataflow(model);
  views['dataflow-portable'] = tmDataflow(model, { portable: true });
  for (const s of ['', ...model.scenarios.map((x) => x.id)]) views[`sequence-${s || 'all'}`] = tmSequence(model, s);
  for (const [name, mm] of Object.entries(views)) {
    count++;
    try {
      const { svg } = pele.render(mm);
      if (out) fs.writeFileSync(path.join(out, `${path.basename(f).replace(/\.\w+$/, '')}-${name}.svg`), svg);
    } catch (e) {
      bad++;
      console.log(`problem: ${f} ${name}: ${e.message.split('\n')[0]}`);
    }
  }
}
console.log(bad ? `${bad} problem(s) in ${count} diagrams` : `all ${count} diagrams drawn`);
process.exit(bad ? 1 : 0);
