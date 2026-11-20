import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmBuildModel, tmReport } = load(['tmBuildModel', 'tmReport']);

const SRC = `
title = "Shop"
version = "1.2"
author = "Kevin"
owner = "Web team"
status = "in-review"
review_date = "2027-06-01"
scope = "The checkout, from the basket to the payment provider."
out_of_scope = ["The warehouse system", "Staff laptops"]
assumptions = ["The cloud account is locked down"]

zone net "Internet" { trust = "untrusted" }
container web "Web" { zone = net }
container api "API"
web -> api "Pays" {
  threat T1 "Card data skimmed" #I { likelihood = 4  impact = 5  residual_likelihood = 1  owner = "Payments" }
  threat T2 "Price tampered" #T #high
}
threat T3 "Nobody watching the logs" #R #medium
threat T4 "Old, dealt with" #D #low { status = "mitigated" }

control C1 "Hosted payment page" #implemented { covers = T1 }
control C2 "Server-side prices" { covers = T2  owner = "Web team"  due = "2026-12-01" }
control C3 "Log alerts" #verified { covers = T3 }
`;
const report = (opts = {}) => tmReport(tmBuildModel(SRC).model, [], { properties: true, date: '2027-01-05', source: 'Shop/Shop.md', ...opts });

test('the report starts with properties that Bases and Dataview can list and count', () => {
  const { errors, warnings } = tmBuildModel(SRC);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings.map((w) => w.message.slice(0, 50)), ['threat T1: all its controls are implemented or ver', 'threat T3: all its controls are implemented or ver']);
  const props = report().split('\n---\n')[0] + '\n';
  assert.equal(
    props,
    `---
tags:
  - threat-report
model: "Shop"
source: "[[Shop/Shop]]"
date: 2027-01-05
version: "1.2"
author: "Kevin"
owner: "Web team"
status: in-review
review_date: 2027-06-01
threats: 4
open_threats: 3
open_critical: 0
open_high: 1
open_medium: 2
open_low: 0
highest_risk: high
controls: 3
controls_planned: 1
controls_implemented: 1
controls_verified: 1
unaddressed: 0
overdue_controls: 1
findings: 0
`
  );
  assert.doesNotMatch(tmReport(tmBuildModel(SRC).model, []), /^---/); // only when asked for
});

test('the summary: a headline, the top risks by what is left after controls, and what needs doing', () => {
  const r = report();
  assert.match(r, /## Summary\n\n\*\*3 open threats\*\* \(1 critical, 1 high, 1 medium\); once their controls are in place: 1 high, 2 medium\.\n/);
  assert.match(r, /\*\*Top risks\*\*\n\n1\. \[\[#\^t2\|T2\]\] High — Price tampered\n2\. \[\[#\^t1\|T1\]\] Medium, Critical before controls — Card data skimmed\n3\. \[\[#\^t3\|T3\]\] Medium — Nobody watching the logs\n/);
  assert.match(r, /\*\*Needs action\*\*\n\n- 1 planned control to put in place\n- 1 of them overdue: C2\n- 1 implemented control still to verify\n/);
});

test('scope and method: what was modelled, what wasn’t, the assumptions, and how', () => {
  const r = report();
  assert.match(r, /## Scope and method\n\nThe checkout, from the basket to the payment provider\.\n\n\*\*Out of scope\*\*\n\n- The warehouse system\n- Staff laptops\n\n\*\*Assumptions\*\*\n\n- The cloud account is locked down\n\nThreats were identified with STRIDE[^\n]*Risks are rated by likelihood × impact[^\n]*Trust boundaries: Internet \(untrusted\)\.\n/);
});

test('the action plan: controls to put in place or verify, and threats with nothing, by owner', () => {
  const r = report();
  assert.match(r, /## Action plan\n\n### Payments\n\n- Verify \[\[#\^c1\|C1\]\] Hosted payment page, for \[\[#\^t1\|T1\]\]\n\n### Web team\n\n- Put in place \[\[#\^c2\|C2\]\] Server-side prices \(due 2026-12-01\) \*\*overdue\*\*, for \[\[#\^t2\|T2\]\]\n/);
  assert.doesNotMatch(r, /C3 Log alerts \(/); // verified: nothing to do
});

test('a document status that isn’t known is a warning', () => {
  const { warnings } = tmBuildModel('status = "done"');
  assert.match(warnings[0].message, /status = "done" should be one of draft, in-review, approved/);
});
