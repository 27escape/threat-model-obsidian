// The Threat model editor (src/editor-view.js): which block is being edited, handed on when Obsidian draws the same
// model again (the note changed), and stopped when it goes for good; a threat ID opens only from the edited block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { ThreatModelPlugin } = load(['ThreatModelPlugin']);
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
