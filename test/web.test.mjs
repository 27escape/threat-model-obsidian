// The web app's storage of the user's models (src/web/store.js), with a stand-in for the browser's localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../src/web/store.js', import.meta.url), 'utf8');
const TwStore = vm.runInNewContext(`${code};TwStore`, { JSON, Date, Object, String });

/** A localStorage stand-in; `full` makes writes of the models fail as a full store does, `off` makes every call throw. */
function storage({ full = false, off = false, start = {} } = {}) {
  const m = new Map(Object.entries(start));
  const no = () => {
    throw Object.assign(new Error('denied'), { name: 'SecurityError' });
  };
  return {
    m,
    getItem: (k) => (off ? no() : m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (off) no();
      if (full && k === 'threat-modelling:models') throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      m.set(k, String(v));
    },
    removeItem: (k) => (off ? no() : m.delete(k)),
  };
}

test('web store: saves, lists A to Z, renames and deletes models, and remembers the last one opened', () => {
  const s = new TwStore(storage());
  assert.equal(s.ok, true);
  assert.deepEqual([...s.names()], []);
  assert.equal(s.save('zebra', 'title = "Z"'), true);
  assert.equal(s.save('Apple', 'title = "A"'), true);
  assert.deepEqual([...s.names()], ['Apple', 'zebra']);
  assert.equal(s.get('Apple'), 'title = "A"');
  assert.equal(s.get('missing'), null);
  assert.equal(s.rename('Apple', 'Banana'), true);
  assert.deepEqual([...s.names()], ['Banana', 'zebra']);
  assert.equal(s.remove('zebra'), true);
  assert.deepEqual([...s.names()], ['Banana']);
  s.setLast('mine', 'Banana');
  // a fresh page reads it all back
  const again = new TwStore(s.storage);
  assert.deepEqual([...again.names()], ['Banana']);
  assert.deepEqual({ ...again.last() }, { kind: 'mine', name: 'Banana' });
});

test('web store: names must be given, short, unique (whatever the case) and safe as file names', () => {
  const s = new TwStore(storage());
  s.save('Online shop', '');
  assert.match(s.problem(''), /Give it a name/);
  assert.match(s.problem('   '), /Give it a name/);
  assert.match(s.problem('x'.repeat(81)), /under 80/);
  assert.match(s.problem('a/b'), /can.t contain/);
  assert.match(s.problem('ONLINE SHOP'), /already/);
  assert.equal(s.problem('Online shop', 'Online shop'), ''); // renaming to itself
  assert.equal(s.problem('online shop', 'Online shop'), ''); // or changing only its case
  assert.equal(s.problem('Shop 2'), '');
  assert.equal(s.free('Online shop'), 'Online shop 2');
  s.save('Online shop 2', '');
  assert.equal(s.free('Online shop'), 'Online shop 3');
  assert.equal(s.free('a/b'), 'a-b');
  assert.equal(s.free(''), 'Untitled');
});

test('web store: a full store, storage switched off, or unreadable data are reported, not thrown', () => {
  const full = new TwStore(storage({ full: true }));
  assert.equal(full.ok, true);
  assert.equal(full.save('A', 'x'), false);
  assert.match(full.error, /full/);

  const off = new TwStore(storage({ off: true }));
  assert.equal(off.ok, false);
  assert.equal(off.save('A', 'x'), false);
  assert.match(off.error, /isn.t letting the page save/);
  assert.equal(off.last(), null);
  off.setLast('mine', 'A'); // quietly does nothing

  const none = new TwStore(null);
  assert.equal(none.ok, false);
  assert.deepEqual([...none.names()], []);

  const bad = new TwStore(storage({ start: { 'threat-modelling:models': '{not json', 'threat-modelling:last': '"x"' } }));
  assert.deepEqual([...bad.names()], []);
  assert.equal(bad.last(), null);
  // an unknown future format is left alone until something is saved
  const future = new TwStore(storage({ start: { 'threat-modelling:models': '{"version":2,"models":{}}' } }));
  assert.deepEqual([...future.names()], []);
});

test('web store: layout preferences are kept, and default when missing or unreadable', () => {
  const s = new TwStore(storage());
  assert.equal(s.pref('code', true), true);
  s.setPref('code', false);
  assert.equal(new TwStore(s.storage).pref('code', true), false);
  const bad = new TwStore(storage({ start: { 'threat-modelling:ui': '{oops' } }));
  assert.equal(bad.pref('code', true), true);
  bad.setPref('code', false); // quietly does nothing
  const off = new TwStore(storage({ off: true }));
  assert.equal(off.pref('code', true), true);
  off.setPref('code', false);
});
