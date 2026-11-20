import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmLex, tmBuildModel, tmTagsIn, tmStrideOf } = load(['tmLex', 'tmBuildModel', 'tmTagsIn', 'tmStrideOf']);

const build = (src) => tmBuildModel(src);
const ok = (src) => {
  const r = build(src);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  return r;
};
const fails = (src, line, re) => {
  const r = build(src);
  assert.ok(r.errors.length, 'expected an error');
  assert.equal(r.errors[0].line, line);
  assert.match(r.errors[0].message, re);
};

test('lexer: arrows without spaces, IDs with dashes, tags, numbers', () => {
  const t = tmLex('a->b T-01 #pii 7.5 x<-y');
  assert.deepEqual(
    t.map((x) => `${x.kind}:${x.value}`),
    ['id:a', 'arrow:->', 'id:b', 'id:T-01', 'tag:pii', 'number:7.5', 'id:x', 'arrow:<-', 'id:y', 'eof:']
  );
});

test('lexer: a backtick string reports the line it starts on, and is dedented', () => {
  const t = tmLex('title = `one\n     two\n     three`\nx = "y"');
  assert.equal(t[2].kind, 'string');
  assert.equal(t[2].value, 'one\ntwo\nthree');
  assert.equal(t[2].line, 1);
  assert.equal(t[3].line, 4); // the token after it is counted correctly
});

test('lexer: both comment forms', () => {
  const t = tmLex('// a comment\n/* b\n c */ person p');
  assert.deepEqual(t.map((x) => x.value), ['person', 'p', '']);
  assert.equal(t[0].line, 3);
});

test('tags in text, not in web addresses or numbers', () => {
  assert.deepEqual(tmTagsIn('Password #secret and #pii, see https://x.org/a#anchor or #1'), ['secret', 'pii']);
  assert.deepEqual(tmStrideOf(['I', 'S', 'spoofing', 'Tampering', 'd']), ['S', 'T', 'I']);
  // combined letters, in any order and repeated; only capitals, and only S T R I D E
  assert.deepEqual(tmStrideOf(['ID', 'RTS']), ['S', 'T', 'R', 'I', 'D']);
  assert.deepEqual(tmStrideOf(['STRIDE']), ['S', 'T', 'R', 'I', 'D', 'E']);
  assert.deepEqual(tmStrideOf(['SS', 'ie', 'SIX', 'Ie']), ['S']);
});

test('elements: kinds, titles, nesting and the other names for kinds', () => {
  const { model } = ok(`
    system shop "Shop" {
      container api "API" { technology = "Go" }
      store db
    }
    io visitor "Visitor"
    function worker
    database cache
  `);
  const by = Object.fromEntries(model.elements.map((e) => [e.id, e]));
  assert.equal(by.api.parent, 'shop');
  assert.deepEqual(by.shop.children, ['api', 'db']);
  assert.equal(by.db.title, 'db');
  assert.equal(by.api.technology, 'Go');
  assert.equal(by.visitor.kind, 'external');
  assert.equal(by.worker.kind, 'container');
  assert.equal(by.cache.kind, 'store');
  assert.equal(by.cache.role, 'store');
  assert.equal(by.visitor.role, 'external');
});

test('zones: by nesting, by attribute, and inherited from the parent', () => {
  const { model } = ok(`
    zone net "Internet"
    zone dmz "DMZ" {
      container gw "Gateway"
      zone inner "Inner"
    }
    system s {
      container web { zone = net }
      container api
    }
    system t { zone = dmz
      container worker
    }
  `);
  const z = Object.fromEntries(model.elements.map((e) => [e.id, e.zone]));
  assert.equal(z.gw, 'dmz');
  assert.equal(z.web, 'net');
  assert.equal(z.api, null);
  assert.equal(z.worker, 'dmz');
  assert.equal(model.zones.find((x) => x.id === 'inner').parent, 'dmz');
});

test('flows: label, protocol, data with tags, crossing zones, <- reversed', () => {
  const { model } = ok(`
    zone a
    zone b
    person p { zone = a }
    container c { zone = b }
    p -> c "Sends" { protocol = "HTTPS"  data = ["Name #pii", "Colour"] }
    p <- c { operation = "Replies" }
  `);
  const [f1, f2] = model.flows;
  assert.equal(f1.label, 'Sends');
  assert.equal(f1.protocol, 'HTTPS');
  assert.deepEqual(f1.data, [
    { text: 'Name #pii', tags: ['pii'] },
    { text: 'Colour', tags: [] },
  ]);
  assert.equal(f1.crosses, true);
  assert.equal(f1.sensitive, true);
  assert.equal(f2.from, 'c');
  assert.equal(f2.to, 'p');
  assert.equal(f2.label, 'Replies');
});

test('threats: where they are written, STRIDE, risk, status', () => {
  const { model, warnings } = ok(`
    container c {
      threat T1 "On the element" #T #high
    }
    container d
    c -> d {
      threat T2 "On the flow" #spoofing #I { likelihood = 5  impact = 4 }
      threat T3 "Done" #D { cvss = "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"  status = "mitigated" }
    }
    threat T4 "Everywhere" #R #low #accepted
  `);
  const by = Object.fromEntries(model.threats.map((t) => [t.id, t]));
  assert.deepEqual(by.T1.target, { type: 'element', id: 'c' });
  assert.equal(by.T1.risk, 'high');
  assert.deepEqual(by.T2.stride, ['S', 'I']);
  assert.equal(by.T2.risk, 'critical');
  assert.equal(by.T2.where, '(1) c → d');
  assert.equal(by.T3.status, 'mitigated');
  assert.equal(by.T3.risk, 'medium');
  assert.equal(by.T4.target.type, 'model');
  assert.equal(by.T4.status, 'accepted');
  assert.equal(model.flows[0].threats.length, 2);
  assert.equal(model.elements[0].threats.length, 1);
  assert.equal(model.threats.length, 4, 'a top-level threat is listed once');
  assert.deepEqual(warnings, []);
});

test('threats: warnings for a missing ID, missing STRIDE and a bad score', () => {
  const { warnings } = ok(`threat "No ID"\nthreat T9 "Bad" #S { score = 12 }`);
  const text = warnings.map((w) => `${w.line}: ${w.message}`).join('\n');
  assert.match(text, /1: threat "No ID" has no ID/);
  assert.match(text, /1: .*no STRIDE category/);
  assert.match(text, /2: score 12 should be a number from 0 to 10/);
});

test('threats: a CVSS vector gives the score; score itself is still read, with a warning', () => {
  const { model, warnings } = ok(`threat T1 "X" #S { cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }\nthreat T2 "Y" #S { score = 7.5 }`);
  assert.equal(model.threats[0].score, 9.8);
  assert.equal(model.threats[0].risk, 'critical');
  assert.equal(model.threats[0].method, 'cvss');
  assert.deepEqual(warnings.filter((w) => w.line === 1), []);
  assert.equal(model.threats[1].risk, 'high');
  assert.equal(model.threats[1].method, 'score');
  assert.match(warnings.find((w) => w.line === 2).message, /score is no longer used to rate threats: give likelihood and impact, or a risk tag/);
});

test('threats: rated more than one way is a warning, and the first way is used', () => {
  const { model, warnings } = ok(`threat T1 "X" #S #low { likelihood = 5  impact = 5  cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }
threat T2 "Y" #S { likelihood = 2  impact = 2  cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }`);
  assert.equal(model.threats[0].risk, 'low');
  assert.equal(model.threats[0].method, 'tag');
  assert.equal(model.threats[1].risk, 'low'); // 2 × 2 = 4
  assert.equal(model.threats[1].method, 'rating');
  const said = warnings.map((w) => `${w.line}: ${w.message}`).join('\n');
  assert.match(said, /1: threat T1 is rated 3 ways \(a risk tag, likelihood × impact, a CVSS vector\): a risk tag is used, so remove the others/);
  assert.match(said, /2: threat T2 is rated 2 ways \(likelihood × impact, a CVSS vector\): likelihood × impact is used/);
});

test('scenarios: steps take their flow; a step with no flow is a warning', () => {
  const { model, warnings } = ok(`
    container a
    container b
    a -> b "One"
    a -> b "Two"
    scenario s "S" {
      a -> b "two"
      a -> b
      b -> a "Back"
    }
  `);
  const steps = model.scenarios[0].steps;
  assert.equal(steps[0].flow, 2);
  assert.equal(steps[1].flow, 1);
  assert.equal(steps[2].flow, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].line, 9);
});

test('model settings: default_view, level and scenario', () => {
  const { model, warnings } = ok(`default_view = "Sequence"\nlevel = "context"\nscenario = nope`);
  assert.equal(model.defaultView, 'sequence');
  assert.equal(model.level, 'context');
  assert.equal(model.scenarioId, '');
  assert.match(warnings[0].message, /no scenario with that ID/);
});

test('default_view only takes the diagrams', () => {
  const { model, warnings } = ok(`default_view = "report"`);
  assert.equal(model.defaultView, '');
  assert.match(warnings[0].message, /default_view = "report" should be one of structure, sequence, dataflow/);
});

test('errors carry line numbers', () => {
  fails('container a\ncontainer a', 2, /"a" is used twice \(first on line 1\)/);
  fails('container a\na -> b', 2, /"b" isn't defined/);
  fails('zone z\ncontainer a\nz -> a', 3, /"z" is a zone, not an element/);
  fails('container a { zone = nowhere }', 1, /zone = nowhere: "nowhere" isn't defined/);
  fails('store s {\n  container c\n}', 2, /a container can't go inside a store/);
  fails('container c {\n  zone z\n}', 2, /a zone can't go inside an element/);
  fails('title = "x"\ntitle = "y"', 2, /"title" is set twice/);
  fails('person p\n\n  p -> q {\n  data = ["x"\n}', 5, /expected "," or "]"/);
  fails('description = `never closed', 1, /never closed/);
  fails('scenario s { a }', 1, /only steps/);
  fails('container threat', 1, /keyword/);
  fails('threat T1 "A" #S\nthreat T1 "B" #S', 2, /threat T1 is used twice/);
});

test('one threat in many places: on = [elements, zones and flows]', () => {
  const { model } = ok(`
    zone z "Zone"
    container a
    container b
    container c { zone = z }
    a -> b "One"
    a -> b "Two"
    b -> c
    threat R1 "Shared" #T { on = [a -> b, b -> c, c, z] }
    a -> c {
      threat R2 "Here and there" #I { on = [b -> c] }
    }
  `);
  const r1 = model.threats.find((t) => t.id === 'R1');
  assert.deepEqual(r1.targets.map((x) => x.type + (x.n || x.id)), ['flow1', 'flow2', 'flow3', 'elementc', 'zonez']);
  assert.equal(r1.where, '(1) a → b; (2) a → b; (3) b → c; c; Zone (zone)');
  assert.deepEqual(model.flows.map((f) => f.threats.map((t) => t.id).join()), ['R1', 'R1', 'R1,R2', 'R2']);
  assert.deepEqual(model.zones[0].threats.map((t) => t.id), ['R1']);
  const r2 = model.threats.find((t) => t.id === 'R2');
  assert.deepEqual(r2.targets.map((x) => x.type + x.n), ['flow4', 'flow3']);
  // a label chooses between flows
  const one = ok(`container a\ncontainer b\na -> b "One"\na -> b "Two"\nthreat R "x" #S { on = [a -> b "two"] }`).model;
  assert.deepEqual(one.threats[0].targets, [{ type: 'flow', n: 2 }]);
});

test('on: unknown names and missing flows are errors', () => {
  fails('container a\nthreat R "x" #S { on = [a -> nowhere] }', 2, /on: there is no flow a -> nowhere/);
  fails('container a\nthreat R "x" #S { on = [ghost] }', 2, /on: "ghost" isn't defined/);
  fails('container a\nthreat R "x" #S { on = ["a"] }', 2, /isn't an element, zone or flow/);
});
