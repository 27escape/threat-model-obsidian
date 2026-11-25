import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmBuildModel, tmReport, tmStructure, tmDataflow, tmFlowEncrypted } = load(['tmBuildModel', 'tmReport', 'tmStructure', 'tmDataflow', 'tmFlowEncrypted']);

const SRC = `
zone net "Internet" { trust = "untrusted" }
zone core "Core" { trust = "trusted" }
person user "User" { zone = net }
container web "Web" { zone = net }
container api "API" { zone = core }
store db "DB" { zone = core }
store drop "Upload store" { zone = core }

user -> web "Signs in" { protocol = "HTTPS"  data = ["Password #secret"] }
web -> api "Calls" { protocol = "HTTP"  data = ["Session #secret"] }
web -> drop "Uploads" { data = ["File #pii"]  authenticated = false }
api -> db "Writes" { encrypted = false  data = ["Card #secret"] }
api -> db "Reads" { protocol = "JDBC" }
`;

test('encryption: stated, or worked out from the protocol, or not known', () => {
  assert.equal(tmFlowEncrypted(null, 'HTTPS'), true);
  assert.equal(tmFlowEncrypted(null, 'JSON/HTTPS'), true);
  assert.equal(tmFlowEncrypted(null, 'RESP over TLS'), true);
  assert.equal(tmFlowEncrypted(null, 'OIDC'), true);
  assert.equal(tmFlowEncrypted(null, 'HTTP'), false);
  assert.equal(tmFlowEncrypted(null, 'ftp'), false);
  assert.equal(tmFlowEncrypted(null, 'JDBC'), null);
  assert.equal(tmFlowEncrypted(null, ''), null);
  assert.equal(tmFlowEncrypted(false, 'HTTPS'), false); // what the model says wins
  const { warnings } = tmBuildModel('container a\ncontainer b\na -> b { encrypted = "maybe" }');
  assert.match(warnings[0].message, /encrypted = "maybe" should be true or false/);
});

test('findings: sensitive data in the clear, not known to be encrypted, unauthenticated, untrusted writes', () => {
  const { model: m, errors } = tmBuildModel(SRC);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    m.findings.map((f) => [f.rule, f.risk, f.flow]),
    [
      ['plain-sensitive', 'high', 2], // HTTP, across a boundary
      ['unauthenticated', 'high', 3], // authenticated = false, across a boundary
      ['untrusted-store', 'medium', 3], // straight from the untrusted zone into a store
      ['plain-sensitive', 'medium', 4], // encrypted = false, inside one zone
      ['unknown-sensitive', 'low', 3], // #pii across a boundary, no protocol
    ]
  );
  assert.match(m.findings[0].message, /^\(2\) Web → API carries Session without encryption, across a zone boundary$/);
  // nothing for an HTTPS flow, or for a flow with nothing sensitive
  assert.ok(!m.findings.some((f) => f.flow === 1 || f.flow === 5));
});

test('unencrypted flows are dashed in the Structure and Data flow views', () => {
  const { model: m } = tmBuildModel(SRC);
  assert.match(tmDataflow(m), /e\d+ tmnone2@-\.->\|"\(2\) Calls/);
  assert.match(tmDataflow(m), /e\d+ tmnone1@-->\|"\(1\) Signs in/);
  assert.match(tmStructure(m, 'container'), /-\.->\|"Calls \[HTTP\]/);
});

test('findings in the report: their own section, a line under Needs action, and a property', () => {
  const { model: m } = tmBuildModel(SRC);
  const r = tmReport(m, [], { properties: true, date: '2027-01-05' });
  assert.match(r, /\nfindings: 5\n/);
  assert.match(r, /- 5 findings from the model to look at/);
  assert.match(r, /## Findings from the model\n\n[^\n]*\n\n- \*\*High\*\* — \(2\) Web → API carries Session without encryption, across a zone boundary\n/);
});

test('nested zones: a crossing between zones inside another is rated a step lower, says which zone it stays inside, and the report lists those last', () => {
  const { model, errors } = tmBuildModel(`
zone internet "Internet" { trust = "untrusted" }
zone aws "AWS (private)" {
  zone west1 "us-west-1" {
    container api "API"
    store db1 "Orders"
  }
  zone west2 "us-west-2" {
    store db2 "Orders replica"
  }
}
person user "Customer" { zone = internet }
container ops "Ops box" { zone = aws }

user -> api "Orders" { encrypted = false  data = ["Card #secret"] }
db1 -> db2 "Replicates" { encrypted = false  data = ["Orders #pii"] }
api -> db1 "Saves" { encrypted = false  data = ["Orders #pii"] }
ops -> db2 "Checks" { authenticated = false }
db2 -> user "Leaks" { authenticated = false }
`);
  assert.deepEqual(errors, []);
  const flows = model.flows.map((f) => [f.n, f.crosses, f.crossing && f.crossing.within]);
  assert.deepEqual(flows, [
    [1, true, null], // into AWS from the internet: out of and into zones altogether
    [2, true, 'aws'], // between the regions, inside AWS
    [3, false, null], // inside us-west-1
    [4, true, 'aws'], // from AWS itself into one of its regions: still inside AWS
    [5, true, null],
  ]);
  const found = Object.fromEntries(model.findings.map((f) => [`${f.rule} ${f.flow}`, [f.risk, f.message]]));
  assert.deepEqual(found['plain-sensitive 1'], ['high', '(1) Customer → API carries Card without encryption, across a zone boundary']);
  assert.deepEqual(found['plain-sensitive 2'], ['medium', '(2) Orders → Orders replica carries Orders without encryption, between zones inside AWS (private)']);
  assert.deepEqual(found['plain-sensitive 3'], ['medium', '(3) API → Orders carries Orders without encryption']);
  assert.deepEqual(found['unauthenticated 4'], ['medium', '(4) Ops box → Orders replica isn’t authenticated, and crosses between zones inside AWS (private)'.replace('’', "'")]);
  assert.deepEqual(found['unauthenticated 5'], ['high', "(5) Orders replica → Customer isn't authenticated, and crosses a zone boundary"]);
  const r = tmReport(model);
  assert.match(r, /4 cross a zone boundary, 2 of them only between zones inside another/);
  const table = r.slice(r.indexOf('## Flows across zone boundaries'));
  assert.match(table, /\| # \| From \| To \| Flow \| Protocol \| Sensitive data \| Stays inside \|/);
  const rows = table.split('\n').filter((l) => /^\| \d/.test(l)).map((l) => l.split(' | ')[0].slice(2) + ':' + l.split(' | ').pop().replace(/ \|$/, ''));
  assert.deepEqual(rows, ['1:—', '5:—', '2:AWS (private)', '4:AWS (private)']);
});

test('flat zones: every crossing is out of or into a zone, rated and reported as before (no Stays inside column)', () => {
  const { model } = tmBuildModel(SRC);
  assert.ok(model.flows.filter((f) => f.crosses).every((f) => f.crossing.within === null));
  assert.doesNotMatch(tmReport(model), /Stays inside|of them only between/);
});
