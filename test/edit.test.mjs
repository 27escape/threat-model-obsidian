// The edit engine (src/edit.js, src/edit-threat.js): each edit changes only what it must, keeps comments and
// layout, and leaves a model that still builds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from './load.mjs';

const E = load([
  'tmBuildModel',
  'tmFirstBlock',
  'tmEditParse',
  'tmSetAttr',
  'tmSetTitle',
  'tmAddTag',
  'tmRemoveTags',
  'tmRemoveStatement',
  'tmInsertInto',
  'tmFormatValue',
  'tmQuote',
  'tmSetStride',
  'tmSetThreatStatus',
  'tmEditThreat',
  'tmAddThreat',
  'tmNextThreatId',
  'tmThreatStatement',
  'tmDeleteThreat',
]);

const SRC = `// my comment
title = "Shop"

zone web "Web" { trust = "untrusted" }

person user "User" { zone = web }  // trailing comment
container api "API" {
  technology = "Node.js"
  // note about the API
  zone = web
}
store db "DB"

user -> api "Calls" #auth {
  protocol = "HTTPS"
  threat T01 "Stuffing" #S #high
}
api -> db "Reads" { data = ["Rows"] }

threat T02 "Model-wide" #TI {
  likelihood = 3
  impact = "major"
  status = "accepted"
}
control C01 "Rate limit" { covers = [T01] }
`;

/** The text with each [from, to] pair replaced, for saying exactly what an edit should do. */
const swap = (text, ...pairs) => pairs.reduce((t, [a, b]) => {
  assert.ok(t.includes(a), `"${a}" is in the text`);
  return t.replace(a, b);
}, text);
const builds = (text) => {
  const { errors } = E.tmBuildModel(text);
  assert.deepEqual(errors, [], text);
  return text;
};

test('edit: values are written as the language writes them', () => {
  assert.equal(E.tmFormatValue('plain'), '"plain"');
  assert.equal(E.tmFormatValue('say "hi"'), '`say "hi"`');
  assert.equal(E.tmFormatValue('two\nlines'), '`two\nlines`');
  assert.equal(E.tmFormatValue('both " and `'), '"both ” and `"');
  assert.equal(E.tmFormatValue(3), '3');
  assert.equal(E.tmFormatValue(false), 'false');
  assert.equal(E.tmFormatValue({ id: 'web' }), 'web');
  assert.equal(E.tmFormatValue({ tag: 'pii' }), '#pii');
  assert.equal(E.tmFormatValue([{ id: 'api' }, { flow: { from: 'a', to: 'b', label: 'Go' } }]), '[api, a -> b "Go"]');
  assert.throws(() => E.tmFormatValue({ id: 'not an id' }));
  assert.throws(() => E.tmFormatValue(undefined));
});

test('edit: changing an attribute changes only its value', () => {
  assert.equal(E.tmSetAttr(SRC, { type: 'element', id: 'api' }, 'technology', 'Deno'), swap(SRC, ['"Node.js"', '"Deno"']));
  assert.equal(E.tmSetAttr(SRC, { type: 'zone', id: 'web' }, 'trust', 'trusted'), swap(SRC, ['"untrusted"', '"trusted"']));
  assert.equal(E.tmSetAttr(SRC, { type: 'model' }, 'title', 'Big shop'), swap(SRC, ['"Shop"', '"Big shop"']));
  assert.equal(E.tmSetAttr(SRC, { type: 'threat', id: 'T02' }, 'likelihood', 4), swap(SRC, ['likelihood = 3', 'likelihood = 4']));
});

test('edit: a new attribute goes where the block\u2019s others are, in its style', () => {
  // a block over several lines: a line of its own before the "}", indented like the rest
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'element', id: 'api' }, 'owner', 'Team')), swap(SRC, ['  zone = web\n}', '  zone = web\n  owner = "Team"\n}']));
  // a block on one line stays on one line, and the comment after it stays
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'element', id: 'user' }, 'icon', 'user')), swap(SRC, ['{ zone = web }  // trailing', '{ zone = web  icon = "user" }  // trailing']));
  // no block: one is made
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'element', id: 'db' }, 'technology', 'PostgreSQL')), swap(SRC, ['store db "DB"\n', 'store db "DB" { technology = "PostgreSQL" }\n']));
  // a flow, by its number
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'flow', n: 2 }, 'encrypted', false)), swap(SRC, ['{ data = ["Rows"] }', '{ data = ["Rows"]  encrypted = false }']));
  // the model's own attributes go at the end
  assert.ok(builds(E.tmSetAttr(SRC, { type: 'model' }, 'owner', 'Web team')).endsWith('{ covers = [T01] }\n\nowner = "Web team"\n'));
});

test('edit: removing an attribute removes its line, or just it, and an emptied block', () => {
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'element', id: 'api' }, 'zone', null)), swap(SRC, ['  zone = web\n}', '}']));
  assert.ok(E.tmSetAttr(SRC, { type: 'element', id: 'api' }, 'zone', null).includes('// note about the API'));
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'flow', n: 2 }, 'data', null)), swap(SRC, ['api -> db "Reads" { data = ["Rows"] }', 'api -> db "Reads"']));
  assert.equal(builds(E.tmSetAttr(SRC, { type: 'element', id: 'user' }, 'zone', null)), swap(SRC, ['person user "User" { zone = web }  // trailing', 'person user "User"  // trailing']));
  const two = 'person u "U" { zone = web  icon = "user" }\nzone web "W"\n';
  assert.equal(E.tmSetAttr(two, { type: 'element', id: 'u' }, 'zone', null), 'person u "U" { icon = "user" }\nzone web "W"\n');
  assert.equal(E.tmSetAttr(two, { type: 'element', id: 'u' }, 'icon', null), 'person u "U" { zone = web }\nzone web "W"\n');
  const comma = 'person u "U" { zone = web, icon = "user" }\nzone web "W"\n';
  assert.equal(E.tmSetAttr(comma, { type: 'element', id: 'u' }, 'zone', null), 'person u "U" { icon = "user" }\nzone web "W"\n');
  assert.equal(E.tmSetAttr(SRC, { type: 'element', id: 'db' }, 'technology', null), SRC); // nothing to remove
});

test('edit: titles and tags in the header', () => {
  assert.equal(builds(E.tmSetTitle(SRC, { type: 'flow', n: 1 }, 'Signs in')), swap(SRC, ['"Calls"', '"Signs in"']));
  assert.equal(E.tmSetTitle(SRC, { type: 'threat', id: 'T01' }, 'Say "no"'), swap(SRC, ['"Stuffing"', '`Say "no"`']));
  assert.equal(E.tmSetTitle('person u\n', { type: 'element', id: 'u' }, 'User'), 'person u "User"\n');
  assert.equal(E.tmSetTitle('person u #x\n', { type: 'element', id: 'u' }, 'User'), 'person u "User" #x\n');
  assert.equal(E.tmSetTitle('person u { title = "Old" }\n', { type: 'element', id: 'u' }, 'New'), 'person u { title = "New" }\n');
  assert.equal(E.tmAddTag(SRC, { type: 'flow', n: 1 }, 'pci'), swap(SRC, ['"Calls" #auth {', '"Calls" #auth #pci {']));
  assert.equal(E.tmAddTag(SRC, { type: 'flow', n: 1 }, 'auth'), SRC);
  assert.equal(E.tmRemoveTags(SRC, { type: 'flow', n: 1 }, (t) => t === 'auth'), swap(SRC, ['"Calls" #auth {', '"Calls" {']));
});

test('edit: STRIDE letters, kept together or apart as they were written', () => {
  const t1 = { type: 'threat', id: 'T01' };
  const t2 = { type: 'threat', id: 'T02' };
  assert.equal(E.tmSetStride(SRC, t1, ['T', 'S']), swap(SRC, ['#S #high', '#S #T #high']));
  assert.equal(E.tmSetStride(SRC, t2, ['I']), swap(SRC, ['#TI {', '#I {']));
  assert.equal(E.tmSetStride(SRC, t2, ['E', 'T', 'I']), swap(SRC, ['#TI {', '#TIE {']));
  assert.equal(E.tmSetStride(SRC, t2, ['T', 'I']), SRC);
  assert.equal(E.tmSetStride(SRC, t1, []), swap(SRC, ['"Stuffing" #S #high', '"Stuffing" #high']));
  assert.equal(E.tmSetStride('threat T9 "X" #spoofing #tampering\n', { type: 'threat', id: 'T9' }, ['S']), 'threat T9 "X" #S\n');
  assert.equal(E.tmSetStride('threat T9 "X"\n', { type: 'threat', id: 'T9' }, ['D']), 'threat T9 "X" #D\n');
});

test('edit: a threat’s status, as a tag if it has one, otherwise as status = "…"', () => {
  assert.equal(E.tmSetThreatStatus(SRC, { type: 'threat', id: 'T02' }, 'mitigated'), swap(SRC, ['status = "accepted"', 'status = "mitigated"']));
  assert.equal(E.tmSetThreatStatus(SRC, { type: 'threat', id: 'T02' }, 'open'), swap(SRC, ['status = "accepted"', 'status = "open"']));
  assert.equal(builds(E.tmSetThreatStatus(SRC, { type: 'threat', id: 'T01' }, 'mitigated')), swap(SRC, ['"Stuffing" #S #high', '"Stuffing" #S #high { status = "mitigated" }']));
  assert.equal(E.tmSetThreatStatus(SRC, { type: 'threat', id: 'T01' }, 'open'), SRC);
  const tagged = 'threat T5 "X" #S #accepted\n';
  assert.equal(E.tmSetThreatStatus(tagged, { type: 'threat', id: 'T5' }, 'transferred'), 'threat T5 "X" #S #transferred\n');
  assert.throws(() => E.tmSetThreatStatus(SRC, { type: 'threat', id: 'T01' }, 'closed'), /isn't a status/);
});

test('edit: a threat changed from its form writes only what changed, and rates it one way', () => {
  const t1 = { type: 'threat', id: 'T01' };
  const out = builds(E.tmEditThreat(SRC, t1, { title: 'Stuffing', stride: ['S'], likelihood: 4, impact: 5, owner: 'Identity team', mitigation: 'Rate limiting' }));
  assert.equal(out, swap(SRC, ['threat T01 "Stuffing" #S #high', 'threat T01 "Stuffing" #S {\n    likelihood = 4\n    impact = 5\n    owner = "Identity team"\n    mitigation = "Rate limiting"\n  }']));
  assert.deepEqual(E.tmBuildModel(out).warnings, []);
  // the same fields again change nothing; words for likelihood and impact count as their numbers
  assert.equal(E.tmEditThreat(out, t1, { title: 'Stuffing', stride: ['S'], likelihood: 4, impact: 5, owner: 'Identity team', mitigation: 'Rate limiting', description: '' }), out);
  assert.equal(E.tmEditThreat(SRC, { type: 'threat', id: 'T02' }, { likelihood: 3, impact: 4, status: 'accepted' }), SRC);
  // taking things away
  const less = E.tmEditThreat(out, t1, { owner: '', mitigation: null, impact: null, likelihood: null });
  assert.equal(less, swap(SRC, ['threat T01 "Stuffing" #S #high', 'threat T01 "Stuffing" #S']));
  // controls and "on" as lists
  const linked = builds(E.tmEditThreat(SRC, { type: 'threat', id: 'T02' }, { controls: ['C01'], on: [{ id: 'api' }, { flow: { from: 'user', to: 'api' } }] }));
  assert.match(linked, /status = "accepted"\n  controls = \[C01\]\n  on = \[api, user -> api\]\n\}/);
  assert.equal(E.tmEditThreat(linked, { type: 'threat', id: 'T02' }, { controls: ['C01'], on: [{ id: 'api' }, { flow: { from: 'user', to: 'api' } }] }), linked);
  assert.throws(() => E.tmEditThreat(SRC, t1, { title: '  ' }), /needs a title/);
  assert.throws(() => E.tmEditThreat(SRC, t1, { likelihood: 7 }), /from 1 to 5/);
});

test('edit: new threats get the next ID in the model’s pattern, and go inside what they are about', () => {
  assert.equal(E.tmNextThreatId(E.tmEditParse(SRC)), 'T03');
  assert.equal(E.tmNextThreatId(E.tmEditParse('threat SHOP-07 "a"\nthreat SHOP-02 "b"\n')), 'SHOP-08');
  assert.equal(E.tmNextThreatId(E.tmEditParse('threat "no id"\n')), 'T01');
  assert.equal(E.tmNextThreatId(E.tmEditParse('threat R9 "a"\n')), 'R10');

  const onFlow = E.tmAddThreat(SRC, { type: 'flow', n: 2 }, { title: 'Rows read by anyone', stride: ['I'], likelihood: 2, impact: 4 });
  assert.equal(onFlow.id, 'T03');
  assert.equal(builds(onFlow.text), swap(SRC, ['api -> db "Reads" { data = ["Rows"] }', 'api -> db "Reads" {\n  data = ["Rows"]\n  threat T03 "Rows read by anyone" #I {\n    likelihood = 2\n    impact = 4\n  }\n}']));
  const onStore = E.tmAddThreat(SRC, { type: 'element', id: 'db' }, { title: 'Deleted', stride: ['D'] });
  assert.equal(builds(onStore.text), swap(SRC, ['store db "DB"\n', 'store db "DB" { threat T03 "Deleted" #D }\n']));
  const onModel = E.tmAddThreat(SRC, { type: 'model' }, { title: 'Everywhere', stride: ['R'], on: ['api', 'db'] });
  assert.ok(builds(onModel.text).endsWith('{ covers = [T01] }\n\nthreat T03 "Everywhere" #R {\n  on = [api, db]\n}\n'));
  const inBlock = E.tmAddThreat(SRC, { type: 'element', id: 'api' }, { title: 'Injection', stride: ['T'], status: 'accepted' });
  assert.equal(builds(inBlock.text), swap(SRC, ['  zone = web\n}', '  zone = web\n  threat T03 "Injection" #T #accepted\n}']));
  assert.throws(() => E.tmAddThreat(SRC, { type: 'flow', n: 2 }, { id: 'T01', title: 'Again' }), /already a threat T01/);
  assert.throws(() => E.tmAddThreat(SRC, { type: 'control', id: 'C01' }, { title: 'No' }), /can't be added/);
  assert.throws(() => E.tmAddThreat(SRC, { type: 'flow', n: 9 }, { title: 'No' }), /no flow 9/);
});

test('edit: removing a statement takes its lines, and its block if that leaves it empty', () => {
  const noT01 = E.tmRemoveStatement(SRC, { type: 'threat', id: 'T01' });
  assert.equal(noT01, swap(SRC, ['  protocol = "HTTPS"\n  threat T01 "Stuffing" #S #high\n}', '  protocol = "HTTPS"\n}']));
  // deleting a threat also takes it out of the controls that cover it
  assert.equal(builds(E.tmDeleteThreat(SRC, { type: 'threat', id: 'T01' })), swap(noT01, ['control C01 "Rate limit" { covers = [T01] }', 'control C01 "Rate limit"']));
  const two = 'threat T1 "a" #S\nthreat T2 "b" #T\ncontrol C1 "c" {\n  covers = [T1, T2]\n}\n';
  assert.equal(builds(E.tmDeleteThreat(two, { type: 'threat', id: 'T1' })), 'threat T2 "b" #T\ncontrol C1 "c" {\n  covers = [T2]\n}\n');
  assert.equal(E.tmRemoveStatement('person a\nperson b { threat T1 "x" #S }\n', { type: 'threat', id: 'T1' }), 'person a\nperson b\n');
  assert.equal(E.tmRemoveStatement(SRC, { type: 'control', id: 'C01' }), swap(SRC, ['control C01 "Rate limit" { covers = [T01] }\n', '']));
  assert.throws(() => E.tmRemoveStatement(SRC, { type: 'model' }));
});

test('edit: every sample model survives an attribute added and taken away, and a threat retitled to its own title', () => {
  const dir = new URL('../sample vault/Examples/', import.meta.url);
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((n) => /\.(md|threat)$/.test(n))) {
    const text = fs.readFileSync(new URL(f, dir), 'utf8');
    const src = f.endsWith('.threat') ? text : E.tmFirstBlock(text);
    if (src === null) continue;
    const raw = E.tmEditParse(src);
    for (const e of raw.elements) {
      const ref = { type: 'element', id: e.id };
      const added = builds(E.tmSetAttr(src, ref, 'zzz_test', 'x'));
      assert.equal(E.tmSetAttr(added, ref, 'zzz_test', null), src, `${f}: ${e.id}`);
      n++;
    }
    raw.flows.forEach((fl, i) => {
      const ref = { type: 'flow', n: i + 1 };
      assert.equal(E.tmSetAttr(builds(E.tmSetAttr(src, ref, 'zzz_test', 1)), ref, 'zzz_test', null), src, `${f}: flow ${i + 1}`);
      n++;
    });
    raw.threats.forEach((t, i) => {
      const ref = t.id ? { type: 'threat', id: t.id } : { type: 'threat', index: i };
      assert.equal(E.tmEditThreat(src, ref, { title: t.title }), src, `${f}: ${t.id}`);
      n++;
    });
  }
  assert.ok(n > 50);
});
