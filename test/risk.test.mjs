import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmBuildModel, tmReport, tmRegisterIndex } = load(['tmBuildModel', 'tmReport', 'tmRegisterIndex']);

const SRC = `
container web "Web"
container api "API"
web -> api "Calls" {
  threat T01 "Token replayed" #S {
    likelihood = 4
    impact = 5
    residual_likelihood = 2
  }
  threat T02 "Request tampered" #T { likelihood = "possible"  impact = "minor" }
}
threat T03 "Logs altered" #R #critical { residual = "low" }
threat T04 "A known flaw" #I { cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N" }
threat T05 "Closed" #D { likelihood = 5  impact = 5  status = "mitigated" }
`;

test('likelihood × impact gives the risk; so do a risk tag and a CVSS vector', () => {
  const { model: m, errors, warnings } = tmBuildModel(SRC);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const t = Object.fromEntries(m.threats.map((x) => [x.id, x]));
  assert.equal(t.T01.rating, 20);
  assert.equal(t.T01.risk, 'critical'); // 4 × 5 = 20
  assert.equal(t.T02.likelihood, 3); // "possible"
  assert.equal(t.T02.impact, 2); // "minor"
  assert.equal(t.T02.risk, 'medium'); // 6
  assert.equal(t.T03.risk, 'critical'); // the tag
  assert.equal(t.T03.method, 'tag');
  assert.equal(t.T04.risk, 'high'); // CVSS 7.5
  assert.equal(t.T04.method, 'cvss');
  assert.equal(t.T04.rating, null);
});

test('residual risk: from a residual likelihood or impact (the other taken from the threat), or a word', () => {
  const { model: m } = tmBuildModel(SRC);
  const t = Object.fromEntries(m.threats.map((x) => [x.id, x]));
  assert.equal(t.T01.residualLikelihood, 2);
  assert.equal(t.T01.residualImpact, 5); // the threat's own impact
  assert.equal(t.T01.residualRating, 10);
  assert.equal(t.T01.residual, 'high');
  assert.equal(t.T03.residual, 'low');
  assert.equal(t.T03.residualRating, null);
  assert.equal(t.T02.residual, '');
});

test('likelihood and impact: mistakes are warnings', () => {
  const said = (src) => tmBuildModel(src).warnings.map((w) => w.message).join('\n');
  assert.match(said('threat T1 "A" #S { likelihood = 6  impact = 2 }'), /likelihood = "6" should be 1 to 5 or one of rare, unlikely/);
  assert.match(said('threat T1 "A" #S { impact = "huge"  likelihood = 2 }'), /impact = "huge" should be 1 to 5 or one of negligible/);
  assert.match(said('threat T1 "A" #S { likelihood = 3 }'), /impact is needed too/);
  assert.match(said('threat T1 "A" #S { residual_impact = 2 }'), /a residual likelihood or impact needs the other/);
  assert.match(said('threat T1 "A" #S { residual = "gone" }'), /residual = "gone" should be one of critical, high, medium, low/);
});

test('the report: residual risk in the register and summary, and the risk matrix before and after controls', () => {
  const { model: m } = tmBuildModel(SRC);
  const r = tmReport(m, []);
  assert.match(r, /\*\*T01\*\* <span[^\n]*> Critical → High after controls · 4 × 5 = 20 · Open — Token replayed \^t01/);
  assert.match(r, /\*\*4 open threats\*\* \(2 critical, 1 high, 1 medium\); once their controls are in place: 2 high, 1 medium, 1 low\./);
  assert.match(r, /## Risk matrix\n\nOpen threats by likelihood and impact[^\n]*2 open threats have no likelihood/);
  // row 4 (likely), column 5 (severe): T01, in a critical cell; the mitigated T05 isn't placed
  assert.match(r, /### As assessed\n\n\| Likelihood \\ Impact \| 1 Negligible[^\n]*\n[^\n]*\n\| 5 Almost certain \|( <span class="tm-cell tm-cell-\w+">&nbsp;<\/span> \|){5}\n\| 4 Likely \|[^\n]*<span class="tm-cell tm-cell-critical">\[\[#\^t01\\\|T01\]\]<\/span> \|\n/);
  assert.match(r, /\| 3 Possible \| [^\n]*<span class="tm-cell tm-cell-medium">\[\[#\^t02\\\|T02\]\]<\/span>/);
  assert.match(r, /### After controls\n\n[^\n]*\n\n[^\n]*\n[^\n]*\n(\|[^\n]*\n){3}\| 2 Unlikely \|[^\n]*<span class="tm-cell tm-cell-high">\[\[#\^t01\\\|T01\]\]<\/span> \|\n/);
  // a CVSS-rated threat shows its score and its vector
  assert.ok(
    r.includes(
      '- **T04** <span class="tm-chip tm-chip-I">I</span> High · CVSS 7.5 · Open — A known flaw ^t04\n' +
        '    - Applies to: Whole model\n' +
        '    - CVSS: A CVSS base score of 7.5 out of 10 is high severity on CVSS\'s scale (7.0 to 8.9). It rates how severe the vulnerability is in itself, from how it can be attacked and what an attack would do; it isn\'t the risk in your setting.\n' +
        '    - How it is attacked and what it does: Attack vector: network · Attack complexity: low · Privileges required: none · User interaction: none · Scope: unchanged · Confidentiality: high · Integrity: none · Availability: none\n' +
        '    - Vector: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` ([see it in FIRST\u2019s CVSS calculator](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N))\n'
    )
  );
  // the register is still read back by the risk as assessed
  assert.equal(tmRegisterIndex(r).get('T01').cls, 'tm-tid-critical');
});

test('how a threat is rated, shown short (diagrams), in full (tables) and spelt out (tooltips)', () => {
  const { tmRatingShort, tmRatingText, tmRatingTip } = load(['tmRatingShort', 'tmRatingText', 'tmRatingTip']);
  const { model: m } = tmBuildModel(SRC);
  const t = Object.fromEntries(m.threats.map((x) => [x.id, x]));
  assert.deepEqual([tmRatingShort(t.T01), tmRatingText(t.T01)], ['4×5', '4 × 5 = 20']);
  assert.equal(tmRatingTip(t.T01), 'Likelihood 4 (likely) × impact 5 (severe) = 20: critical\nAfter controls: likelihood 2 × impact 5 = 10: high');
  assert.deepEqual([tmRatingShort(t.T04), tmRatingText(t.T04)], ['7.5', 'CVSS 7.5']);
  assert.equal(
    tmRatingTip(t.T04),
    "A CVSS base score of 7.5 out of 10 is high severity on CVSS's scale (7.0 to 8.9). It rates how severe the vulnerability is in itself, from how it can be attacked and what an attack would do; it isn't the risk in your setting.\nHow it is attacked and what it does: Attack vector: network · Attack complexity: low · Privileges required: none · User interaction: none · Scope: unchanged · Confidentiality: high · Integrity: none · Availability: none"
  );
  assert.deepEqual([tmRatingShort(t.T03), tmRatingText(t.T03)], ['', '']); // a tag says it all
  assert.equal(tmRatingTip(t.T03), 'Rated #critical\nAfter controls: low');
});

test('a CVSS vector in words, and a link to FIRST\u2019s calculator with it filled in', () => {
  const { tmCvssExplain, tmCvssLink } = load(['tmCvssExplain', 'tmCvssLink']);
  assert.equal(tmCvssExplain('CVSS:3.0/AV:P/AC:H/PR:H/UI:R/S:C/C:N/I:L/A:H/E:P'), 'Attack vector: physical · Attack complexity: high · Privileges required: high · User interaction: required · Scope: changed · Confidentiality: none · Integrity: low · Availability: high');
  assert.equal(tmCvssLink('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), 'https://www.first.org/cvss/calculator/3.0#CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  assert.equal(tmCvssExplain('CVSS:4.0/AV:N'), '');
  assert.equal(tmCvssLink('not a vector'), '');
  const { tmCvssMeaning } = load(['tmCvssMeaning']);
  assert.match(tmCvssMeaning(9.8), /9\.8 out of 10 is critical severity on CVSS's scale \(9\.0 to 10\.0\)/);
  assert.match(tmCvssMeaning(0), /is none severity/);
  assert.match(tmCvssMeaning(3.9), /is low severity on CVSS's scale \(0\.1 to 3\.9\)/);
});
