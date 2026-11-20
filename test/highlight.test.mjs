import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmHighlight, tmThreatFences, tmEditorExtension } = load(['tmHighlight', 'tmThreatFences', 'tmEditorExtension']);

/** "text:class" for each highlighted piece. */
const pieces = (text) => tmHighlight(text).map((t) => `${text.slice(t.from, t.to)}:${t.cls}`);

test('keywords, definitions, attribute keys, names, arrows and punctuation', () => {
  assert.deepEqual(pieces('container api "API" { zone = dmz }\napi -> db'), [
    'container:tm-hl-keyword',
    'api:tm-hl-def',
    '"API":tm-hl-string',
    '{:tm-hl-punct',
    'zone:tm-hl-key', // "zone" as an attribute, not the keyword
    '=:tm-hl-punct',
    'dmz:tm-hl-name',
    '}:tm-hl-punct',
    'api:tm-hl-name',
    '->:tm-hl-arrow',
    'db:tm-hl-name',
  ]);
});

test('threats: the ID, STRIDE letters, risks, statuses and numbers', () => {
  assert.deepEqual(pieces('threat T-01 "x" #S #spoofing #high #mitigated #open #mine { score = 7.5 }'), [
    'threat:tm-hl-keyword',
    'T-01:tm-hl-threat-id',
    '"x":tm-hl-string',
    '#S:tm-hl-tag tm-hl-stride-S',
    '#spoofing:tm-hl-tag tm-hl-stride-S',
    '#high:tm-hl-tag tm-hl-risk-high',
    '#mitigated:tm-hl-tag tm-hl-status tm-hl-closed',
    '#open:tm-hl-tag tm-hl-status',
    '#mine:tm-hl-tag',
    '{:tm-hl-punct',
    'score:tm-hl-key',
    '=:tm-hl-punct',
    '7.5:tm-hl-number',
    '}:tm-hl-punct',
  ]);
});

test('a combined STRIDE tag colours each letter, in titles and strings too', () => {
  assert.deepEqual(pieces('#STR #IEX'), [
    '#S:tm-hl-tag tm-hl-stride-S',
    'T:tm-hl-tag tm-hl-stride-T',
    'R:tm-hl-tag tm-hl-stride-R',
    '#IEX:tm-hl-tag',
  ]);
  assert.deepEqual(pieces('"x #IE"'), ['"x :tm-hl-string', '#I:tm-hl-tag tm-hl-stride-I', 'E:tm-hl-tag tm-hl-stride-E', '":tm-hl-string']);
});

test('hashtags inside strings, comments, and half-typed text', () => {
  assert.deepEqual(pieces('data = ["Password #secret"] // note #x'), [
    'data:tm-hl-key',
    '=:tm-hl-punct',
    '[:tm-hl-punct',
    '"Password :tm-hl-string',
    '#secret:tm-hl-tag tm-hl-sensitive',
    '":tm-hl-string',
    ']:tm-hl-punct',
    '// note #x:tm-hl-comment',
  ]);
  assert.deepEqual(pieces('/* open\ncomment'), ['/* open\ncomment:tm-hl-comment']);
  assert.deepEqual(pieces('title = "never closed'), ['title:tm-hl-key', '=:tm-hl-punct', '"never closed:tm-hl-string']);
  assert.deepEqual(pieces('a ? b'), ['a:tm-hl-name', 'b:tm-hl-name']);
  // ranges are in order and never overlap
  const r = tmHighlight('threat T1 "a #pii b" #S\nperson p "P" #x');
  for (let i = 1; i < r.length; i++) assert.ok(r[i].from >= r[i - 1].to);
});

test('the threat blocks in a note, including threat-source, but not other code', () => {
  const note = 'Intro\n\n```threat\nperson p\n```\n\n```js\nx\n```\n\n````threat-source\ncontainer c\n````\n\n~~~threat\nopen to the end';
  const f = tmThreatFences(note);
  assert.deepEqual(
    f.map((x) => note.slice(x.from, x.to)),
    ['person p\n', 'container c\n', 'open to the end']
  );
});

test('the editor extension marks the text inside threat blocks only', () => {
  const Marks = tmEditorExtension();
  const doc = 'person x\n```threat\nperson p\n```\n';
  const view = { state: { doc: { length: doc.length, toString: () => doc } } };
  const added = new Marks(view).decorations;
  assert.deepEqual(
    added.map((a) => `${doc.slice(a.from, a.to)}:${a.deco.class}`),
    ['person:tm-hl-keyword', 'p:tm-hl-def']
  );
});
