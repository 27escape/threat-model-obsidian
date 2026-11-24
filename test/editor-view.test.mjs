// The Threat model editor (src/editor-view.js): which block is being edited, handed on when Obsidian draws the same
// model again (the note changed), and stopped when it goes for good; a threat ID opens only from the edited block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { ThreatModelPlugin, TFile } = load(['ThreatModelPlugin', 'TFile']);
const P = ThreatModelPlugin.prototype;

function plugin() {
  const p = Object.create(P);
  Object.assign(p, { editing: null, editingKey: null, liveBlocks: new Set(), opened: [] });
  p.detached = 0;
  const leaves = () => (p.viewOpen ? [{ view: null, detach: () => p.detached++ }] : []);
  p.app = { workspace: { getLeavesOfType: leaves, getRightLeaf: () => null, revealLeaf: async () => {} } };
  return p;
}
function block(key) {
  return {
    state: { key },
    containerEl: { isConnected: true },
    editing: false,
    setEditing(on) {
      this.editing = on;
    },
  };
}

test('editor: one block at a time; Edit in another moves the editor there; stopping clears it', async () => {
  const p = plugin();
  const a = block('note.md\u0000Shop');
  const b = block('note.md\u0000Bank');
  await p.startEditing(a);
  assert.equal(p.editing, a);
  assert.equal(a.editing, true);
  await p.startEditing(b);
  assert.equal(p.editing, b);
  assert.equal(a.editing, false, 'the first block’s switch goes off');
  p.stopEditing(a); // not the one being edited: nothing happens
  assert.equal(p.editing, b);
  p.stopEditing();
  assert.equal(p.editing, null);
  assert.equal(b.editing, false);
  assert.equal(p.editingKey, null);
});

test('editor: the same model drawn again takes over, whether the new block comes before or after the old one goes', async () => {
  const p = plugin();
  const old = block('note.md\u0000Shop');
  p.liveBlocks.add(old);
  await p.startEditing(old);
  // after: the old block goes, then the new one is drawn
  p.liveBlocks.delete(old);
  old.containerEl.isConnected = false;
  p.editingGone(old);
  assert.equal(p.editing, null);
  const fresh = block('note.md\u0000Shop');
  assert.equal(p.editingRedrawn(fresh), true);
  assert.equal(p.editing, fresh);
  assert.equal(fresh.editing, true);
  // before: the new one is drawn while the old is still there, then the old goes
  const next = block('note.md\u0000Shop');
  assert.equal(p.editingRedrawn(next), false, 'the old one is still on screen');
  p.liveBlocks.delete(fresh);
  p.editingGone(fresh);
  assert.equal(p.editing, next);
  assert.equal(next.editing, true);
  // another model drawn takes nothing over
  assert.equal(p.editingRedrawn(block('note.md\u0000Bank')), false);
  assert.equal(p.editing, next);
});

test('editor: a threat ID opens in the editor only from the block being edited', () => {
  const p = plugin();
  const shown = [];
  const view = { panel: { showThreat: (w) => shown.push(w.id) } };
  p.editorViewIfOpen = () => view;
  const a = block('k');
  p.editing = a;
  p.openThreat('T1', block('other'));
  p.openThreat('T2', a);
  assert.deepEqual(shown, ['T2']);
});

test('editor: opening another file closes the editor; the same file, or a click into a sidebar, keeps it', async () => {
  const p = plugin();
  const a = Object.assign(block('Examples/Shop.md\u0000Shop'), { sourcePath: 'Examples/Shop.md' });
  await p.startEditing(a);
  p.viewOpen = true;
  p.editingFileOpened({ path: 'Examples/Shop.md' }); // the same note again
  assert.equal(p.editing, a);
  assert.equal(p.detached, 0);
  p.editingFileOpened({ path: 'Examples/Bank.md' });
  assert.equal(p.editing, null);
  assert.equal(a.editing, false);
  assert.equal(p.detached, 1, 'the editor pane is closed');
  // nothing open (the last tab closed): closed too
  await p.startEditing(a);
  p.editingFileOpened(null);
  assert.equal(p.editing, null);
  assert.equal(p.detached, 2);
});

/** A vault with one note, and (if `open`) that note open in an editor in Live Preview or Source mode. */
function vault(text, open) {
  const file = Object.assign(new TFile(), { path: 'Shop.md' });
  const v = { text, writes: 0, edits: [] };
  const editor = {
    getValue: () => v.text,
    replaceRange(insert, from, to) {
      const lines = v.text.split('\n');
      const before = lines.slice(0, from.line).join('\n');
      const after = lines.slice(to.line).join('\n');
      v.text = `${before}\n${insert}${after}`;
      v.edits.push({ insert, from: from.line, to: to.line });
    },
  };
  v.app = {
    vault: {
      getAbstractFileByPath: (p) => (p === file.path ? file : null),
      process: async (f, fn) => {
        v.writes++;
        v.text = fn(v.text);
        return v.text;
      },
    },
    workspace: { getLeavesOfType: (t) => (t === 'markdown' && open ? [{ view: { file, editor, getMode: () => 'source' } }] : []) },
  };
  return v;
}

const NOTE = 'Notes\n\n```threat\nperson a "A"\n```\n\nMore\n';

test('editor: a change is written into the note’s own block, through its editor when it is open there', async () => {
  const v = vault(NOTE, true);
  const p = Object.assign(plugin(), { app: v.app });
  const b = { sourcePath: 'Shop.md', source: 'person a "A"', ctx: null };
  assert.equal(await p.writeModel(b, 'person a "A"', 'person a "A"\nsystem s "S"\n'), '');
  assert.equal(v.text, 'Notes\n\n```threat\nperson a "A"\nsystem s "S"\n```\n\nMore\n');
  assert.deepEqual(v.edits, [{ insert: 'person a "A"\nsystem s "S"\n', from: 3, to: 4 }], 'only the block’s lines, through the editor');
  assert.equal(v.writes, 0);
  // the note changed meanwhile: nothing is written
  assert.match(await p.writeModel(b, 'person a "A"', 'person a "B"'), /changed since/);
});

test('editor: with the note not open in an editor the file is changed; changes go one after another', async () => {
  const v = vault(NOTE, false);
  const p = Object.assign(plugin(), { app: v.app });
  const b = { sourcePath: 'Shop.md', source: 'person a "A"', ctx: { getSectionInfo: () => ({ lineStart: 2 }) } };
  // two saves made before the block is drawn again: the second is made from the first's text
  const one = p.writeModel(b, 'person a "A"', 'person a "A"\nsystem s "S"');
  const two = p.writeModel(b, 'person a "A"\nsystem s "S"', 'person a "A"\nsystem s "Shop"');
  assert.deepEqual([await one, await two], ['', '']);
  assert.equal(v.text, 'Notes\n\n```threat\nperson a "A"\nsystem s "Shop"\n```\n\nMore\n');
  assert.equal(v.writes, 2);
  assert.match(await p.writeModel({ sourcePath: 'Gone.md' }, 'x', 'y'), /couldn’t be found/);
});

test('editor: a .threat file takes the change itself', async () => {
  const p = plugin();
  const seen = [];
  const b = { fileView: { setModelText: (was, now) => (seen.push([was, now]), '') } };
  assert.equal(await p.writeModel(b, 'a', 'b'), '');
  assert.deepEqual(seen, [['a', 'b']]);
});

test('editor: the plugin sets up what blocks need before it registers the block processor (it draws open notes at once)', async () => {
  const p = Object.create(P);
  let checked = false;
  const nothing = () => {};
  Object.assign(p, {
    app: { workspace: { on: nothing } },
    manifest: { name: 'Threat Modelling' },
    loadData: async () => ({}),
    registerMarkdownCodeBlockProcessor(lang, fn) {
      // Obsidian draws the blocks of notes already open here: each block's onload asks about editing
      assert.equal(typeof (p.liveBlocks && p.liveBlocks.add), 'function', 'liveBlocks is ready'); // a Set (from the test's other realm)
      assert.equal(p.editing, null);
      checked = true;
    },
    registerEditorExtension: nothing,
    registerMarkdownPostProcessor: nothing,
    registerHoverLinkSource: nothing,
    registerView: nothing,
    registerEvent: nothing,
    registerExtensions: nothing,
    addSettingTab: nothing,
    addCommand: nothing,
  });
  await p.onload();
  assert.ok(checked);
});
