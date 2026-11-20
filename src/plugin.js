// The plugin: settings, the "threat" code block, the .threat file view and the commands.
// Other files add to it: block.js (TmBlock, what a block shows), file-view.js, report-note.js, settings.js.

const TM_DEFAULTS = {
  defaultView: 'structure', // structure | sequence | dataflow
  defaultLevel: 'container', // context | container | component
  showWarnings: true,
  defaultIcons: true, // a person, store or queue without an icon of its own gets its kind's (icons.js)
  reportLocation: 'reports', // reports (a Reports folder beside the note with the model) | folder (reportFolder)
  reportFolder: '',
  reportDiagrams: true, // put the diagrams in saved reports
};
const TM_VIEW_NAMES = { structure: 'Structure', sequence: 'Sequence', dataflow: 'Data flow', report: 'Report' };
const TM_DIAGRAM_VIEWS = ['structure', 'sequence', 'dataflow']; // what a block can show; the report opens as a note
const TM_LEVEL_NAMES = { context: 'Context', container: 'Container', component: 'Component' };
const TM_FILE_VIEW = 'threat-model-file';

class ThreatModelPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, TM_DEFAULTS, await this.loadData());
    // the report used to be a view in the block; it now always opens as a note
    if (!TM_DIAGRAM_VIEWS.includes(this.settings.defaultView)) this.settings.defaultView = TM_DEFAULTS.defaultView;
    // reports used to be saved next to the note; now in a Reports folder beside it
    if (this.settings.reportLocation === 'beside') this.settings.reportLocation = 'reports';
    // what each block was last showing, so editing a note doesn't send it back to the default view
    this.blockState = new Map();

    this.registerMarkdownCodeBlockProcessor('threat', (source, el, ctx) => {
      ctx.addChild(new TmBlock(this, el, source, ctx.sourcePath));
    });
    this.registerEditorExtension(tmEditorExtension());
    this.registerEditorExtension(tmDiagramEditorExtension(this)); // the same for diagrams in Live Preview
    this.registerMarkdownPostProcessor((el) => tmHighlightReading(el));
    // boxed STRIDE letters and icons in any note's diagrams, such as saved reports, watched while the section is shown
    // and threat IDs linked to the note's threat register, if it has one
    this.registerHoverLinkSource(TM_HOVER_SOURCE, { display: this.manifest.name, defaultMod: true });
    this.registerMarkdownPostProcessor((el, ctx) => {
      const stop = tmColourStrideSoon(el);
      if (!stop) return;
      const child = new MarkdownRenderChild(el);
      child.register(stop);
      ctx.addChild(child);
      tmNoteLinks(this, ctx.sourcePath).then((links) => links && stop.link(links), () => {});
    });
    this.registerView(TM_FILE_VIEW, (leaf) => new TmFileView(leaf, this));
    this.registerExtensions(['threat'], TM_FILE_VIEW);
    this.addSettingTab(new TmSettingTab(this.app, this));

    this.addCommand({
      id: 'insert-threat-block',
      name: 'Insert an example threat model',
      editorCallback: (editor) => editor.replaceSelection('```threat\n' + TM_STARTER + '```\n'),
    });
    this.addCommand({
      id: 'save-report-note',
      name: 'Open the threat report of this note as a new note',
      editorCheckCallback: (checking, editor, view) => {
        const source = tmFirstBlock(editor.getValue());
        if (checking) return source !== null && !!view.file;
        this.saveReportFromSource(source, view.file.path);
      },
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async saveReportFromSource(source, sourcePath) {
    const { model, errors, warnings } = tmBuildModel(source);
    if (!model || errors.length) {
      new Notice(`The threat model has errors; fix them first (line ${errors[0].line}: ${errors[0].message}).`);
      return;
    }
    await tmSaveReportNote(this, model, warnings, sourcePath);
  }
}

/** The text of the first ```threat block in a note, or null. */
function tmFirstBlock(text) {
  const m = /^(`{3,}|~{3,})threat[ \t]*\n([\s\S]*?)^\1[ \t]*$/m.exec(text);
  return m ? m[2] : null;
}

const TM_STARTER = `title = "Example: sign-in"

zone internet "Internet" { trust = "untrusted" }
zone dmz "DMZ" { trust = "restricted" }

person user "User" { zone = internet }

system app "Our app" {
  container web "Web app" { technology = "React"  zone = internet }
  container api "API" { technology = "Node.js"  zone = dmz }
  store db "Accounts" { technology = "PostgreSQL"  zone = dmz }
}

user -> web "Signs in"
web -> api "POST /login" {
  protocol = "HTTPS"
  data = ["Email #pii", "Password #secret"]
  threat T01 "Password guessing against the login" #S #high { score = 7.5 }
}
api -> db "Reads the account" { data = ["Password hash #secret"] }
api -> web "Session cookie" { data = ["Session ID #secret"] }
`;
