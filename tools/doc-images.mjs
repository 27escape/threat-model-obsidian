// Draws the pictures in docs/language.md: each picture after a ```threat example shows one view of that example.
// The view comes from the picture's file name, images/language-<name>-<view>.svg, where <view> is one of
// structure-context, structure-container, structure-component, dataflow or sequence (the model's first scenario).
// Drawn with Pele, the renderer Obsidian uses, with the colours written in and a white background, so the pictures
// read the same on GitHub in light and dark mode; the boxed STRIDE letters and threat IDs get their colours written in too. Run it after changing an example. A development tool only:
//   npm install --no-save pele && node tools/doc-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from '../test/load.mjs';
import { examplesWithImages } from './vault-docs.mjs';

let pele;
try {
  pele = await import('pele');
} catch {
  console.log('Pele isn\'t installed here: npm install --no-save pele');
  process.exit(2);
}
const { tmBuildModel, tmStructure, tmDataflow, tmSequence, TM_STRIDE_MARKS, TM_STRIDE_COLOURS, TM_RISK_COLOURS, tmIconClassColour } = load([
  'tmIconClassColour',
  'TM_RISK_COLOURS',
  'tmBuildModel',
  'tmStructure',
  'tmDataflow',
  'tmSequence',
  'TM_STRIDE_MARKS',
  'TM_STRIDE_COLOURS',
]);
/** The boxed STRIDE letters in their colours (in Obsidian, stride-colour.js and styles.css do this). */
function colourStride(svg) {
  let out = svg;
  for (const [l, glyph] of Object.entries(TM_STRIDE_MARKS)) out = out.split(glyph).join(`<tspan fill="${TM_STRIDE_COLOURS[l]}">${glyph}</tspan>`);
  return out;
}

/** The threat IDs in their risk colours, or grey once closed (in Obsidian, stride-colour.js and styles.css do this). */
function colourIds(svg, model) {
  const fills = new Map();
  for (const t of model.threats) if (t.id) fills.set(t.id, t.status !== 'open' ? '#777777' : (TM_RISK_COLOURS[t.risk] || {}).line);
  const known = [...fills.keys()].filter((id) => fills.get(id)).sort((a, b) => b.length - a.length);
  if (!known.length) return svg;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\w-])((?:${known.map(esc).join('|')})(?: \\((?:\\d+(?:\\.\\d+)?|\\d×\\d)\\))?)(?![\\w-])`, 'g');
  return svg.replace(/>([^<]+)</g, (all, text) => `>${text.replace(re, (m) => `<tspan fill="${fills.get(m.replace(/ \(.*$/, ''))}">${m}</tspan>`)}<`);
}

// Lucide's icons for the boxes that have one (in Obsidian, icon-draw.js draws Obsidian's own); optional:
//   npm install --no-save lucide-static
let lucideDir = '';
try {
  lucideDir = path.join(path.dirname(fileURLToPath(import.meta.resolve('lucide-static/package.json'))), 'icons');
} catch {
  console.log('lucide-static isn\'t installed here, so pictures with icons are drawn without them: npm install --no-save lucide-static');
}

/** The icons drawn into the nodes that ask for one (class tmIcon_<name>), as icon-draw.js does in Obsidian. */
function drawIcons(svg) {
  return svg.replace(/(<g class="pele-node[^"]*\btmIcon_([a-z0-9_]+)[^"]*"[^>]*>)([\s\S]*?)(<\/g>)/g, (all, open, name, inner, close) => {
    const file = lucideDir && path.join(lucideDir, `${name.replace(/_/g, '-')}.svg`);
    const line = /<tspan x="([-\d.]+)" y="([-\d.]+)"/.exec(inner);
    if (!file || !fs.existsSync(file) || !line) return all;
    const cls = open.match(/class="([^"]*)"/)[1].split(' ');
    const part = (prefix) => (cls.find((c) => c.startsWith(prefix)) || '').slice(prefix.length);
    const label = /<text class="pele-label"[^>]*style="[^"]*fill:([^;"]+)/.exec(inner);
    const fg = tmIconClassColour(part('tmIconFg_')) || (label ? label[1] : '#1f1f1f');
    const bg = tmIconClassColour(part('tmIconBg_'));
    const size = 18;
    const x = Number(line[1]) - size / 2;
    const y = Number(line[2]) - size + 4;
    const back = bg ? `<rect x="${x - 3}" y="${y - 3}" width="${size + 6}" height="${size + 6}" rx="5" fill="${bg}"/>` : '';
    const icon = fs
      .readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<svg\b[^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`);
    return `${open}${inner}<g class="tm-icon">${back}${icon.trim()}</g>${close}`;
  });
}

const VIEWS = ['structure-context', 'structure-container', 'structure-component', 'dataflow', 'sequence'];

function mermaidFor(model, view) {
  if (view.startsWith('structure-')) return tmStructure(model, view.slice('structure-'.length), { portable: true });
  if (view === 'dataflow') return tmDataflow(model, { portable: true });
  return tmSequence(model, model.scenarioId || (model.scenarios[0] ? model.scenarios[0].id : ''));
}

let made = 0;
let bad = 0;
for (const ex of examplesWithImages(fs.readFileSync('docs/language.md', 'utf8'))) {
  const { model, errors } = tmBuildModel(ex.source);
  for (const img of ex.images) {
    const view = VIEWS.find((v) => img.endsWith(`-${v}.svg`));
    if (!model || errors.length || !view) {
      console.log(`problem: ${img}: ${!view ? `the name should end with one of ${VIEWS.join(', ')}` : 'its example has errors'}`);
      bad++;
      continue;
    }
    const { svg } = pele.render(mermaidFor(model, view));
    // a white background, so the picture reads on a dark page too
    const out = drawIcons(colourIds(colourStride(svg.replace(/(<svg\b[^>]*>)/, '$1<rect width="100%" height="100%" fill="#ffffff"/>')), model));
    fs.mkdirSync('docs/images', { recursive: true });
    fs.writeFileSync(`docs/${img}`, out);
    made++;
  }
}
console.log(bad ? `${bad} problem(s)` : `${made} pictures drawn`);
process.exit(bad ? 1 : 0);
