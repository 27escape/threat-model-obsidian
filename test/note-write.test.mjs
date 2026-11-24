// Writing a changed model back into its note (src/note-write.js): the block is found by its code, the rest of the
// note is left exactly as it was, and nothing is written when the note changed meanwhile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmThreatBlocks, tmWriteBlock, tmPlanBlockWrite } = load(['tmThreatBlocks', 'tmWriteBlock', 'tmPlanBlockWrite']);

const NOTE = `# Shop

Some notes.

\`\`\`threat
title = "Shop"
person a "A"

system b "B"
\`\`\`

More notes.
`;
const WAS = 'title = "Shop"\nperson a "A"\n\nsystem b "B"';
const NOW = 'title = "Shop"\nperson a "A"\n\nsystem b "B"\na -> b "Uses"\n';

test('note write: the block is found by its code and replaced; the rest of the note stays as it was', () => {
  assert.deepEqual(tmThreatBlocks(NOTE), [{ open: 4, close: 9, prefix: '', body: WAS }]);
  const r = tmWriteBlock(NOTE, WAS, NOW, null);
  assert.equal(r.text, NOTE.replace('system b "B"\n```', 'system b "B"\na -> b "Uses"\n```'));
  // the code as Obsidian gives it may end with a line end or not
  assert.equal(tmWriteBlock(NOTE, `${WAS}\n`, NOW, null).text, r.text);
  // an empty model, and one written empty
  assert.equal(tmWriteBlock('```threat\n```\n', '', 'person a "A"', null).text, '```threat\nperson a "A"\n```\n');
});

test('note write: nothing is written when the note changed, or when two blocks are the same and Obsidian named neither', () => {
  assert.match(tmWriteBlock(NOTE.replace('person a "A"', 'person a "Alice"'), WAS, NOW, null).problem, /changed since/);
  const twice = `${NOTE}\n${NOTE}`;
  assert.match(tmWriteBlock(twice, WAS, NOW, null).problem, /more than one/);
  // Obsidian's line for the block picks between the two
  const second = tmThreatBlocks(twice)[1].open;
  const r = tmWriteBlock(twice, WAS, NOW, second);
  assert.equal(r.text, `${NOTE}\n${NOTE.replace('system b "B"\n```', 'system b "B"\na -> b "Uses"\n```')}`);
});

test('note write: several threat blocks, other code blocks, longer and tilde fences', () => {
  const note = ['```js', 'const x = 1;', '```', '````threat', 'person a "A"', '```', '````', '~~~threat', 'system b "B"', '~~~', ''].join('\n');
  const blocks = tmThreatBlocks(note);
  assert.deepEqual(blocks.map((b) => [b.open, b.close, b.body]), [
    [3, 6, 'person a "A"\n```'],
    [7, 9, 'system b "B"'],
  ]);
  const r = tmWriteBlock(note, 'system b "B"', 'system b "Bank"', null);
  assert.equal(r.text, note.replace('system b "B"', 'system b "Bank"'));
});

test('note write: Windows line ends are kept', () => {
  const crlf = NOTE.replace(/\n/g, '\r\n');
  const r = tmWriteBlock(crlf, WAS, NOW, null);
  assert.equal(r.text, crlf.replace('system b "B"\r\n```', 'system b "B"\r\na -> b "Uses"\r\n```'));
  assert.ok(!/[^\r]\n/.test(r.text), 'every line end is \\r\\n');
});

test('note write: a block in a callout or a list keeps its prefix on every line, empty lines too', () => {
  const callout = ['> [!note] The model', '> ```threat', '> person a "A"', '>', '> system b "B"', '> ```', '', 'After.'].join('\n');
  assert.deepEqual(tmThreatBlocks(callout), [{ open: 1, close: 5, prefix: '> ', body: 'person a "A"\n\nsystem b "B"' }]);
  const r = tmWriteBlock(callout, 'person a "A"\n\nsystem b "B"', 'person a "A"\n\nsystem b "Bank"\na -> b', null);
  assert.equal(r.text, ['> [!note] The model', '> ```threat', '> person a "A"', '>', '> system b "Bank"', '> a -> b', '> ```', '', 'After.'].join('\n'));
  const list = ['- The model:', '  ```threat', '  person a "A"', '  ```'].join('\n');
  assert.equal(tmWriteBlock(list, 'person a "A"', 'person a "A"\n\nsystem b "B"', null).text, ['- The model:', '  ```threat', '  person a "A"', '', '  system b "B"', '  ```'].join('\n'));
  // a callout that ends before its block does: not a block
  assert.deepEqual(tmThreatBlocks(['> ```threat', '> person a "A"', 'not in the callout', '```'].join('\n')), []);
});

test('note write: the plan gives the editor the lines to replace', () => {
  const plan = tmPlanBlockWrite(NOTE, WAS, NOW, null);
  assert.equal(plan.block.open, 4);
  assert.equal(plan.block.close, 9);
  assert.deepEqual(Array.from(plan.lines), ['title = "Shop"', 'person a "A"', '', 'system b "B"', 'a -> b "Uses"']);
});
