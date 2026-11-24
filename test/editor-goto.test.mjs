// From the Threat model editor to the text (src/editor-goto.js): a problem's line and Show in text select the right
// place in the note (inside a callout too) or in a .threat file; and the link to the web editor (src/share-link.js)
// carries the model there and back whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from './load.mjs';

const { ThreatModelPlugin, TmEditorView, TFile, tmNotePosition, tmThreatBlocks } = load(['ThreatModelPlugin', 'TmEditorView', 'TFile', 'tmNotePosition', 'tmThreatBlocks']);

const CODE = 'title = "Shop"\nperson a "A"\nsystem b "B"\na -> b "Uses"';
const NOTE = `# Shop\n\n> [!note]\n> \`\`\`threat\n> ${CODE.split('\n').join('\n> ')}\n> \`\`\`\n`;

test('go to: an offset in the model is a line and column in the note, past the callout’s "> "', () => {
  const block = tmThreatBlocks(NOTE)[0];
  assert.deepEqual(tmNotePosition(CODE, block, 0), { line: 4, ch: 2 });
  const at = CODE.indexOf('system b');
  assert.deepEqual(tmNotePosition(CODE, block, at), { line: 6, ch: 2 });
  assert.deepEqual(tmNotePosition(CODE, block, at + 8), { line: 6, ch: 10 });
});

function setup(mode) {
  const file = Object.assign(new TFile(), { path: 'Shop.md' });
  const seen = { selection: null, modes: [], focused: false };
  const editor = {
    getValue: () => NOTE,
    setSelection: (a, b) => (seen.selection = [a, b]),
    scrollIntoView: () => {},
    focus: () => (seen.focused = true),
  };
  const leaf = {
    view: { file, editor, getMode: () => mode },
    getViewState: () => ({ type: 'markdown', state: { mode } }),
    setViewState: async (st) => {
      seen.modes.push(st.state.mode);
      mode = st.state.mode;
    },
  };
  const p = Object.create(ThreatModelPlugin.prototype);
  p.app = {
    vault: { getAbstractFileByPath: (x) => (x === 'Shop.md' ? file : null) },
    workspace: { getLeavesOfType: () => [leaf], setActiveLeaf: () => {} },
  };
  const view = Object.create(TmEditorView.prototype);
  Object.assign(view, { plugin: p, pending: null, block: { sourcePath: 'Shop.md', source: CODE, ctx: null } });
  return { p, view, seen };
}

test('go to: a problem’s line and Show in text select the statement in the note, switching Reading view to Live Preview', async () => {
  const { p, view, seen } = setup('preview');
  await p.selectModelText(view.block, CODE, CODE.indexOf('system'), CODE.indexOf('system') + 12);
  assert.deepEqual(seen.modes, ['source'], 'Reading view is switched to Live Preview');
  assert.deepEqual(JSON.parse(JSON.stringify(seen.selection)), [{ line: 6, ch: 2 }, { line: 6, ch: 14 }]);
  assert.ok(seen.focused);
  // through the view: line 3 of the model, and Show in text for the flow (its head: "a -> b")
  const calls = [];
  p.selectModelText = (block, text, from, to) => calls.push(text.slice(from, to));
  view.showLine(3);
  view.showInText({ type: 'flow', n: 1 });
  view.showInText({ type: 'element', id: 'b' });
  assert.deepEqual(calls, ['system b "B"', 'a -> b "Uses"', 'system b "B"']);
});

test('go to: a .threat file selects in its own text', async () => {
  const { p } = setup('source');
  const got = [];
  await p.selectModelText({ fileView: { selectText: (a, b) => got.push([a, b]) } }, CODE, 3, 7);
  assert.deepEqual(got, [[3, 7]]);
});

test('web editor link: the model and its name go there and come back whole, after "#"', async () => {
  const code = fs.readFileSync(new URL('../src/share-link.js', import.meta.url), 'utf8');
  const g = { TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream, btoa, atob, Uint8Array, String, JSON, RegExp, Error };
  const S = vm.runInNewContext(`${code};({ tmShareLink, tmReadShareLink, TM_WEB_EDITOR })`, g);
  const text = `${CODE}\n// ünïcode and a long line ${'x'.repeat(500)}\n`;
  const url = await S.tmShareLink(text, 'Shop', S.TM_WEB_EDITOR);
  assert.ok(url.startsWith('https://27escape.github.io/threat-model-obsidian/#model=z'), url.slice(0, 60));
  assert.ok(url.length < text.length, 'compressed');
  const back = await S.tmReadShareLink(url.slice(url.indexOf('#')));
  assert.deepEqual({ ...back }, { name: 'Shop', text });
  // without compression (an older browser): still read back
  const plain = vm.runInNewContext(`${code};({ tmShareLink, tmReadShareLink })`, { ...g, CompressionStream: undefined });
  const url2 = await plain.tmShareLink(text, 'Shop', 'https://x.test/page#old');
  assert.ok(url2.startsWith('https://x.test/page#model=p'));
  assert.equal((await S.tmReadShareLink(url2.slice(url2.indexOf('#')))).text, text);
  assert.equal(await S.tmReadShareLink('#something-else'), null);
  await assert.rejects(S.tmReadShareLink('#model=zAAAA'));
});
