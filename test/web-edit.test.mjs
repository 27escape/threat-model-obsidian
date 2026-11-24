// The web app's edits to elements, zones, flows and controls (src/edit/item-edits.js), and the forms' starting values
// (src/edit/item-forms.js): only what changed is written, and a form saved unchanged changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from './load.mjs';

const W = load(
  ['tmBuildModel', 'tmFirstBlock', 'tmEditParse', 'twEditElement', 'twEditZone', 'twEditFlow', 'twEditControl', 'twAddControl', 'twDeleteControl', 'twNextId', 'twElementSpec', 'twZoneSpec', 'twFlowSpec', 'twControlSpec', 'twFromYesNo']
);

const SRC = `zone web "Web" { trust = "untrusted" }
zone dc "Data centre"

person user "User" { zone = web }
container api "API" {
  technology = "Node.js"
  zone = dc
}
store db "DB" #pii

user -> api "Calls" { protocol = "HTTPS"  data = ["Password #secret"] }
api -> db "Reads"

threat T01 "Stuffing" #S { controls = [C01, C02] }
threat T02 "Leak" #I
control C01 "Rate limit" #implemented { covers = [T02] }
control C02 "MFA" {
  owner = "Identity"
}
`;
const swap = (text, ...pairs) =>
  pairs.reduce((t, [a, b]) => {
    assert.ok(t.includes(a), `"${a}" is in the text`);
    return t.replace(a, b);
  }, text);
const builds = (text) => {
  assert.deepEqual(W.tmBuildModel(text).errors, [], text);
  return text;
};

test('web edits: an element’s fields, written only where they changed', () => {
  assert.equal(W.twEditElement(SRC, 'api', { title: 'API', technology: 'Node.js', zone: 'dc', description: '', icon: '', link: '' }), SRC);
  assert.equal(builds(W.twEditElement(SRC, 'api', { technology: 'Go', zone: 'web' })), swap(SRC, ['"Node.js"', '"Go"'], ['zone = dc\n}', 'zone = web\n}']));
  assert.equal(builds(W.twEditElement(SRC, 'api', { zone: '' })), swap(SRC, ['  zone = dc\n}', '}']));
  assert.equal(builds(W.twEditElement(SRC, 'db', { title: 'Orders', description: 'All the orders' })), swap(SRC, ['store db "DB" #pii', 'store db "Orders" #pii { description = "All the orders" }']));
  assert.equal(W.twEditElement(SRC, 'db', { title: '  ' }), SRC); // an empty name keeps the old one
});

test('web edits: a zone and a flow', () => {
  assert.equal(builds(W.twEditZone(SRC, 'dc', { trust: 'trusted' })), swap(SRC, ['zone dc "Data centre"', 'zone dc "Data centre" { trust = "trusted" }']));
  assert.equal(W.twEditZone(SRC, 'web', { title: 'Web', trust: 'untrusted', description: '' }), SRC);
  assert.equal(W.twEditFlow(SRC, 1, { label: 'Calls', protocol: 'HTTPS', encrypted: null, authenticated: null, data: ['Password #secret'], description: '' }), SRC);
  assert.equal(builds(W.twEditFlow(SRC, 1, { authenticated: false })), swap(SRC, ['data = ["Password #secret"] }', 'data = ["Password #secret"]  authenticated = false }']));
  assert.equal(builds(W.twEditFlow(SRC, 1, { data: ['Password #secret', 'Name #pii'] })), swap(SRC, ['["Password #secret"]', '["Password #secret", "Name #pii"]']));
  assert.equal(builds(W.twEditFlow(SRC, 2, { protocol: 'SQL', data: ['Rows'] })), swap(SRC, ['api -> db "Reads"\n', 'api -> db "Reads" { protocol = "SQL"  data = ["Rows"] }\n']));
  assert.match(W.twEditFlow(SRC, 2, { protocol: 'SQL' }), /api -> db "Reads" \{ protocol = "SQL" \}/);
  assert.equal(W.twFromYesNo('true'), true);
  assert.equal(W.twFromYesNo(''), null);
});

test('web edits: controls, their status as written, new ones and deleting one', () => {
  assert.equal(W.twEditControl(SRC, 'C01', { title: 'Rate limit', status: 'implemented', covers: ['T02'], owner: '', due: '', description: '' }), SRC);
  assert.equal(W.twEditControl(SRC, 'C01', { status: 'verified' }), swap(SRC, ['#implemented', '#verified']));
  assert.equal(builds(W.twEditControl(SRC, 'C02', { status: 'implemented', due: '2027-01-31' })), swap(SRC, ['  owner = "Identity"\n}', '  owner = "Identity"\n  status = "implemented"\n  due = "2027-01-31"\n}']));
  assert.equal(W.twEditControl(SRC, 'C02', { status: 'planned' }), SRC);
  assert.equal(builds(W.twEditControl(SRC, 'C01', { covers: ['T01', 'T02'] })), swap(SRC, ['covers = [T02]', 'covers = [T01, T02]']));
  assert.throws(() => W.twEditControl(SRC, 'C01', { title: '' }), /needs a title/);
  const added = W.twAddControl(SRC, { title: 'WAF', status: 'planned', covers: ['T01'], owner: 'Ops', due: '', description: '' });
  assert.equal(added.id, 'C03');
  assert.ok(builds(added.text).endsWith('\n\ncontrol C03 "WAF" {\n  covers = [T01]\n  owner = "Ops"\n}\n'));
  assert.equal(W.twNextId(['SEC-9', 'SEC-10'], 'C'), 'SEC-11');
  assert.equal(W.twNextId([], 'C'), 'C01');
  // deleting C01 also takes it out of T01's controls
  assert.equal(builds(W.twDeleteControl(SRC, 'C01')), swap(SRC, ['controls = [C01, C02]', 'controls = [C02]'], ['control C01 "Rate limit" #implemented { covers = [T02] }\n', '']));
});

test('web edits: every form of every sample model, saved as it opens, changes nothing', () => {
  const dir = new URL('../sample vault/Examples/', import.meta.url);
  let n = 0;
  const values = (spec) => Object.fromEntries(spec.map((f) => [f.key, f.type === 'lines' || f.type === 'checks' ? f.value || [] : f.value || '']));
  for (const f of fs.readdirSync(dir).filter((x) => /\.(md|threat)$/.test(x))) {
    const text = fs.readFileSync(new URL(f, dir), 'utf8');
    const src = f.endsWith('.threat') ? text : W.tmFirstBlock(text);
    if (src === null) continue;
    const raw = W.tmEditParse(src);
    const model = W.tmBuildModel(src).model;
    for (const e of raw.elements) {
      assert.equal(W.twEditElement(src, e.id, values(W.twElementSpec(e, model))), src, `${f}: ${e.id}`);
      n++;
    }
    for (const z of raw.zones) {
      assert.equal(W.twEditZone(src, z.id, values(W.twZoneSpec(z))), src, `${f}: zone ${z.id}`);
      n++;
    }
    raw.flows.forEach((fl, i) => {
      const v = values(W.twFlowSpec(fl));
      assert.equal(W.twEditFlow(src, i + 1, { ...v, encrypted: W.twFromYesNo(v.encrypted), authenticated: W.twFromYesNo(v.authenticated) }), src, `${f}: flow ${i + 1}`);
      n++;
    });
    for (const c of raw.controls) {
      assert.equal(W.twEditControl(src, c.id, values(W.twControlSpec(c, model))), src, `${f}: ${c.id}`);
      n++;
    }
  }
  assert.ok(n > 60);
});

const R = load(['tmBuildModel', 'tmFirstBlock', 'tmEditParse', 'twEditThreat', 'twAddThreat', 'twSetRating', 'twAddZone', 'twDeleteZone', 'twIdFrom', 'tmThreatFields']);
const RATED = `zone web "Web"
person u "U" { zone = web }
container a "A"
u -> a "Calls"
threat T1 "One" #S #high
threat T2 "Two" #T {
  likelihood = 3
  impact = 4
}
threat T3 "Three" #I { cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N" }
`;
const CV = 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N';

test('web edits: a threat rated one way, switching takes the old rating away', () => {
  const t = (id) => ({ type: 'threat', id });
  // the same rating again changes nothing
  assert.equal(R.twSetRating(RATED, t('T1'), { method: 'tag', risk: 'high' }), RATED);
  assert.equal(R.twSetRating(RATED, t('T3'), { method: 'cvss', cvss: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N' }), RATED);
  // a tag to another tag, and to a CVSS vector
  assert.equal(R.twSetRating(RATED, t('T1'), { method: 'tag', risk: 'low' }), RATED.replace('#S #high', '#S #low'));
  assert.equal(builds(R.twSetRating(RATED, t('T1'), { method: 'cvss', cvss: CV })), RATED.replace('threat T1 "One" #S #high', `threat T1 "One" #S { cvss = "${CV}" }`));
  // likelihood × impact to a tag, and to CVSS: the old rating goes, block and all
  assert.equal(builds(R.twSetRating(RATED, t('T2'), { method: 'tag', risk: 'medium' })), RATED.replace('threat T2 "Two" #T {\n  likelihood = 3\n  impact = 4\n}', 'threat T2 "Two" #T #medium'));
  assert.equal(R.twSetRating(RATED, t('T2'), { method: 'cvss', cvss: CV }), RATED.replace('  likelihood = 3\n  impact = 4\n', `  cvss = "${CV}"\n`));
  // CVSS to likelihood × impact, through the whole form
  const li = builds(R.twEditThreat(RATED, t('T3'), { method: 'li', likelihood: 2, impact: 5 }));
  assert.equal(li, RATED.replace(`threat T3 "Three" #I { cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N" }`, 'threat T3 "Three" #I {\n  likelihood = 2\n  impact = 5\n}'));
  assert.deepEqual(R.tmBuildModel(li).warnings, []);
  assert.throws(() => R.twSetRating(RATED, t('T1'), { method: 'cvss', cvss: 'CVSS:4.0/AV:N' }), /not supported/);
  // a new threat rated by CVSS
  const added = R.twAddThreat(RATED, { type: 'element', id: 'a' }, { title: 'Old library', stride: ['E'], method: 'cvss', cvss: CV });
  assert.equal(added.id, 'T4');
  assert.match(builds(added.text), /container a "A" \{ threat T4 "Old library" #E \{ cvss = "CVSS:3\.1\/AV:N\/AC:H/);
});

test('web edits: zones added beside the others, with an ID made from the name, and deleted only when empty', () => {
  const z = R.twAddZone(RATED, { title: 'Partner network', trust: 'restricted' });
  assert.equal(z.id, 'partner_network');
  assert.equal(builds(z.text), RATED.replace('zone web "Web"\n', 'zone web "Web"\nzone partner_network "Partner network" { trust = "restricted" }\n'));
  assert.equal(R.twAddZone('person p "P"\n', { title: 'DMZ' }).text, 'zone dmz "DMZ"\n\nperson p "P"\n');
  assert.equal(R.twAddZone(RATED, { title: 'Web' }).id, 'web2');
  assert.throws(() => R.twAddZone(RATED, { title: 'X', id: 'u' }), /already used/);
  assert.throws(() => R.twAddZone(RATED, { title: 'X', id: '1x' }), /can't be an ID/);
  assert.throws(() => R.twAddZone(RATED, { title: ' ' }), /needs a name/);
  assert.equal(R.twIdFrom(R.tmEditParse(RATED), 'Zone', 'z'), 'zone_zone');
  assert.throws(() => R.twDeleteZone(RATED, 'web'), /another zone first: U/);
  assert.throws(() => R.twDeleteZone('zone z "Z" {\n  person p\n}\n', 'z'), /out first: p/);
  assert.equal(builds(R.twDeleteZone(z.text, 'partner_network')), RATED);
});

test('web edits: every threat’s form, saved as it opens, rated as it was, changes nothing', () => {
  const dir = new URL('../sample vault/Examples/', import.meta.url);
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /\.(md|threat)$/.test(x))) {
    const text = fs.readFileSync(new URL(f, dir), 'utf8');
    const src = f.endsWith('.threat') ? text : R.tmFirstBlock(text);
    if (src === null) continue;
    R.tmEditParse(src).threats.forEach((t, index) => {
      const v = R.tmThreatFields(t);
      const method = v.cvss ? 'cvss' : v.riskTag && !v.likelihood && !v.impact ? 'tag' : 'li';
      const fields = { ...v, method, risk: v.riskTag || 'medium' };
      if (method !== 'li') for (const k of ['likelihood', 'impact', 'residual_likelihood', 'residual_impact']) fields[k] = null;
      const ref = t.id ? { type: 'threat', id: t.id } : { type: 'threat', index };
      assert.equal(R.twEditThreat(src, ref, fields), src, `${f}: ${t.id}`);
      n++;
    });
  }
  assert.ok(n > 20);
});
