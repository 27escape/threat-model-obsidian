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
  assert.match(tmDataflow(m), /e\d+ -\.->\|"\(2\) Calls/);
  assert.match(tmDataflow(m), /e\d+ -->\|"\(1\) Signs in/);
  assert.match(tmStructure(m, 'container'), /-\.->\|"Calls \[HTTP\]/);
});

test('findings in the report: their own section, a line under Needs action, and a property', () => {
  const { model: m } = tmBuildModel(SRC);
  const r = tmReport(m, [], { properties: true, date: '2027-01-05' });
  assert.match(r, /\nfindings: 5\n/);
  assert.match(r, /- 5 findings from the model to look at/);
  assert.match(r, /## Findings from the model\n\n[^\n]*\n\n- \*\*High\*\* — \(2\) Web → API carries Session without encryption, across a zone boundary\n/);
});
