// Checks the colouring of drawn diagrams (stride-colour.js, icon-draw.js, id-links.js) in a real browser: every
// sample model's diagrams, drawn with Pele, are coloured once and then again, and the second pass must change
// nothing. A pass that keeps changing things makes the watcher run for ever and hangs Obsidian (it did once: an
// ID's tooltip was wrapped again on every pass). A development check only: Pele and Playwright aren't part of the plugin.
//   npm install --no-save pele playwright && node tools/dom-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { load } from '../test/load.mjs';

let pele;
let playwright;
try {
  pele = await import('pele');
  playwright = await import('playwright');
} catch {
  console.log('Pele or Playwright isn\'t installed here: npm install --no-save pele playwright');
  process.exit(2);
}
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

const order = JSON.parse(fs.readFileSync('tools/files.json', 'utf8')).js;
const code = ['src/tags.js', 'src/icons.js', 'src/stride-colour.js', 'src/icon-draw.js', 'src/id-links.js'].filter((f) => order.includes(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const browser = await (playwright.chromium || playwright.default.chromium).launch();
const page = await browser.newPage();
let bad = 0;
let count = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const src = f.endsWith('.threat') ? text : tmFirstBlock(text);
  if (src === null) continue;
  const { model, errors } = tmBuildModel(src);
  if (!model || errors.length) continue;
  const ids = model.threats.filter((t) => t.id).map((t) => [t.id, { cls: `tm-tid-${t.risk || 'none'}`, tip: `${t.id} — ${t.title}` }]);
  for (const mm of [tmStructure(model, 'component'), tmDataflow(model), tmSequence(model, '')]) {
    const { svg } = pele.render(mm);
    await page.setContent(`<div id="d">${svg}</div>`);
    const passes = await page.evaluate(
      ([code, ids]) => {
        window.getIcon = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        (0, eval)(`${code};window.__c = tmColourStride;window.__i = tmDrawIcons;`);
        const el = document.getElementById('d');
        const map = new Map(ids);
        return [0, 1, 2].map(() => window.__c(el, map) + window.__i(el));
      },
      [code, ids]
    );
    count++;
    if (passes[1] || passes[2]) {
      console.log(`problem: ${f}: a second colouring pass still changed ${passes[1]} things (passes: ${passes.join(', ')})`);
      bad++;
    }
  }
}
await browser.close();
console.log(bad ? `${bad} problem(s)` : `all ${count} diagrams settle after one pass`);
process.exit(bad ? 1 : 0);
