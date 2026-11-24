import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmCvss, tmBuildModel, tmStructure, tmSequence, tmDataflow, tmReport, tmMmText, tmFirstBlock, tmCoverageGaps } = load([
  'tmCvss',
  'tmBuildModel',
  'tmStructure',
  'tmSequence',
  'tmDataflow',
  'tmReport',
  'tmMmText',
  'tmFirstBlock',
  'tmCoverageGaps',
]);

const model = (src) => {
  const r = tmBuildModel(src);
  assert.deepEqual(r.errors, []);
  return r.model;
};

const PORTAL = `
title = "Portal"
zone net "Internet" { trust = "untrusted" }
zone dmz "DMZ"
person user "User" { zone = net }
external idp "IdP" { zone = net }
system app "App" {
  container web "Web" { technology = "React"  zone = net
    component form "Login form"
  }
  container api "API" { zone = dmz }
  store db "DB" { technology = "Postgres"  zone = dmz
    threat T3 "Open to the network" #I #high
  }
}
user -> form "Types; then #submits" { data = ["Password #secret"] }
web -> api "POST" { protocol = "HTTPS"  threat T1 "Stuffing" #S { likelihood = 5  impact = 4 } }
api -> db "Query"
api -> idp "Check"
scenario s "Sign in" { user -> form  web -> api  api -> db  api -> web "Missing" }
`;

test('CVSS 3.1 base scores match the specification', () => {
  assert.equal(tmCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H').score, 9.8);
  assert.equal(tmCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N').score, 6.1);
  assert.equal(tmCvss('CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N').score, 8.1);
  assert.equal(tmCvss('CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H').score, 7.8);
  assert.equal(tmCvss('CVSS:3.0/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N/E:P').score, 5.9);
  assert.equal(tmCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N').score, 0);
  assert.match(tmCvss('CVSS:4.0/AV:N').error, /4\.0/);
  assert.match(tmCvss('AV:N/AC:L').error, /isn't a CVSS 3\.1 vector/);
  assert.match(tmCvss('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H').error, /AV:X/);
  assert.match(tmCvss('CVSS:3.1/AV:N/AC:L').error, /missing PR/);
});

test('Mermaid text: syntax characters become entity codes; <sub> survives in flowcharts only', () => {
  assert.equal(tmMmText('a "b" #c; <d>'), 'a #quot;b#quot; #35;c#59; #lt;d#gt;');
  assert.equal(tmMmText('IP<sub>user</sub>'), 'IP<sub>user</sub>');
  assert.equal(tmMmText('IP<sub>user</sub>', false), 'IPuser');
  assert.equal(tmMmText('one\ntwo'), 'one<br/>two');
});

test('Structure view: levels show more inside each box, and flows move to the nearest visible box', () => {
  const m = model(PORTAL);
  const ctx = tmStructure(m, 'context');
  assert.match(ctx, /^flowchart TB/);
  assert.doesNotMatch(ctx, /subgraph/);
  assert.match(ctx, /Software system/);
  assert.doesNotMatch(ctx, /Login form/);
  // user -> form becomes user -> app; app -> idp from api -> idp; flows inside app are left out
  const ids = new Map(m.elements.map((e, i) => [e.id, `e${i + 1}`]));
  assert.match(ctx, new RegExp(`${ids.get('user')} -->\\|"Types#59; then #35;submits"\\| ${ids.get('app')}`));
  assert.match(ctx, new RegExp(`${ids.get('app')} -->\\|"Check"\\| ${ids.get('idp')}`));
  assert.doesNotMatch(ctx, /POST/);

  const cont = tmStructure(m, 'container', { defaultIcons: false });
  assert.match(cont, new RegExp(`subgraph ${ids.get('app')} `));
  assert.match(cont, /Container: React/);
  assert.match(cont, /POST \[HTTPS\]/);
  assert.match(cont, /\[\("<b>DB<\/b><br\/>\[Database: Postgres\]<br\/>🅸 <b><u>T3<\/u><\/b>"\)\]/);
  assert.doesNotMatch(cont, /Login form/);

  assert.match(cont, /classDef tmPerson stroke-width:1px/);
  assert.doesNotMatch(cont, /fill:/);
  assert.match(tmStructure(m, 'container', { portable: true }), /classDef tmPerson fill:#08427b/);

  const comp = tmStructure(m, 'component');
  assert.match(comp, /Login form/);
  assert.match(comp, new RegExp(`subgraph ${ids.get('web')} `));
});

test('Data flow view: zones as boxes, numbered flows with data and STRIDE, coloured by risk', () => {
  const m = model(PORTAL);
  const d = tmDataflow(m, { defaultIcons: false });
  assert.match(d, /subgraph z1 \["Internet \(untrusted\)"\]/);
  assert.match(d, /\(1\) Types#59; then #35;submits<br\/>Password #35;secret/);
  assert.match(d, /\(2\) POST<br\/>🆂 <b><i><u>T1 \(5×4\)<\/u><\/i><\/b>"/);
  // in Obsidian the colour comes from styles.css through the edge ID; copied diagrams carry it in linkStyle
  assert.match(d, /e\d+ tmcritical2@-->\|"\(2\) POST/);
  assert.doesNotMatch(d, /linkStyle|style z|fill:/);
  const p = tmDataflow(m, { portable: true });
  assert.match(p, /linkStyle 1 stroke:#982C35/);
  assert.doesNotMatch(p, /linkStyle 0 /);
  assert.doesNotMatch(p, /@-->/);
  assert.match(p, /classDef tmProc fill:#E2EAF9/);
  assert.match(d, /\(\("API"\)\)/);
  assert.match(d, /\[\("DB"\)\]/);
});

test('Sequence view: a scenario, zone boxes, dashed steps with no flow, threat notes', () => {
  const m = model(PORTAL);
  const s = tmSequence(m, 's');
  assert.match(s, /^sequenceDiagram\n/);
  assert.match(s, /box rgba\(128,128,128,0\.08\) Internet/);
  assert.match(s, /actor e\d+ as User/);
  assert.match(s, /participant e\d+ as DB \[store\]/);
  assert.match(s, /-->>e\d+: Missing/);
  assert.match(s, /Note over e\d+,e\d+: T1 🆂 <b><i><u>CRITICAL<\/u><\/i><\/b> 5×4<br\/>Stuffing/);
  assert.match(s, /Note over e\d+,e\d+: On DB:<br\/>T3 🅸 <b><u>High<\/u><\/b>/); // across the step, never over one participant
  assert.doesNotMatch(s, /Note over e\d+:/);
  assert.match(s, /rect rgba\(205,40,55,0\.36\)/);
  const every = tmSequence(m, '');
  assert.equal((every.match(/->>/g) || []).length, 4);
});

test('Sequence view: the risk word gets louder as the risk rises, and is plain once a threat is closed', () => {
  const m = model(`
    container a
    container b
    a -> b {
      threat L "l" #T #low
      threat M "m" #T #medium
      threat H "h" #T #high
      threat C "c" #T #critical
      threat X "x" #T #critical #mitigated
    }
  `);
  const s = tmSequence(m, '');
  assert.match(s, /L 🆃 <i>Low<\/i>/);
  assert.match(s, /M 🆃 <b>Medium<\/b>/);
  assert.match(s, /H 🆃 <b><u>High<\/u><\/b>/);
  assert.match(s, /C 🆃 <b><i><u>CRITICAL<\/u><\/i><\/b>/);
  assert.match(s, /X 🆃 Critical \(mitigated\)/);
});

test('Report: register order, crossings with sensitive data, STRIDE gaps', () => {
  const m = model(PORTAL);
  const r = tmReport(m, [{ line: 3, message: 'something' }]);
  assert.doesNotMatch(r, /^# /m);
  assert.match(r, /^## Summary/);
  assert.match(r, /- \*\*T1\*\* <span class="tm-chip tm-chip-S">S<\/span> Critical · 5 × 4 = 20 · Open — Stuffing \^t1\n    - Applies to: \(2\) Web → API\n/);
  assert.doesNotMatch(r, /\| 1 \| User/); // user and form are both on the internet: not a crossing
  assert.match(r, /\| 2 \| Web \(Internet\) \| API \(DMZ\) \| POST \| HTTPS \|/);
  assert.match(r, /## Warnings\n\n- Line 3: something/);
  // STRIDE letters in the report are coloured boxes, in the gaps table and its key too
  assert.match(r, /\| DB \| data store \| <span class="tm-chip tm-chip-T">T<\/span> <span class="tm-chip tm-chip-D">D<\/span> \|/);
  assert.match(r, /<span class="tm-chip tm-chip-S">S<\/span> spoofing, /);
  const gaps = tmCoverageGaps(m);
  const db = gaps.find((g) => g.what === 'DB');
  assert.deepEqual(db.missing, ['T', 'D']);
});

test('the first threat block in a note', () => {
  assert.equal(tmFirstBlock('# Note\n\n```threat\nperson p\n```\n'), 'person p\n');
  assert.equal(tmFirstBlock('```js\nx\n```'), null);
});

test('C4 levels: only the ones that show something different for the model', () => {
  const { tmLevels, tmLevelFor } = load(['tmLevels', 'tmLevelFor']);
  const flat = model('person p\nsystem s\np -> s');
  assert.deepEqual(tmLevels(flat), ['context']);
  assert.equal(tmLevelFor(flat, 'component'), 'context');
  const two = model('system s { container c  store d }');
  assert.deepEqual(tmLevels(two), ['context', 'container']);
  assert.equal(tmLevelFor(two, 'component'), 'container');
  assert.equal(tmLevelFor(two, 'context'), 'context');
  assert.deepEqual(tmLevels(model(PORTAL)), ['context', 'container', 'component']);
  // a model written inside zones only is flat too: zones aren't C4 levels
  assert.deepEqual(tmLevels(model('zone z { container a  container b }')), ['context']);
});

test('Structure overlay: STRIDE squares and risk on boxes and arrows, hidden threats shown on the box holding them', () => {
  const m = model(PORTAL);
  const ids = new Map(m.elements.map((e, i) => [e.id, `e${i + 1}`]));
  const ctx = tmStructure(m, 'context');
  // at Context the app box holds DB's threat (T3, high) and the web -> api flow's (T1, critical)
  assert.match(ctx, new RegExp(`${ids.get('app')}\\["<b>App<\\/b><br\\/>\\[Software system\\]<br\\/>🆂 🅸 <b><i><u>T1 \\(5×4\\)<\\/u><\\/i><\\/b> <b><u>T3<\\/u><\\/b>"\\]`));
  assert.match(ctx, new RegExp(`class ${ids.get('app')} tmRiskCritical`));
  const cont = tmStructure(m, 'container');
  assert.match(cont, new RegExp(`${ids.get('web')} tmcriticals\\d+@-->\\|"POST \\[HTTPS\\]<br\\/>🆂 <b><i><u>T1 \\(5×4\\)<\\/u><\\/i><\\/b>"\\| ${ids.get('api')}`));
  assert.match(cont, new RegExp(`class ${ids.get('db')} tmRiskHigh`));
  // off: no squares, no risk classes, no edge IDs
  const off = tmStructure(m, 'container', { overlay: false });
  assert.doesNotMatch(off, /🆂|🅸|tmRisk|@-->/);
  // portable: risk written in, no edge IDs
  const p = tmStructure(m, 'container', { portable: true });
  assert.match(p, /classDef tmRiskCritical stroke:#982C35,stroke-width:3px/);
  assert.match(p, /linkStyle \d+ stroke:#982C35/);
  assert.doesNotMatch(p, /@-->/);
});

test('compact labels: short text, then the threat marks', () => {
  const m = model(PORTAL);
  assert.match(tmStructure(m, 'container', { compact: true }), /-->\|"POST \[HTTPS\]<br\/>🆂 <b><i><u>T1 \(5×4\)<\/u><\/i><\/b>"\|/);
  assert.doesNotMatch(tmStructure(m, 'container', { compact: true }), /<i>[A-Z][a-z]/); // no descriptions
  const d = tmDataflow(m, { compact: true });
  assert.match(d, /\|"\(2\)<br\/>🆂 <b><i><u>T1 \(5×4\)<\/u><\/i><\/b>"\|/);
  assert.match(d, /\|"\(1\)"\|/);
  assert.doesNotMatch(d, /Password/);
  const s = tmSequence(m, 's', { compact: true });
  assert.match(s, /Note over e\d+,e\d+: T1 🆂 <b><i><u>CRITICAL<\/u><\/i><\/b> 5×4\n/);
  assert.doesNotMatch(s, /Stuffing|Password/);
});

test('the threats each view lists in its table', () => {
  const { tmViewThreats } = load(['tmViewThreats']);
  const m = model(`
    zone z "Z" { threat Z1 "On the zone" #D }
    person p
    container a { zone = z  threat A1 "On a" #T #high }
    container b
    p -> a "One" { threat F1 "On flow 1" #S #critical }
    a -> b "Two" { threat F2 "On flow 2" #I #low }
    threat M1 "Whole model" #R #medium
    scenario s "S" { p -> a }
  `);
  const ids = (view, opts) => tmViewThreats(m, view, opts).map((t) => t.id);
  assert.deepEqual(ids('dataflow'), ['F1', 'A1', 'M1', 'F2', 'Z1']);
  assert.deepEqual(ids('structure'), ['F1', 'A1', 'M1', 'F2']); // zones aren't in the Structure view
  assert.deepEqual(ids('sequence', { scenario: 's' }), ['F1', 'A1', 'M1']); // only what the scenario touches
  assert.deepEqual(ids('sequence', { scenario: '' }), ['F1', 'A1', 'M1', 'F2']);
});

test('register order: open first, then by risk, then by rating; a threat without one goes last in its risk', () => {
  const { tmSortThreats } = load(['tmSortThreats']);
  const m = model(`
    threat A "a" #S { likelihood = 1  impact = 3 }
    threat B "b" #S #medium
    threat C "c" #S { likelihood = 2  impact = 4 }
    threat D "d" #S #critical #mitigated
    threat E "e" #S { cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N" }
    threat F "f" #S { likelihood = 3  impact = 3 }
  `);
  // E: CVSS 9.1, critical; F: 9 and C: 8 are medium, F first; B: a medium tag, no rating; A: 3, low
  assert.deepEqual(tmSortThreats(m.threats).map((t) => t.id), ['E', 'F', 'C', 'B', 'A', 'D']);
});

test('report links: every threat gets a block ID it can be linked to, even without an ID of its own', () => {
  const { tmThreatAnchors } = load(['tmThreatAnchors']);
  const m = model('threat SHOP-01 "a" #S\nthreat "No ID" #T\nthreat Shop_01 "b" #I');
  // deepEqual can't compare a Map across the sandbox, so read its values
  assert.deepEqual([...tmThreatAnchors(m.threats).values()], ['shop-01', 'threat-2', 'shop-01-x']);
});

test('threat IDs on the diagram: most serious first, formatted by risk, the rest counted', () => {
  const { tmThreatIdsText, tmThreatMarks } = load(['tmThreatIdsText', 'tmThreatMarks']);
  const m = model(`
    container a {
      threat L1 "Low one" #S #low
      threat C1 "Critical one" #T #critical
      threat M1 "Medium one" #R #medium
      threat H1 "High but mitigated" #I #high { status = mitigated }
      threat H2 "High one" #D #high
      threat "No ID" #E #low
    }
  `);
  const a = m.elements[0];
  assert.equal(tmThreatIdsText(a.threats), '<b><i><u>C1</u></i></b> <b><u>H2</u></b> <b>M1</b> <i>L1</i> +2');
  assert.equal(tmThreatIdsText(a.threats, 10), '<b><i><u>C1</u></i></b> <b><u>H2</u></b> <b>M1</b> <i>L1</i> <i>?</i> H1');
  assert.match(tmThreatMarks(a.threats), /^🆂 🆃 🆁 🅸 🅳 🅴 <b><i><u>C1/);
  assert.equal(tmThreatMarks([]), '');
});

test('threat ID colours: by risk while open, muted once closed, none without an ID', () => {
  const { tmThreatIdInfo } = load(['tmThreatIdInfo']);
  const m = model(`
    container a {
      threat T1 "One" #S #high
      threat T2 "Two" #T #low { status = accepted }
      threat "Three" #R #medium
    }
  `);
  assert.deepEqual(
    [...tmThreatIdInfo(m.threats)],
    [
      ['T1', { cls: 'tm-tid-high', tip: 'T1 [S] High — One' }],
      ['T2', { cls: 'tm-tid-closed', tip: 'T2 [T] Low (accepted) — Two' }],
    ]
  );
});

test('a saved report threat register is read back, so the IDs on its diagrams link to it', () => {
  const { tmRegisterIndex } = load(['tmRegisterIndex']);
  const m = model(`
    container a {
      threat T-1 "One — with a dash" #S #high
      threat T2 "Two" #T #low { status = accepted }
      threat "No ID" #R #medium
    }
    threat SHOP_3 "Whole model" #I #critical
  `);
  const ids = tmRegisterIndex(tmReport(m, []));
  assert.deepEqual(Object.fromEntries(ids), {
    SHOP_3: { cls: 'tm-tid-critical', anchor: 'shop-3' },
    'T-1': { cls: 'tm-tid-high', anchor: 't-1' },
    T2: { cls: 'tm-tid-closed', anchor: 't2' },
  });
  assert.equal(tmRegisterIndex('# A note\n\n- **T1** just a list').size, 0);
});

test('icons: a Lucide name, with optional colours, carried to the diagram as class names', () => {
  const { tmBuildModel, tmIconClassColour } = load(['tmBuildModel', 'tmIconClassColour']);
  const { model: m, errors, warnings } = tmBuildModel(`
    person visitor "Visitor" { zone = net, icon = "user" }
    zone net "Internet"
    container api "API" { icon = "lucide:server"  icon_colour = "#FFD166"  icon_background = "navy" }
    store db "DB" { icon = "database"  icon_color = "white" }
    external idp "IdP" { icon = "fa:fa-key" }
    container web "Web" { icon = "Not an icon!" }
    container plain "Plain" { icon_background = "red" }
    container off "Off" { icon = "none" }
    container bad "Bad colour" { icon = "user"  icon_colour = "url(x)" }
    visitor -> api "Calls"
    api -> db "Reads"
  `);
  assert.deepEqual(errors, []);
  const icon = (id) => m.elements.find((e) => e.id === id).icon;
  assert.deepEqual(icon('visitor'), { name: 'user', fg: null, bg: null });
  assert.deepEqual(icon('api'), { name: 'server', fg: '#ffd166', bg: 'navy' });
  assert.deepEqual(icon('db'), { name: 'database', fg: 'white', bg: null });
  assert.equal(icon('idp'), null);
  assert.equal(icon('web'), null);
  assert.equal(icon('off'), null);
  assert.deepEqual(icon('bad'), { name: 'user', fg: null, bg: null });
  const said = warnings.map((w) => w.message).join('\n');
  assert.match(said, /Font Awesome icons aren't available in Obsidian; use a Lucide icon name, such as "key"/);
  assert.match(said, /icon = "not an icon!" isn't an icon name/);
  assert.match(said, /plain has an icon colour but no icon/);
  assert.match(said, /icon_colour = "url\(x\)" isn't a colour/);
  assert.equal(m.elements.find((e) => e.id === 'visitor').extra.icon, undefined); // not listed as an extra attribute

  const s = tmStructure(m, 'container');
  assert.match(s, /\(" <br\/><b>Visitor<\/b><br\/>\[Person\]"\)/);
  assert.match(s, /class e\d+ tmIcon_server\n\s+class e\d+ tmIconFg_xffd166\n\s+class e\d+ tmIconBg_navy/);
  assert.doesNotMatch(s, /tmIcon_key/);
  assert.match(s, /classDef tmIcon_server opacity:1/);
  const d = tmDataflow(m);
  assert.match(d, /\[\(" <br\/>DB"\)\]/);
  assert.match(d, /class e\d+ tmIcon_database/);
  assert.match(d, /classDef tmIcon_database opacity:1/);
  assert.equal(tmIconClassColour('xffd166'), '#ffd166');
  assert.equal(tmIconClassColour('xabc'), '#abc');
  assert.equal(tmIconClassColour('white'), 'white');
  assert.equal(tmIconClassColour('x1'), null);
});

test('threat IDs on the diagram carry the rating: likelihood × impact, or a CVSS score; nothing for a tag', () => {
  const { tmThreatIdsText } = load(['tmThreatIdsText']);
  const m = model(`
    container a {
      threat G1 "Rated" #S { likelihood = 4  impact = 3 }
      threat V1 "From a vector" #T { cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }
      threat N1 "A tag" #R #low
    }
  `);
  assert.equal(tmThreatIdsText(m.elements[0].threats), '<b><i><u>V1 (9.8)</u></i></b> <b><u>G1 (4×3)</u></b> <i>N1</i>');
});

test('default icons: a person, external, store or queue without an icon gets its kind\'s; icon = "none" or the setting leaves it off', () => {
  const { model: m, errors, warnings } = tmBuildModel(`
    person user "User" { icon_colour = "teal" }
    person bot "Bot" { icon = "none" }
    person admin "Admin" { icon = "shield" }
    store db "DB"
    queue q "Jobs"
    container api "API"
    external idp "IdP"
  `);
  assert.deepEqual(errors, []);
  const icon = (id) => m.elements.find((e) => e.id === id).icon;
  assert.deepEqual(icon('user'), { name: 'user', fg: 'teal', bg: null, isDefault: true });
  assert.equal(icon('bot'), null);
  assert.deepEqual(icon('admin'), { name: 'shield', fg: null, bg: null });
  assert.equal(icon('db').name, 'database');
  assert.equal(icon('q').name, 'list-ordered');
  assert.equal(icon('api'), null);
  assert.equal(icon('idp').name, 'building-2');
  assert.deepEqual(warnings, []);

  const on = tmStructure(m, 'container');
  assert.match(on, /class e\d+ tmIcon_list_ordered/);
  assert.match(on, /class e\d+ tmIcon_shield/);
  const off = tmStructure(m, 'container', { defaultIcons: false });
  assert.doesNotMatch(off, /tmIcon_user|tmIcon_database|tmIcon_list_ordered/);
  assert.match(off, /class e\d+ tmIcon_shield/); // an icon the model names is always drawn
  assert.doesNotMatch(tmDataflow(m, { defaultIcons: false }), /tmIcon_database/);
  assert.match(tmDataflow(m), /tmIcon_database/);
});

test('default icons from the technology, the untrusted-zone shield and the padlock on sensitive data', () => {
  const { tmTechIcon } = load(['tmTechIcon']);
  assert.equal(tmTechIcon('React, TypeScript'), 'globe');
  assert.equal(tmTechIcon('React Native'), 'smartphone');
  assert.equal(tmTechIcon('Node.js'), 'server');
  assert.equal(tmTechIcon('ASP.NET Core'), 'server');
  assert.equal(tmTechIcon('PostgreSQL 15'), 'database');
  assert.equal(tmTechIcon('Amazon SQS'), 'list-ordered');
  assert.equal(tmTechIcon('Azure Blob Storage'), 'archive');
  assert.equal(tmTechIcon('SMTP relay'), 'mail');
  assert.equal(tmTechIcon('Entra ID'), 'key-round');
  assert.equal(tmTechIcon('JavaScript'), 'globe'); // not "java"
  assert.equal(tmTechIcon('Google Cloud'), null); // not "go"
  assert.equal(tmTechIcon(''), null);

  const { model: m, errors } = tmBuildModel(`
    zone net "Internet" { trust = "untrusted" }
    zone dc "Data centre" { trust = "trusted" }
    person user "User" { zone = net  technology = "Web browser" }
    container web "Web" { zone = dc  technology = "React" }
    container odd "Odd" { zone = dc  technology = "COBOL" }
    store files "Files" { zone = dc  technology = "S3" }
    external idp "IdP" { technology = "Auth0" }
    user -> web "Signs in" { data = ["Password #secret", "Name"] }
    web -> files "Saves"
  `);
  assert.deepEqual(errors, []);
  const icon = (id) => m.elements.find((e) => e.id === id).icon;
  assert.equal(icon('user').name, 'user'); // a person is always "user"
  assert.equal(icon('web').name, 'globe');
  assert.equal(icon('odd'), null);
  assert.equal(icon('files').name, 'archive');
  assert.equal(icon('idp').name, 'key-round');

  const d = tmDataflow(m);
  assert.match(d, /classDef tmIcon_shield_alert opacity:1/);
  assert.equal((d.match(/class z\d+ tmIcon_shield_alert/g) || []).length, 1);
  assert.match(d, /\u{1F512} Password #35;secret, Name/u);
  const off = tmDataflow(m, { defaultIcons: false });
  assert.doesNotMatch(off, /shield_alert|\u{1F512}|tmIcon_/u);
});

test('a .threat file\'s tab has the plugin\'s icon, not the untrusted-zone shield', () => {
  const { TmFileView, TM_UNTRUSTED_ICON } = load(['TmFileView', 'TM_UNTRUSTED_ICON']);
  assert.equal(TmFileView.prototype.getIcon(), 'shield-half');
  assert.notEqual(TmFileView.prototype.getIcon(), TM_UNTRUSTED_ICON);
});

test('the settings page shows every setting (a bracket out of place once hid all after "Show warnings")', () => {
  const { TmSettingTab, TM_DEFAULTS, Setting } = load(['TmSettingTab', 'TM_DEFAULTS', 'Setting']);
  const names = (settings) => {
    Setting.made.length = 0;
    const tab = Object.assign(Object.create(TmSettingTab.prototype), {
      containerEl: { empty() {} },
      plugin: { settings: { ...TM_DEFAULTS, ...settings }, saveSettings: async () => {} },
    });
    tab.display();
    return Setting.made.map((x) => x.name);
  };
  const always = ['First view', 'First C4 level', 'Show warnings', 'Default icons', 'Reports', 'Save reports', 'Include the diagrams'];
  assert.deepEqual(names({ reportLocation: 'reports' }), always);
  assert.deepEqual(names({ reportLocation: 'folder' }), [...always.slice(0, 6), 'Report folder', 'Include the diagrams']);
});

test('the example a new model starts from (the Insert command, and New in the web app) has no errors, warnings or findings', () => {
  const { tmBuildModel, TM_STARTER } = load(['tmBuildModel', 'TM_STARTER']);
  const { model, errors, warnings } = tmBuildModel(TM_STARTER);
  assert.deepEqual([...errors, ...warnings], []);
  assert.deepEqual(model.findings, []);
});
