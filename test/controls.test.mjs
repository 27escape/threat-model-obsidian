import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmBuildModel, tmReport, tmHighlight, tmRegisterIndex } = load(['tmBuildModel', 'tmReport', 'tmHighlight', 'tmRegisterIndex']);

const SRC = `
container web "Web"
container api "API"
web -> api "Calls" {
  threat T01 "Token replayed" #S #high { controls = [C02] }
  threat T02 "Request tampered" #T #medium
}
threat T03 "Logs altered" #R #low { mitigation = "Append-only logs" }
threat T04 "No owner yet" #I #medium

control C01 "Mutual TLS between services" #implemented {
  covers = [T01, T02]
  owner = "Platform team"
  due = "2026-12-31"
}
control C02 "Short-lived tokens" { covers = T01 }
control C03 "Signed audit log" { status = "verified"  covers = [T03] }
`;

test('controls: statuses, owners, and threats named on either side', () => {
  const { model: m, errors, warnings } = tmBuildModel(SRC);
  assert.deepEqual(errors, []);
  // T02 and T03 have every control in place but are still open: a reminder to close them if that is enough
  assert.deepEqual(
    warnings.map((w) => w.message),
    [
      'threat T02: all its controls are implemented or verified; if that deals with it, set status = "mitigated"',
      'threat T03: all its controls are implemented or verified; if that deals with it, set status = "mitigated"',
    ]
  );
  const c = Object.fromEntries(m.controls.map((x) => [x.id, x]));
  assert.equal(c.C01.status, 'implemented');
  assert.equal(c.C02.status, 'planned'); // the default
  assert.equal(c.C03.status, 'verified');
  assert.equal(c.C01.owner, 'Platform team');
  assert.equal(c.C01.due, '2026-12-31');
  assert.deepEqual(c.C01.covers, ['T01', 'T02']);
  assert.deepEqual(c.C02.covers, ['T01']); // from covers = T01 and from T01's controls = [C02], once
  const t = Object.fromEntries(m.threats.map((x) => [x.id, x]));
  assert.deepEqual(t.T01.controls, ['C01', 'C02']);
  assert.equal(t.T01.controlled, 'implemented'); // the furthest-on of implemented and planned
  assert.equal(t.T03.controlled, 'verified');
  assert.deepEqual(t.T04.controls, []);
  assert.equal(t.T04.controlled, '');
});

test('controls: mistakes are errors, a control covering nothing is a warning', () => {
  const errs = (src) => tmBuildModel(src).errors.map((e) => e.message).join('\n');
  assert.match(errs('threat T1 "A" #S\ncontrol C1 "X" { covers = [T9] }'), /covers: there is no threat with the ID T9/);
  assert.match(errs('threat T1 "A" #S { controls = [C9] }'), /controls: there is no control with the ID C9/);
  assert.match(errs('threat T1 "A" #S\ncontrol T1 "X" { covers = [T1] }'), /control T1 has the same ID as a threat/);
  assert.match(errs('threat T1 "A" #S\ncontrol C1 "X" { covers = T1 }\ncontrol C1 "Y" { covers = T1 }'), /control C1 is used twice/);
  assert.match(errs('container a { control C1 "X" }'), /a control must be at the top level/);
  assert.match(errs('control "X"'), /a control needs an ID/);
  const { warnings } = tmBuildModel('control C1 "X" { status = "done" }');
  assert.match(warnings.map((w) => w.message).join('\n'), /status "done" isn't one of planned, implemented, verified/);
  assert.match(warnings.map((w) => w.message).join('\n'), /control C1 covers no threat/);
});

test('controls in the report: the summary, each threat’s controls, and a section of their own', () => {
  const { model: m } = tmBuildModel(SRC);
  const r = tmReport(m, []);
  assert.match(r, /- 3 controls: 1 planned, 1 implemented, 1 verified; 3 of 4 open threats have one in place/);
  assert.match(r, /- 1 open threat has no control or mitigation: \[\[#\^t04\|T04\]\]/);
  assert.match(r, /\*\*T01\*\*[^\n]*\^t01\n {4}- Applies to: [^\n]*\n {4}- Controls: \[\[#\^c01\|C01\]\] Mutual TLS between services \(implemented\); \[\[#\^c02\|C02\]\] Short-lived tokens \(planned\)/);
  assert.match(r, /## Controls\n\n- \*\*C02\*\* Planned — Short-lived tokens \^c02\n {4}- Covers: \[\[#\^t01\|T01\]\]/);
  assert.match(r, /- \*\*C01\*\* Implemented — Mutual TLS between services \^c01\n {4}- Covers: \[\[#\^t01\|T01\]\], \[\[#\^t02\|T02\]\]\n {4}- Owner: Platform team · Due: 2026-12-31/);
  // the controls are not read back as threats
  assert.deepEqual([...tmRegisterIndex(r).keys()].sort(), ['T01', 'T02', 'T03', 'T04']);
});

test('controls are highlighted like threats', () => {
  const hl = tmHighlight('control C01 "Mutual TLS" #implemented { covers = [T01] }');
  assert.equal(hl[0].cls, 'tm-hl-keyword');
  assert.equal(hl[1].cls, 'tm-hl-threat-id');
  assert.ok(hl.some((x) => x.cls.includes('tm-hl-status') && x.cls.includes('tm-hl-closed')));
});
