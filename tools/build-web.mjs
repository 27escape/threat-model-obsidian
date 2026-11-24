// Build the web app: one self-contained page, dist/web/index.html, from the plugin's own source (the files listed
// under "web" in tools/files.json, in order), a stand-in for Obsidian (src/web/shim.js), Pele to draw the diagrams and
// the Lucide icons. Needs them installed first:  npm install --no-save pele@1.13.0 lucide-static@1.77.0
// node tools/build-web.mjs
// The page loads nothing from anywhere: everything is inlined, and its Content-Security-Policy forbids connections.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const o = JSON.parse(fs.readFileSync('tools/files.json', 'utf8')).web;
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\n$/, '');
const need = (f) => {
  if (fs.existsSync(f)) return f;
  console.error(`${f} is missing: npm install --no-save pele@1.13.0 lucide-static@1.77.0`);
  process.exit(1);
};
const pele = read(need('node_modules/pele/dist/pele.global.js'));
const lucide = JSON.parse(read(need('node_modules/lucide-static/icon-nodes.json')));
// Lucide renames icons now and then and keeps the old names as aliases (shield-alert is now shield-exclamation-point):
// icon-nodes.json has only the new names, so find the old ones from the icon files, which have both
const lucideDir = 'node_modules/lucide-static/icons';
const body = (f) => read(`${lucideDir}/${f}`).replace(/<!--[\s\S]*?-->/g, '').replace(/class="[^"]*"/, '').trim();
const byBody = new Map();
for (const name of Object.keys(lucide)) if (fs.existsSync(`${lucideDir}/${name}.svg`)) byBody.set(body(`${name}.svg`), name);
const aliases = {};
for (const f of fs.readdirSync(lucideDir).filter((n) => n.endsWith('.svg'))) {
  const name = f.slice(0, -4);
  if (lucide[name]) continue;
  const to = byBody.get(body(f));
  if (to) aliases[name] = to;
}
const peleVersion = JSON.parse(read('node_modules/pele/package.json')).version;

// the examples: a .threat file whole, or the first threat block of a note
const examples = o.examples.map((f) => {
  const text = read(f) + '\n';
  const m = /^(`{3,}|~{3,})threat[ \t]*\n([\s\S]*?)^\1[ \t]*$/m.exec(text);
  const body = f.endsWith('.threat') ? text : m && m[2];
  if (!body) throw new Error(`${f} has no threat block`);
  return { name: path.basename(f).replace(/\.(md|threat)$/, ''), text: body };
});

// the language reference, for Help: without its pictures (the page loads nothing) and with links to other docs made absolute
const language = read('docs/language.md')
  .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, '')
  .replace(/\]\((?!https?:|#)([^)]+)\)/g, (m, to) => `](https://github.com/27escape/threat-model-obsidian/blob/main/docs/${to})`);

const app = ["'use strict';", ...o.js.map((f) => `/* @src ${f} */\n${read(f)}`)].join('\n');
const data = `const TW_LUCIDE = ${JSON.stringify(lucide)};\nconst TW_LUCIDE_ALIASES = ${JSON.stringify(aliases)};\nconst TW_EXAMPLES = ${JSON.stringify(examples, null, 1)};\nconst TW_LANGUAGE = ${JSON.stringify(language)};`;
const css = o.css.map((f) => `/* @src ${f} */\n${read(f)}`).join('\n');
const manifest = JSON.parse(read('src/manifest.json'));

// nothing inlined may close its <script> or <style> early
const script = (code) => `<script>\n${code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')}\n</script>`;
const csp = ["default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data: blob:', "connect-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');

const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="description" content="Write a threat model as text and see it as C4, sequence and data-flow diagrams, with STRIDE threats coloured by risk. Everything stays in your browser.">
<title>Threat Modelling</title>
<!-- Threat Modelling ${manifest.version}, web app. Built from the plugin's source by tools/build-web.mjs. Pele ${peleVersion} (MIT), Lucide (ISC). -->
<style>
${css.replace(/<\/(style)/gi, '<\\/$1')}
</style>
</head>
<body>
<div id="app"><noscript>This page needs JavaScript to draw the diagrams.</noscript></div>
${script(pele)}
${script(data)}
${script(app)}
</body>
</html>
`;

fs.mkdirSync(path.dirname(o.out), { recursive: true });
fs.writeFileSync(o.out, html);
// the app's own code must at least parse (compiled, not run)
new vm.Script(app, { filename: 'web app' });
console.log(`built ${o.out} (${(html.length / 1024).toFixed(0)} KB; ${examples.length} examples; ${Object.keys(lucide).length} icons and ${Object.keys(aliases).length} old names)`);
