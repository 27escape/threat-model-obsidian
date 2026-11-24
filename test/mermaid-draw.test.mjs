// Drawing a diagram (src/mermaid-draw.js): with Obsidian's own Mermaid the SVG goes straight into the block, without
// MarkdownRenderer (whose post-processors include other plugins': one that threw stopped every diagram); a failure
// shows a message instead of stopping the block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmDrawMermaid } = load(['tmDrawMermaid']);

/** Just enough of an element: children, and the DOM helpers the code uses. */
function el(cls = '') {
  const e = {
    cls,
    kids: [],
    text: '',
    createDiv(o = {}) {
      const c = el(o.cls || '');
      if (o.text) c.text = o.text;
      e.kids.push(c);
      return c;
    },
    appendChild(n) {
      e.kids.push(n);
      return n;
    },
    empty() {
      e.kids = [];
    },
  };
  return e;
}

test('mermaid draw: with Obsidian\'s Mermaid, the SVG is put in the block and bound, with no Markdown rendering', async () => {
  const body = el();
  const seen = {};
  const mermaid = {
    render: async (id, text) => {
      seen.id = id;
      seen.text = text;
      return { svg: '<svg id="x"></svg>', bindFunctions: (host) => (seen.bound = host) };
    },
  };
  await tmDrawMermaid('flowchart LR\n  a --> b', body, { load: async () => mermaid, parse: (svg) => ({ svg }) });
  assert.equal(seen.text, 'flowchart LR\n  a --> b');
  assert.match(seen.id, /^tm-mermaid-\d+$/);
  assert.equal(body.kids.length, 1);
  assert.equal(body.kids[0].cls, 'mermaid');
  assert.deepEqual(body.kids[0].kids, [{ svg: '<svg id="x"></svg>' }]);
  assert.equal(seen.bound, body.kids[0]);
});

test('mermaid draw: a failure shows its message in place of the diagram, and nothing is thrown', async () => {
  const body = el();
  await tmDrawMermaid('nonsense', body, { load: async () => ({ render: async () => { throw new Error('Parse error on line 1'); } }) });
  const host = body.kids[0];
  assert.equal(host.kids.length, 1);
  assert.equal(host.kids[0].cls, 'tm-errors');
  assert.match(host.kids[0].text, /Parse error on line 1/);
  // without Obsidian's Mermaid it goes through MarkdownRenderer; one that throws (as a post-processor did) is caught
  const other = el();
  await tmDrawMermaid('flowchart LR', other, { load: null });
  assert.equal(other.kids.length, 1);
  assert.equal(other.kids[0].cls, 'tm-errors');
});
