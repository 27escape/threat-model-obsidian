// Tries the built web app in a real browser: the models menu (and the ways to close it), every example in every
// view, hiding and showing the text, then the life of a model of your own (save a copy, edit, reload, rename,
// download, delete). Fails on any error in the page.
//   npm install --no-save pele@1.13.0 lucide-static@1.77.0 playwright && node tools/build-web.mjs && node tools/web-check.mjs [--shots DIR]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.log('Playwright isn\'t installed here: npm install --no-save playwright');
  process.exit(0);
}
const page = 'dist/web/index.html';
if (!fs.existsSync(page)) {
  console.error(`${page} is missing: node tools/build-web.mjs first`);
  process.exit(1);
}
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const browser = await (playwright.chromium || playwright.default.chromium).launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const problems = [];
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${m.type()}: ${m.text()}`));
p.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
const pause = (ms = 350) => p.waitForTimeout(ms);
const fail = (what) => problems.push(what);
await p.goto(pathToFileURL(path.resolve(page)).href);
await pause(800);

// ---- the models menu: opens, and closes with Escape, a click outside, or its close button
const menuOpen = () => p.$eval('.tw-menu-panel', (el) => !el.classList.contains('tw-hidden'));
const openMenu = async () => {
  if (!(await menuOpen())) await p.click('.tw-menu-button');
  await pause(100);
};
await openMenu();
if (!(await menuOpen())) fail('the models menu does not open');
await p.keyboard.press('Escape');
if (await menuOpen()) fail('Escape does not close the models menu');
await openMenu();
await p.mouse.click(700, 600);
if (await menuOpen()) fail('a click outside does not close the models menu');
await openMenu();
await p.click('.tw-menu-close');
if (await menuOpen()) fail('the close button does not close the models menu');

// ---- every example, every view and choice in it
await openMenu();
const examples = await p.$$eval('.tw-menu-panel .tw-group:last-child .tw-item', (els) => els.map((e) => e.textContent));
await p.keyboard.press('Escape');
if (examples.length < 3) fail(`only ${examples.length} examples`);
let drawn = 0;
for (const name of examples) {
  await openMenu();
  await p.click(`.tw-menu-panel .tw-group:last-child .tw-item >> text="${name}"`);
  await pause();
  if (await menuOpen()) fail('choosing a model does not close the menu');
  if ((await p.textContent('.tw-menu-label')) !== name) fail(`the menu button doesn't say ${name}`);
  if (await p.$('.tw-view .tm-errors')) fail(`${name}: the example has errors`);
  for (const view of ['structure', 'sequence', 'dataflow']) {
    await p.selectOption('.tm-view-select', view);
    await pause();
    const choices = await p.$$eval('.tm-extra select option', (os) => os.map((o) => o.value));
    for (const c of choices.length ? choices : [null]) {
      if (c !== null) {
        await p.selectOption('.tm-extra select', c);
        await pause(250);
      }
      const svg = await p.$('.tw-view .mermaid svg');
      if (!svg) fail(`${name}, ${view}${c ? ` (${c})` : ''}: no diagram`);
      else drawn++;
      if (shots) await p.screenshot({ path: `${shots}/${name}-${view}${c ? `-${c}` : ''}.png`.replace(/\s+/g, '_') });
    }
  }
  const register = await p.$$('.tw-view .tm-table tr');
  const threats = (await p.inputValue('.tm-source-over')).match(/^\s*threat\b/gm);
  if (threats && !register.length) fail(`${name}: no threat register`);
}

// ---- hiding the text gives the diagrams the whole width, and is remembered
const width = () => p.$eval('.tw-view', (el) => el.getBoundingClientRect().width);
const before = await width();
await p.click('.tw-code-button');
await pause();
if (await p.isVisible('.tw-edit')) fail('Code does not hide the text');
if ((await width()) < before * 1.3) fail('the diagrams do not take the width when the text is hidden');
await p.reload();
await pause(800);
if (await p.isVisible('.tw-edit')) fail('hiding the text is not remembered');
await p.click('.tw-code-button');
await pause();
if (!(await p.isVisible('.tw-edit'))) fail('Code does not show the text again');

// ---- a model of your own: save a copy, change it, reload, rename, download, delete
await openMenu();
await p.click('.tw-menu-panel .tw-group:last-child .tw-item >> nth=0');
await pause();
await p.click('.tw-banner button');
await p.fill('dialog input', 'Checked model');
await p.click('dialog button.mod-cta');
await pause();
if ((await p.textContent('.tw-menu-label')) !== 'Checked model') fail('Save a copy did not open the copy');
await p.click('.tm-source-over');
await p.keyboard.press('Control+End');
await p.keyboard.type('\n// a change\n');
await pause(1200);
await p.reload();
await pause(800);
if ((await p.textContent('.tw-menu-label')) !== 'Checked model') fail('the last model was not reopened');
if (!(await p.inputValue('.tm-source-over')).includes('// a change')) fail('the change was not saved');
await p.click('text=Rename');
await p.fill('dialog input', 'Renamed model');
await p.click('dialog button.mod-cta');
await pause();
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.tw-tools >> text=Download')]);
if (dl.suggestedFilename() !== 'Renamed model.threat') fail(`downloaded as ${dl.suggestedFilename()}`);
const [report] = await Promise.all([p.waitForEvent('download'), p.click('.tm-report-btn')]);
if (!/threat report\.md$/.test(report.suggestedFilename())) fail(`report downloaded as ${report.suggestedFilename()}`);
await p.click('.tw-tools >> text=Delete');
await p.click('dialog button.mod-warning');
await pause();
await openMenu();
if ((await p.$$('.tw-menu-panel .tw-group:nth-child(2) .tw-item')).length) fail('the model was not deleted');

await browser.close();
for (const x of problems) console.log(`problem: ${x}`);
console.log(problems.length ? `${problems.length} problem(s)` : `web app checked: the models menu, ${examples.length} examples, ${drawn} diagrams, hiding the text, and a model saved, reloaded, renamed, downloaded and deleted`);
process.exit(problems.length ? 1 : 0);
