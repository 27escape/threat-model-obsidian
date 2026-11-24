// The web app's new elements, flows and scenarios (src/edit/add-edits.js), its undo history (src/edit/history.js),
// the earlier versions kept by the store (src/web/store.js) and the threat register as CSV (src/web/export.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from './load.mjs';

const W = load(
  ['tmBuildModel', 'tmEditParse', 'twAddElement', 'twAddFlow', 'twAddScenario', 'twEditScenario', 'twDeleteScenario', 'twRegisterCsv', 'TwHistory'],
  ['src/web/export.js']
);
const builds = (text) => {
  assert.deepEqual(W.tmBuildModel(text).errors, [], text);
  return text;
};

const SRC = `title = "Shop"

zone web "Web" { trust = "untrusted" }

person user "User" { zone = web }
system shop "Shop" {
  container api "API"
}

user -> api "Calls" { protocol = "HTTPS" }

threat T01 "Stuffing" #S { applies_to = [api] }
`;

test('web add: an element goes after the other top-level elements, or inside its parent, with an ID from its name', () => {
  const a = W.twAddElement(SRC, { kind: 'store', title: 'Orders DB', technology: 'PostgreSQL' });
  assert.equal(a.id, 'orders_db');
  builds(a.text);
  assert.ok(a.text.includes('container api "API"\n}\nstore orders_db "Orders DB" { technology = "PostgreSQL" }\n\nuser -> api'), a.text);

  const b = W.twAddElement(SRC, { kind: 'store', title: 'Cache', parent: 'api', zone: 'web', description: 'Sessions' });
  builds(b.text);
  assert.ok(/container api "API" \{\n\s+store cache "Cache" \{ zone = web {2}description = "Sessions" \}\n\s*\}/.test(b.text), b.text);

  // three attributes or more: a block, one to a line
  const c = W.twAddElement(SRC, { kind: 'container', title: 'Web', parent: 'shop', technology: 'React', zone: 'web', description: 'The front end' });
  builds(c.text);
  assert.equal(c.id, 'web2', 'web is a zone already');
  assert.ok(c.text.includes('container web2 "Web" {\n    technology = "React"\n    zone = web\n    description = "The front end"\n  }'), c.text);

  assert.throws(() => W.twAddElement(SRC, { kind: 'system', title: 'X', parent: 'api' }), /can't go inside a container/);
  assert.throws(() => W.twAddElement(SRC, { kind: 'store', title: 'X', id: 'api' }), /already used/);
  assert.throws(() => W.twAddElement(SRC, { kind: 'store', title: 'X', id: 'threat' }), /keyword/);
  assert.throws(() => W.twAddElement(SRC, { kind: 'store', title: ' ' }), /name/);
});

test('web add: a flow goes after the other flows and gets the next number; a model with none gets its first', () => {
  const a = W.twAddFlow(SRC, { from: 'api', to: 'user', label: 'Replies', protocol: 'HTTPS', encrypted: true, data: ['Order #pii'] });
  builds(a.text);
  assert.equal(a.n, 2);
  assert.ok(a.text.includes('user -> api "Calls" { protocol = "HTTPS" }\napi -> user "Replies" {\n  protocol = "HTTPS"\n  encrypted = true\n  data = ["Order #pii"]\n}\n\nthreat'), a.text);
  const none = 'person a "A"\nsystem b "B"\n\nthreat T01 "X" #S\n';
  const b = W.twAddFlow(none, { from: 'a', to: 'b' });
  builds(b.text);
  assert.equal(b.n, 1);
  assert.ok(b.text.includes('a -> b\n\nthreat T01'), b.text);
  assert.throws(() => W.twAddFlow(SRC, { from: 'api', to: 'api' }), /one element to another/);
  assert.throws(() => W.twAddFlow(SRC, { from: 'api', to: 'nowhere' }), /no nowhere/);
});

test('web add: a scenario is added at the end, its steps rewritten, renamed and deleted', () => {
  const steps = [{ from: 'user', to: 'api', label: null }];
  const a = W.twAddScenario(SRC, { title: 'Signs in', steps });
  builds(a.text);
  assert.equal(a.id, 'signs_in');
  assert.ok(a.text.endsWith('scenario signs_in "Signs in" {\n  user -> api\n}\n'), a.text);
  assert.equal(W.twEditScenario(a.text, 'signs_in', { title: 'Signs in', steps }), a.text, 'unchanged');
  const flows = W.twAddFlow(a.text, { from: 'api', to: 'user', label: 'Replies' }).text;
  const b = builds(W.twEditScenario(flows, 'signs_in', { title: 'Logs in', steps: [...steps, { from: 'api', to: 'user', label: 'Replies' }] }));
  assert.ok(b.includes('scenario signs_in "Logs in" {\n  user -> api\n  api -> user "Replies"\n}'), b);
  const model = W.tmBuildModel(b).model;
  assert.deepEqual(model.scenarios[0].steps.map((s) => s.flow), [1, 2]);
  assert.throws(() => W.twEditScenario(b, 'signs_in', { title: 'X', steps: [] }), /at least one step/);
  assert.equal(builds(W.twDeleteScenario(b, 'signs_in')).includes('scenario'), false);
  assert.throws(() => W.twAddScenario(SRC, { title: 'X', steps: [] }), /at least one step/);
});

test('web history: undo and redo, typing grouped into bursts, a new change clears what could be redone', () => {
  const h = new W.TwHistory();
  assert.equal(h.undo('a'), null);
  h.record('a');
  h.record('a'); // the same text twice is kept once
  h.record('b');
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.undo('b'), 'a');
  assert.equal(h.canUndo(), false);
  assert.equal(h.redo('a'), 'b');
  assert.equal(h.redo('b'), 'c');
  assert.equal(h.canRedo(), false);
  h.undo('c');
  h.record('x');
  assert.equal(h.canRedo(), false, 'a change after undoing ends redo');
  // a burst of typing is one step back
  const t = new W.TwHistory();
  t.typed('');
  t.typed('h');
  t.typed('he');
  assert.equal(t.undo('hey'), '');
  assert.equal(t.canUndo(), false);
  t.clear();
});

test('web store: what is saved over is kept as an earlier version, at most one every ten minutes, ten at most', () => {
  const code = fs.readFileSync(new URL('../src/web/store.js', import.meta.url), 'utf8');
  let now = Date.parse('2026-11-01T09:00:00Z');
  class FakeDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
  }
  FakeDate.parse = Date.parse;
  const TwStore = vm.runInNewContext(`${code};TwStore`, { JSON, Date: FakeDate, Object, String });
  const m = new Map();
  const s = new TwStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  s.save('M', 'one');
  assert.equal(s.versions('M').length, 0);
  now += 60e3;
  s.save('M', 'two');
  assert.deepEqual(Array.from(s.versions('M'), (v) => v.text), ['one']);
  now += 60e3;
  s.save('M', 'three'); // within ten minutes of the last version
  assert.deepEqual(Array.from(s.versions('M'), (v) => v.text), ['one']);
  now += 11 * 60e3;
  s.save('M', 'four');
  assert.deepEqual(Array.from(s.versions('M'), (v) => v.text), ['three', 'one']);
  s.keepVersion('M');
  s.keepVersion('M'); // the same text again is not kept twice
  assert.deepEqual(Array.from(s.versions('M'), (v) => v.text), ['four', 'three', 'one']);
  for (let i = 0; i < 15; i++) {
    now += 11 * 60e3;
    s.save('M', `v${i}`);
  }
  assert.equal(s.versions('M').length, 10);
});

test('web export: the threat register as CSV, with cells that a spreadsheet would run made safe', () => {
  const text = `${SRC}threat T02 "=SUM(A1)" #I #T { likelihood = 3  impact = 3  owner = "Ops, team"  description = "Checked" }\n`;
  const csv = W.twRegisterCsv(W.tmBuildModel(builds(text)).model);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'ID,Threat,STRIDE,Risk,Risk after controls,Rating,Status,Applies to,Owner,Mitigation,Controls,Description');
  assert.ok(lines[1].startsWith('T01,Stuffing,S,'), lines[1]);
  assert.ok(lines[2].startsWith(`T02,"'=SUM(A1)",TI,medium,`), lines[2]);
  assert.ok(csv.includes('"Ops, team"'), csv);
  assert.ok(csv.endsWith('\r\n'));
});
