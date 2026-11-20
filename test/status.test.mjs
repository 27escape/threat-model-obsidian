import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmBuildModel, tmStructure, tmDataflow, tmSequence, tmReport, tmControlProgress, tmThreatTableMarkdown } = load([
  'tmBuildModel',
  'tmStructure',
  'tmDataflow',
  'tmSequence',
  'tmReport',
  'tmControlProgress',
  'tmThreatTableMarkdown',
]);

const SRC = `
container a "A" { threat T1 "Closed on a box" #S #critical #mitigated { mitigation = "Fixed" } }
container b "B"
a -> b "Only closed" { threat T2 "Accepted" #T #high { status = "accepted" } }
b -> a "Mixed" {
  threat T3 "Still open" #I #low { controls = [C1, C2] }
  threat T4 "Transferred" #D #critical { status = "transferred" }
}
control C1 "One" #implemented { covers = T3 }
control C2 "Two" { covers = T3 }
`;
const m = tmBuildModel(SRC).model;

test('closed threats colour nothing: a box or arrow takes its colour from open threats only', () => {
  const s = tmStructure(m, 'container');
  assert.doesNotMatch(s, /class e1 tmRisk/); // a: only a mitigated threat
  assert.doesNotMatch(s, /tmhighs\d+@/); // a -> b: only an accepted one
  assert.match(s, /e2 tmlows\d+@-->/); // b -> a: the open low one, not the transferred critical one
  const d = tmDataflow(m);
  assert.match(d, /tmlow2@/);
  assert.doesNotMatch(d, /tmhigh1@|tmcritical/);
  assert.match(tmSequence(m, ''), /rect rgba\(128,128,128,0\.10\)\n {4}Note over [^\n]*T2/); // a closed note is untinted
});

test('an open threat’s control progress', () => {
  const t = Object.fromEntries(m.threats.map((x) => [x.id, x]));
  assert.equal(tmControlProgress(m, t.T3), '1 of 2 controls in place');
  assert.equal(tmControlProgress(m, t.T1), ''); // closed
  assert.match(tmThreatTableMarkdown([t.T3], m).join('\n'), /\| Open · 1 of 2 controls in place \|/);
  const one = tmBuildModel('threat T1 "x" #S\ncontrol C1 "y" { covers = T1 }').model;
  assert.equal(tmControlProgress(one, one.threats[0]), 'its control is planned');
});

test('the register lists open threats in full, then closed ones briefly', () => {
  const r = tmReport(m, []);
  assert.match(r, /## Threat register\n\n### Open\n\n- \*\*T3\*\*[^\n]*\n {4}- Applies to: \(2\) B → A\n/);
  assert.match(r, /### Closed\n\nMitigated, accepted or transferred: how each was dealt with\.\n\n- \*\*T2\*\*[^\n]*Accepted — Accepted \^t2\n- \*\*T4\*\*[^\n]*Transferred — Transferred \^t4\n- \*\*T1\*\*[^\n]*Mitigated — Closed on a box \^t1\n {4}- Mitigation: Fixed\n/);
  assert.doesNotMatch(r.slice(r.indexOf('### Closed')), /Applies to/);
});
