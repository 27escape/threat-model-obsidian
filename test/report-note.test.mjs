import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { tmBuildModel, tmReportFolder, tmReportBase, tmReportDiagrams, tmReport, tmSaveReportNote, TM_DEFAULTS } = load([
  'tmBuildModel',
  'tmReportFolder',
  'tmReportBase',
  'tmReportDiagrams',
  'tmReport',
  'tmSaveReportNote',
  'TM_DEFAULTS',
]);

const SRC = `title = "Shop: login"
person p
container c
p -> c "Signs in" { threat T1 "Guessing" #S #high }
scenario a "First" { p -> c }
scenario b "Second" { p -> c }`;
const model = tmBuildModel(SRC).model;

/** A vault that keeps files and folders in a Map, and a workspace that records what was opened. */
function fakePlugin(settings, existing = []) {
  const files = new Map(existing.map((p) => [p, '']));
  const opened = [];
  const vault = {
    getAbstractFileByPath: (p) => (files.has(p) ? { path: p } : null),
    createFolder: async (p) => files.set(p, 'folder'),
    create: async (p, text) => {
      if (files.has(p)) throw new Error('exists');
      files.set(p, text);
      return { path: p };
    },
  };
  const app = { vault, workspace: { getLeaf: (how) => ({ openFile: async (f) => opened.push([how, f.path]) }) } };
  return { plugin: { app, settings: { ...TM_DEFAULTS, ...settings } }, files, opened };
}

test('where a report goes: a Reports folder beside the note, or the folder set', () => {
  assert.equal(tmReportFolder({ reportLocation: 'reports', reportFolder: 'X' }, 'Projects/Shop/Model.md'), 'Projects/Shop/Reports');
  assert.equal(tmReportFolder({ reportLocation: 'reports', reportFolder: '' }, 'Model.md'), 'Reports');
  assert.equal(tmReportFolder({ reportLocation: 'folder', reportFolder: ' Reports//Threats/ ' }, 'Projects/Model.md'), 'Reports/Threats');
  assert.equal(tmReportFolder({ reportLocation: 'folder', reportFolder: '' }, 'Projects/Model.md'), 'Projects/Reports');
  assert.equal(tmReportBase(model, 'x/Note.md'), 'Shop- login');
  assert.equal(tmReportBase({ title: '' }, 'x/My model.threat'), 'My model');
});

test('a saved report has the diagrams, with their colours written in', () => {
  // the model has nothing inside its elements, so the Container level the settings ask for is drawn as Context
  const d = tmReportDiagrams(model, TM_DEFAULTS);
  assert.deepEqual(
    d.map((x) => x.title),
    ['Structure (Context level)', 'Data flow', 'Sequence: First', 'Sequence: Second']
  );
  assert.match(d[1].mermaid, /linkStyle 0 stroke:#CD3B48/); // portable: no edge IDs, colours in the diagram
  const r = tmReport(model, [], { diagrams: d });
  assert.match(r, /## Summary[\s\S]*## Threat register[\s\S]*## Diagrams\n\n### Structure \(Context level\)\n\n```mermaid\nflowchart TB[\s\S]*```/);
});

test('saving: into the report folder (made if missing), numbered rather than replacing, opened in a new tab', async () => {
  const { plugin, files, opened } = fakePlugin({ reportLocation: 'folder', reportFolder: 'Reports/Threats' }, ['Reports/Threats/Shop- login threat report.md']);
  await tmSaveReportNote(plugin, model, [], 'Projects/Model.md');
  assert.equal(files.get('Reports'), 'folder');
  assert.equal(files.get('Reports/Threats'), 'folder');
  const text = files.get('Reports/Threats/Shop- login threat report 2.md');
  // properties first, for Bases and Dataview; then no title heading: the note's name says what it is
  assert.match(text, /^---\ntags:\n  - threat-report\nmodel: "Shop: login"\nsource: "\[\[Projects\/Model\]\]"\ndate: \d{4}-\d{2}-\d{2}\n[\s\S]*?\n---\n\n## Summary/);
  assert.match(text, /## Diagrams/);
  assert.match(text, /Made from \[\[Projects\/Model\]\]/);
  assert.deepEqual(opened, [['tab', 'Reports/Threats/Shop- login threat report 2.md']]);
});

test('saving into the Reports folder beside the note (made if missing), without diagrams', async () => {
  const { plugin, files } = fakePlugin({ reportDiagrams: false }, ['Projects']);
  await tmSaveReportNote(plugin, model, [], 'Projects/Model.md');
  assert.equal(files.get('Projects/Reports'), 'folder');
  const text = files.get('Projects/Reports/Shop- login threat report.md');
  assert.ok(text);
  assert.doesNotMatch(text, /## Diagrams/);
});

test('a saved report writes each threat out once: in the register, with IDs under a diagram that shows only some', () => {
  const m = tmBuildModel(`person p
container a
container b
p -> a "In" { threat T1 "Guessing" #S #high }
a -> b "On" { threat T2 "Leak" #I #medium }
threat T3 "Everywhere" #D #low
scenario s "Just in" { p -> a }`).model;
  const r = tmReport(m, [], { diagrams: tmReportDiagrams(m, TM_DEFAULTS) });
  const text = r.replace(/```mermaid[\s\S]*?```/g, ''); // the sequence diagram's notes carry titles too
  // once in the register, and once more among the top risks in the summary, which is read on its own
  assert.equal((text.match(/Guessing/g) || []).length, 2, 'the title appears twice outside the diagrams');
  // the register is a list, each threat ending in a block ID that links elsewhere in the report point to
  assert.match(r, /## Threat register\n\n### Open\n\n- \*\*T1\*\* <span class="tm-chip tm-chip-S">S<\/span> High · Open — Guessing \^t1\n    - Applies to: \(1\) p → a\n/);
  // Data flow shows every threat, so nothing under it; the scenario shows only some, so their IDs
  assert.match(r, /### Data flow\n\n```mermaid\n[\s\S]*?```\n\n### Sequence: Just in/);
  assert.match(r, /### Sequence: Just in\n\n```mermaid\n[\s\S]*?```\n\nThreats shown: \[\[#\^t1\|T1\]\], \[\[#\^t3\|T3\]\]\./);
  // and each flow names its threats by ID
  assert.match(r, /### 1\. p → a: In\n\n- \*\*Threats:\*\* \[\[#\^t1\|T1\]\]\n/);
  assert.doesNotMatch(r, /\*\*Crosses\*\*/);
});
