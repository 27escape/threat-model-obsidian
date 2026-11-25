// Tries the built web app in a real browser: the models menu (and the ways to close it), every example in every
// view, point and click (every threat's form saved unchanged changes nothing; a threat added to a box, changed and
// deleted), hiding and showing the text, then the life of a model of your own (save a copy, edit, reload, rename,
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
const source = () => p.$eval('.tm-source-over', (t) => t.value);
/** Choose an item from one of the top bar's small menus (Add, Model). */
const pick = async (menu, item) => {
  await p.click(`.tw-dropdown > button >> text=${menu}`);
  await pause(100);
  await p.click(`.tw-dropdown-menu button >> text=${item}`);
  await pause(250);
};
const dialogOpen = (cls = '') => p.$(`dialog${cls}[open]`).then(Boolean);
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
  // one scenario at a time, on every view: the list comes before the view list, and starts on All scenarios
  const scenarios = await p.$$eval('.tm-scenario-select option', (os) => os.map((o) => o.value));
  if (scenarios.length) {
    if ((await p.inputValue('.tm-scenario-select')) !== '') fail(`${name}: the scenario list does not start on All scenarios`);
    if (!(await p.$eval('.tm-bar', (bar) => bar.querySelector('.tm-scenario-select').compareDocumentPosition(bar.querySelector('.tm-view-select')) & Node.DOCUMENT_POSITION_FOLLOWING))) fail(`${name}: the scenario list is not before the view list`);
    for (const view of ['structure', 'sequence', 'dataflow']) { // ending on Data flow, as the loop above does
      await p.selectOption('.tm-view-select', view);
      for (const sc of scenarios.slice(1)) {
        await p.selectOption('.tm-scenario-select', sc);
        await pause(250);
        if (!(await p.$('.tw-view .mermaid svg'))) fail(`${name}, ${view}, scenario ${sc}: no diagram`);
        else drawn++;
      }
    }
    await p.selectOption('.tm-scenario-select', '');
    await pause(250);
  }
  const register = await p.$$('.tw-view .tm-table tr');
  const threats = (await p.inputValue('.tm-source-over')).match(/^\s*threat\b/gm);
  if (threats && !register.length) fail(`${name}: no threat register`);
}

// ---- point and click: every threat of every example saved from its form unchanged leaves the text as it was; a
// box opens its panel, a new threat is added to it, changed and deleted
for (const name of examples) {
  await openMenu();
  await p.click(`.tw-menu-panel .tw-group:last-child .tw-item >> text="${name}"`);
  await pause();
  const before = await p.$eval('.tm-source-over', (t) => t.value);
  const ids = await p.$$eval('.tw-view tr[data-tm-threat]', (rs) => rs.map((r) => r.getAttribute('data-tm-threat')));
  for (const id of ids) {
    await p.click(`.tw-view tr[data-tm-threat="${id}"] td.tm-threat-id`);
    await pause(120);
    if ((await p.textContent('.tw-panel-head h2')) !== `Threat ${id}`) fail(`${name}: ${id}'s row does not open its form`);
    await p.click('.tm-form button[type=submit]');
    await pause(120);
    const said = await p.textContent('.tm-form-problem');
    if (said) fail(`${name}: saving ${id} unchanged says "${said}"`);
  }
  if ((await p.$eval('.tm-source-over', (t) => t.value)) !== before) fail(`${name}: saving its threats unchanged changed the text`);
  await p.keyboard.press('Escape');
}
await openMenu();
await p.click(`.tw-menu-panel .tw-group:last-child .tw-item >> nth=1`);
await pause();
const box = await p.$('.tw-view .mermaid .pele-node');
await box.click({ position: { x: 12, y: 12 } });
await pause();
if (!(await p.isVisible('.tw-panel'))) fail('a box does not open the panel');
if (await p.isVisible('.tw-edit')) fail('the text is still shown beside the panel');
await p.click('.tw-panel >> text=New threat here');
await pause(150);
const newId = (await p.textContent('.tm-form-id')).trim();
await p.fill('.tm-form input[type=text]', 'Checked threat');
await p.click('.tm-form-letter >> text=T');
await p.selectOption('.tm-form select[aria-label=Likelihood]', '2');
await p.selectOption('.tm-form select[aria-label=Impact]', '3');
await p.click('.tm-form button[type=submit]');
await pause();
let text = await p.$eval('.tm-source-over', (t) => t.value);
if (!text.includes(`threat ${newId} "Checked threat" #T`)) fail(`the new threat ${newId} is not in the text`);
if (!(await p.$(`.tw-view tr[data-tm-threat="${newId}"]`))) fail(`the new threat ${newId} is not in the threat register`);
await p.selectOption('.tm-form select[aria-label=Status]', 'mitigated');
await p.click('.tm-form button[type=submit]');
await pause();
text = await p.$eval('.tm-source-over', (t) => t.value);
if (!/status = "mitigated"/.test(text.slice(text.indexOf(`threat ${newId}`)))) fail(`${newId}'s status was not saved`);
await p.click('.tm-form-delete');
await p.click('dialog button.mod-warning');
await pause();
if ((await p.$eval('.tm-source-over', (t) => t.value)).includes(`threat ${newId}`)) fail(`${newId} was not deleted`);
// a box's own form saved unchanged changes nothing, and a change to it is written
const kept = await p.$eval('.tm-source-over', (t) => t.value);
await (await p.$('.tw-view .mermaid .pele-node')).click({ position: { x: 12, y: 12 } });
await pause(200);
await p.click('.tw-panel .tw-panel-details .tm-form button[type=submit]');
await pause(200);
if ((await p.$eval('.tm-source-over', (t) => t.value)) !== kept) fail('saving a box\'s form unchanged changed the text');
await p.fill('.tw-panel .tw-panel-details textarea[aria-label=Description]', 'Checked description');
await p.click('.tw-panel .tw-panel-details .tm-form button[type=submit]');
await pause(300);
if (!(await p.$eval('.tm-source-over', (t) => t.value)).includes('description = "Checked description"')) fail('a box\'s description was not written');
// the Icon field suggests icons as you type: drawn beside their names, chosen with the keys
await p.click('.tw-panel .tw-panel-details input[aria-label=Icon]');
await p.fill('.tw-panel .tw-panel-details input[aria-label=Icon]', 'data');
await pause(150);
const offered = await p.$$eval('.tw-panel .tw-suggest:not(.tw-hidden) .tw-suggest-item', (els) => els.map((e) => [e.textContent, !!e.querySelector('svg')]));
if (!offered.length || !offered.every(([name, drawn]) => name.includes('data') && drawn)) fail(`the Icon field does not suggest icons (${JSON.stringify(offered.slice(0, 3))})`);
await p.keyboard.press('ArrowDown');
await p.keyboard.press('Enter');
if ((await p.inputValue('.tw-panel .tw-panel-details input[aria-label=Icon]')) !== offered[0][0]) fail('choosing a suggested icon does not fill the field');
if (await p.isVisible('.tw-panel .tw-suggest')) fail('the suggestions stay open after choosing');
await p.fill('.tw-panel .tw-panel-details input[aria-label=Icon]', '');
await p.keyboard.press('Escape');
// an arrow opens its flows
await p.selectOption('.tm-view-select', 'dataflow');
await pause();
await p.click('.tw-view .pele-edge-label >> nth=0');
await pause(200);
if (!/flow/i.test(await p.textContent('.tw-panel-head h2'))) fail('an arrow does not open its flow');
// the Structure view's zones: a zone box opens the zone; the Zones switch takes them away
if (await p.isVisible('.tw-panel')) await p.click('.tw-panel-head button');
await p.selectOption('.tm-view-select', 'structure');
await pause();
const zoneBox = await p.$('.tw-view .pele-cluster.tmZone > rect');
if (!zoneBox) fail('the Structure view draws no zones');
else {
  await zoneBox.scrollIntoViewIfNeeded();
  const zb = await zoneBox.boundingBox();
  await p.mouse.click(zb.x + 6, zb.y + 40);
  await pause(200);
  if (!(await p.isVisible('.tw-panel')) || !/Zone/.test(await p.textContent('.tw-panel .tw-panel-kind'))) fail('a zone on the Structure view does not open the zone');
  if (await p.isVisible('.tw-panel')) await p.click('.tw-panel-head button');
  await p.click('.tm-toggle >> text=Zones');
  await pause();
  if (await p.$('.tw-view .pele-cluster.tmZone')) fail('the Zones switch does not take the zones away');
  await p.click('.tm-toggle >> text=Zones');
  await pause();
}
// controls: a new one, then deleted
await pick('Model', 'Controls');
await pause(200);
await p.click('.tw-panel >> text=New control');
await pause(150);
await p.fill('.tw-panel .tm-form input[type=text] >> nth=0', 'Checked control');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(300);
if (!(await p.$eval('.tm-source-over', (t) => t.value)).includes('"Checked control"')) fail('a new control was not written');
await p.click('.tw-panel .tm-form-delete');
await p.click('dialog button.mod-warning');
await pause(300);
if ((await p.$eval('.tm-source-over', (t) => t.value)).includes('"Checked control"')) fail('the control was not deleted');
// zones: a new one, then deleted
await pick('Model', 'Zones');
await pause(200);
await p.click('.tw-panel >> text=New zone');
await pause(150);
await p.fill('.tw-panel .tm-form input[aria-label=Name]', 'Checked zone');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(300);
if (!(await p.$eval('.tm-source-over', (t) => t.value)).includes('zone checked_zone "Checked zone"')) fail('a new zone was not written');
await p.click('.tw-panel .tm-form-delete');
await p.click('dialog button.mod-warning');
await pause(300);
if ((await p.$eval('.tm-source-over', (t) => t.value)).includes('checked_zone')) fail('the zone was not deleted');
// a threat rated by a CVSS vector instead
const firstId = await p.$eval('.tw-view tr[data-tm-threat]', (r) => r.getAttribute('data-tm-threat'));
await p.click(`.tw-view tr[data-tm-threat="${firstId}"] td.tm-threat-id`);
await pause(200);
await p.selectOption('.tw-panel select[aria-label="Rated by"]', 'cvss');
await p.fill('.tw-panel input[aria-label="CVSS vector"]', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
await p.click('.tm-form button[type=submit]');
await pause(300);
text = await p.$eval('.tm-source-over', (t) => t.value);
if (!/cvss = "CVSS:3\.1\/AV:N\/AC:L\/PR:N\/UI:N\/S:U\/C:H\/I:H\/A:H"/.test(text)) fail('the CVSS vector was not written');
if (!/CVSS 9\.8/.test(await p.textContent('.tw-view .tm-table'))) fail('the threat register does not show the CVSS score');
await p.click('.tw-panel-head button');
await pause(150);
if (await p.isVisible('.tw-panel')) fail('the panel does not close');

// ---- building without typing: an element, a flow from it, a scenario; undo and redo; show in text
await pick('Add', 'Element');
await p.fill('.tw-panel .tm-form input[aria-label=Name]', 'Checked element');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(300);
text = await source();
if (!/\b(container|component) checked_element "Checked element"/.test(text)) fail('a new element was not written');
if ((await p.textContent('.tw-panel-head h2')) !== 'Checked element') fail('the new element is not shown in the panel');
await p.click('.tw-panel >> text=New flow from it');
await pause(150);
await p.fill('.tw-panel .tm-form input[aria-label="What it does"]', 'Checked flow');
await p.fill('.tw-panel .tm-form input[aria-label=Protocol]', 'HTTPS');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(300);
const withFlow = await source();
if (!/checked_element -> \w+ "Checked flow" \{ protocol = "HTTPS" \}/.test(withFlow)) fail('a new flow was not written');
await p.click('.tw-tools button[aria-label^=Undo]');
await pause(300);
if ((await source()).includes('Checked flow')) fail('Undo did not take the flow out');
await p.click('.tw-tools button[aria-label^=Redo]');
await pause(300);
if ((await source()) !== withFlow) fail('Redo did not put the flow back');
await p.click('.tw-brand');
await p.keyboard.press('Control+z');
await pause(300);
if ((await source()).includes('Checked flow')) fail('Ctrl+Z did not undo');
await p.keyboard.press('Control+Shift+z');
await pause(300);
if ((await source()) !== withFlow) fail('Ctrl+Shift+Z did not redo');
// a flow to a new element: its fields show only for "A new element…"; both are written as one change, and the new
// element is shown next, to fill in
await pick('Add', 'Flow');
const newRow = () => p.isVisible('.tw-panel .tm-form input[aria-label="New element: name"]');
await p.selectOption('.tw-panel .tm-form select[aria-label=From]', 'checked_element');
await p.selectOption('.tw-panel .tm-form select[aria-label=To]', { index: 0 });
if (await newRow()) fail('the new element’s fields show with an existing element chosen');
await p.selectOption('.tw-panel .tm-form select[aria-label=To]', '+new');
if (!(await newRow())) fail('the new element’s fields do not show for “A new element…”');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(200);
if (!/name/.test(await p.textContent('.tw-panel .tm-form-problem'))) fail('a new element without a name is not refused');
await p.fill('.tw-panel .tm-form input[aria-label="New element: name"]', 'Checked target');
await p.fill('.tw-panel .tm-form input[aria-label="What it does"]', 'Checked call');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(300);
text = await source();
if (!/\b(container|component|store) checked_target "Checked target"/.test(text) || !/checked_element -> checked_target "Checked call"/.test(text)) fail('the flow to a new element was not written');
if ((await p.textContent('.tw-panel-head h2')) !== 'Checked target') fail('the new element is not shown after its flow is added');
await p.click('.tw-tools button[aria-label^=Undo]');
await pause(300);
if ((await source()) !== withFlow) fail('one Undo does not take out both the new element and its flow');
await pick('Model', 'Scenarios');
await p.click('.tw-panel >> text=New scenario');
await pause(150);
await p.fill('.tw-panel .tm-form input[aria-label=Name]', 'Checked scenario');
await p.click('.tw-panel >> text=Add a step');
await p.click('.tw-panel .tm-form button[type=submit]');
await pause(300);
text = await source();
if (!/scenario checked_scenario "Checked scenario" \{\n\s+\w+ -> \w+/.test(text)) fail('a new scenario was not written');
if (await p.$('.tw-view .tm-errors')) fail('the new scenario left an error');
await p.click('.tw-panel >> text=Show in text');
await pause(300);
if (!(await p.isVisible('.tw-edit'))) fail('Show in text does not show the text');
const sel = await p.$eval('.tm-source-over', (t) => t.value.slice(t.selectionStart, t.selectionEnd));
if (!sel.startsWith('scenario checked_scenario')) fail(`Show in text selected "${sel.slice(0, 40)}"`);

// ---- problems: an error is counted, listed, and its line found from the diagram's list and the panel
await p.click('.tm-source-over');
await p.keyboard.press('Control+End');
await p.keyboard.type('\nnowhere -> checked_element\n');
await pause(1200);
if (!(await p.isVisible('.tw-problems.is-error'))) fail('the problems badge does not show the error');
const errLine = (await source()).split('\n').findIndex((l) => l.startsWith('nowhere')) + 1;
await p.click('.tw-view .tm-errors li >> nth=0');
await pause(200);
const caretLine = await p.$eval('.tm-source-over', (t) => t.value.slice(0, t.selectionStart).split('\n').length);
if (caretLine !== errLine) fail(`clicking the error went to line ${caretLine}, not ${errLine}`);
await p.click('.tw-problems');
await pause(200);
if ((await p.textContent('.tw-panel-head h2')) !== 'Problems') fail('the problems badge does not open the list');
if (!(await p.$('.tw-panel .tw-problem-error'))) fail('the error is not in the problems list');
await p.keyboard.press('Escape');
await p.click('.tw-brand');
await p.keyboard.press('Control+z'); // the error typed, undone
await pause(1200);
if ((await source()).includes('nowhere')) fail('undoing the typing did not take it out');

// ---- getting it out: pictures, the register, a link that brings the model back, the report
await openMenu();
const [svgFile] = await Promise.all([p.waitForEvent('download'), p.click('.tw-menu-panel .tw-action >> text=Download picture (SVG)')]);
const svgText = fs.readFileSync(await svgFile.path(), 'utf8');
if (!svgFile.suggestedFilename().endsWith('.svg') || !svgText.includes('<svg') || !svgText.includes('Checked element')) fail('the SVG picture is not right');
await openMenu();
const [pngFile] = await Promise.all([p.waitForEvent('download'), p.click('.tw-menu-panel .tw-action >> text=Download picture (PNG)')]);
const png = fs.readFileSync(await pngFile.path());
if (png.length < 1000 || png.toString('latin1', 1, 4) !== 'PNG') fail(`the PNG picture is not right (${png.length} bytes)`);
await openMenu();
const [csvFile] = await Promise.all([p.waitForEvent('download'), p.click('.tw-menu-panel .tw-action >> text=Download threat register')]);
const csv = fs.readFileSync(await csvFile.path(), 'utf8');
if (!/^ID,/.test(csv.replace(/^\uFEFF/, '')) || csv.split('\n').length < 3) fail('the threat register CSV is not right');
const shared = await source();
const link = await p.evaluate(([t]) => twShareLink(t, 'Checked link'), [shared]);
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => problems.push(`page error (link): ${e.message}`));
await p2.goto(link);
await p2.waitForTimeout(800);
if ((await p2.textContent('.tw-menu-label')) !== 'Shared: Checked link') fail('the link does not open as a shared model');
if ((await p2.$eval('.tm-source-over', (t) => t.value)) !== shared) fail('the link does not bring the model back whole');
await p2.close();
await p.click('.tm-report-btn');
await pause(1200);
if (!(await dialogOpen('.tw-report-dialog'))) fail('the report does not open in the page');
if (!(await p.$('.tw-report-dialog .tw-report h3'))) fail('the report has no headings');
if (!(await p.$('.tw-report-dialog .mermaid svg'))) fail('the report has no diagrams');
const [md] = await Promise.all([p.waitForEvent('download'), p.click('.tw-report-dialog >> text=Download Markdown')]);
if (!/threat report\.md$/.test(md.suggestedFilename())) fail(`report downloaded as ${md.suggestedFilename()}`);
await p.keyboard.press('Escape');
await pause(200);
if (await dialogOpen()) fail('Escape does not close the report');

// ---- every overlay closes the same ways: Escape, a click outside, its close button
const overlays = [
  ['About', async () => p.click('.tw-tools button[aria-label^="What this page is"]'), () => dialogOpen()],
  ['Help', async () => p.click('.tw-tools >> text=Help'), () => dialogOpen('.tw-help-dialog')],
  ['the Add menu', async () => p.click('.tw-dropdown > button >> text=Add'), () => p.$('.tw-dropdown-menu:not(.tw-hidden)').then(Boolean)],
  ['the Model menu', async () => p.click('.tw-dropdown > button >> text=Model'), () => p.$('.tw-dropdown-menu:not(.tw-hidden)').then(Boolean)],
];
for (const [what, open, isOpen] of overlays) {
  for (const how of ['Escape', 'outside', 'button']) {
    if (how === 'button' && what.endsWith('menu')) continue;
    await open();
    await pause(200);
    if (!(await isOpen())) {
      fail(`${what} does not open`);
      break;
    }
    if (how === 'Escape') await p.keyboard.press('Escape');
    else if (how === 'outside') await p.mouse.click(8, 880);
    else await p.click('dialog[open] .tw-dialog-tools .tw-menu-close');
    await pause(200);
    if (await isOpen()) fail(`${what} does not close with ${how === 'outside' ? 'a click outside' : how === 'button' ? 'its close button' : 'Escape'}`);
  }
}
await p.click('.tw-brand');
await p.keyboard.press('?');
await pause(200);
if (!(await dialogOpen('.tw-help-dialog'))) fail('? does not open Help');
if (!(await p.$('.tw-help-dialog .tw-help-nav a'))) fail('Help has no sections');
await p.keyboard.press('Escape');
await openMenu();
await p.click(`.tw-menu-panel .tw-group:last-child .tw-item >> nth=1`); // leave the changed example
await pause(150);
if (await p.$('dialog[open]')) await p.click('dialog button.mod-warning');
await pause();

// ---- zoom: Fit makes the diagram fit, + and − change it, the % goes back to its own size; Pele's own buttons are off
{
  const width = () => p.$eval('.tw-view .mermaid svg', (svg) => svg.getBoundingClientRect().width);
  const label = () => p.textContent('.tm-zoom-label');
  if (await p.$('.tw-view .pele-zoom')) fail('Pele’s own zoom buttons show beside the block’s');
  const own = await width();
  await p.click('.tm-zoom-btn[aria-label="Zoom in"]');
  await pause(300);
  const bigger = await width();
  if (!(bigger > own * 1.1)) fail(`Zoom in did not make the diagram bigger (${own} → ${bigger})`);
  await p.click('.tm-zoom-btn[aria-label="Zoom out"]');
  await p.click('.tm-zoom-btn[aria-label="Zoom out"]');
  await pause(300);
  if (!((await width()) < bigger)) fail('Zoom out did not make the diagram smaller');
  await p.click('.tm-zoom-btn[aria-label="Fit the whole diagram in view"]');
  await pause(300);
  const fit = await p.$eval('.tw-view .mermaid svg', (svg) => {
    const r = svg.getBoundingClientRect();
    const v = svg.closest('.tw-view').getBoundingClientRect();
    return r.width <= v.width + 1 && r.height <= v.height;
  });
  if (!fit) fail('Fit does not fit the diagram in view');
  await p.click('.tm-zoom-label');
  await pause(300);
  if (Math.abs((await width()) - own) > 2) fail('the % does not go back to the diagram as first drawn');
  if (!/^\d+%$/.test(await label())) fail('the zoom is not shown as a %');
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
await openMenu();
await p.click('.tw-menu-panel .tw-action >> text=Rename');
await p.fill('dialog input', 'Renamed model');
await p.click('dialog button.mod-cta');
await pause();
await openMenu();
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.tw-menu-panel .tw-action >> text=Download')]);
if (dl.suggestedFilename() !== 'Renamed model.threat') fail(`downloaded as ${dl.suggestedFilename()}`);
await openMenu();
await p.click('.tw-menu-panel .tw-action >> text=Earlier versions');
await pause(200);
if (!(await dialogOpen())) fail('Earlier versions does not open');
await p.keyboard.press('Escape');
await openMenu();
await p.click('.tw-menu-panel .tw-action >> text=Delete');
await p.click('dialog button.mod-warning');
await pause();
await openMenu();
if ((await p.$$('.tw-menu-panel .tw-group:nth-child(3) .tw-item')).length) fail('the model was not deleted');

await browser.close();
for (const x of problems) console.log(`problem: ${x}`);
console.log(problems.length ? `${problems.length} problem(s)` : `web app checked: the models menu, ${examples.length} examples, ${drawn} diagrams, every threat's form, a threat added, changed and deleted, a box's form, icon suggestions, an arrow, zones on the Structure view, a control and a zone added and deleted, a threat rated by CVSS, an element, flow and scenario added, a flow to a new element, undo and redo, show in text, problems, pictures, the register, a link, the report, every overlay closing three ways, help, zoom, hiding the text, and a model saved, reloaded, renamed, downloaded and deleted`);
process.exit(problems.length ? 1 : 0);
