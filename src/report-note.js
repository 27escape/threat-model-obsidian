// "Open as note": writes the report into a new note and opens it in a new tab, ready to read, print or export to
// PDF (Obsidian's "Export to PDF" works on notes). Where it goes is a setting: a "Reports" folder beside the note
// holding the model (the default), or a chosen folder; either is made if it doesn't exist. The note can include the diagrams, drawn with their colours
// written in so they print the same in any theme.
// This is the only place the plugin creates a note or folder, and only when you ask. An existing note is never
// overwritten: the new one gets a number instead ("… threat report 2").

const TM_REPORTS_FOLDER = 'Reports';

/** The folder a report goes in: the chosen folder, or a Reports folder beside the note with the model. */
function tmReportFolder(settings, sourcePath) {
  if (settings.reportLocation === 'folder' && settings.reportFolder.trim()) return normalizePath(settings.reportFolder.trim());
  const slash = sourcePath.lastIndexOf('/');
  const beside = slash >= 0 ? sourcePath.slice(0, slash) : '';
  return normalizePath(beside ? `${beside}/${TM_REPORTS_FOLDER}` : TM_REPORTS_FOLDER);
}

/** The report's file name without ".md": the model's title, or the note's name, safe for a file name. */
function tmReportBase(model, sourcePath) {
  const note = sourcePath.slice(sourcePath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return (model.title || note || 'Threat model').replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
}

/** The diagrams for a saved report, each with the threats it shows: Structure, Data flow, and one Sequence per scenario
 *  (or one of every flow). */
function tmReportDiagrams(model, settings) {
  const level = tmLevelFor(model, model.level || settings.defaultLevel);
  const out = [
    { title: `Structure (${TM_LEVEL_NAMES[level] || level} level)`, mermaid: tmStructure(model, level, { portable: true, defaultIcons: settings.defaultIcons }), threats: tmViewThreats(model, 'structure') },
    { title: 'Data flow', mermaid: tmDataflow(model, { portable: true, defaultIcons: settings.defaultIcons }), threats: tmViewThreats(model, 'dataflow') },
  ];
  const seq = (id, title) => out.push({ title, mermaid: tmSequence(model, id), threats: tmViewThreats(model, 'sequence', { scenario: id }) });
  if (model.scenarios.length) for (const s of model.scenarios) seq(s.id, `Sequence: ${s.title}`);
  else if (model.flows.length) seq('', 'Sequence: every flow, in order');
  return out;
}

/** Make a folder and any folders above it that are missing. */
async function tmEnsureFolder(vault, folder) {
  let path = '';
  for (const part of folder.split('/').filter(Boolean)) {
    path = path ? `${path}/${part}` : part;
    if (!vault.getAbstractFileByPath(path)) await vault.createFolder(path);
  }
}

async function tmSaveReportNote(plugin, model, warnings, sourcePath) {
  const vault = plugin.app.vault;
  const settings = plugin.settings;
  const folder = tmReportFolder(settings, sourcePath);
  const base = tmReportBase(model, sourcePath);
  let path = '';
  for (let n = 1; n < 1000; n++) {
    const name = `${base} threat report${n > 1 ? ` ${n}` : ''}.md`;
    path = normalizePath(folder ? `${folder}/${name}` : name);
    if (!vault.getAbstractFileByPath(path)) break;
  }
  const diagrams = settings.reportDiagrams ? tmReportDiagrams(model, settings) : [];
  const date = new Date().toISOString().slice(0, 10);
  const made = `Made from [[${sourcePath.replace(/\.md$/, '')}]] on ${date}.`;
  const text = tmReport(model, warnings, { diagrams, properties: true, date, source: sourcePath }) + (sourcePath ? `\n---\n${made}\n` : '');
  try {
    if (folder) await tmEnsureFolder(vault, folder);
    const file = await vault.create(path, text);
    await plugin.app.workspace.getLeaf('tab').openFile(file);
    new Notice(`Saved the report as ${path}`);
  } catch (e) {
    new Notice(`Couldn't save the report as ${path}: ${e.message}`);
  }
}
