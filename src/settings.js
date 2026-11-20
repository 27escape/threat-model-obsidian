// The settings page, and the folder suggestions for the report folder.

/** Suggests the vault's folders while typing a folder path. */
class TmFolderSuggest extends AbstractInputSuggest {
  constructor(app, inputEl, onPick) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.onPick = onPick;
  }

  getSuggestions(query) {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f) => f instanceof TFolder && f.path !== '/' && f.path.toLowerCase().includes(q))
      .map((f) => f.path)
      .sort()
      .slice(0, 50);
  }

  renderSuggestion(path, el) {
    el.setText(path);
  }

  selectSuggestion(path) {
    this.inputEl.value = path;
    this.inputEl.dispatchEvent(new Event('input'));
    this.onPick(path);
    this.close();
  }
}

class TmSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName('First view')
      .setDesc('What a threat model shows when a note opens. A model can choose its own with default_view = "…".')
      .addDropdown((d) => {
        for (const id of TM_DIAGRAM_VIEWS) d.addOption(id, TM_VIEW_NAMES[id]);
        d.setValue(s.defaultView).onChange(async (v) => {
          s.defaultView = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('First C4 level')
      .setDesc('The level the Structure view starts at. A model can choose its own with level = "…". A model with nothing that deep starts at its deepest level.')
      .addDropdown((d) => {
        for (const [id, name] of Object.entries(TM_LEVEL_NAMES)) d.addOption(id, name);
        d.setValue(s.defaultLevel).onChange(async (v) => {
          s.defaultLevel = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Show warnings')
      .setDesc('List warnings (threats without IDs, scenario steps with no flow and so on) under each model.')
      .addToggle((t) =>
        t.setValue(s.showWarnings).onChange(async (v) => {
          s.showWarnings = v;
          await this.plugin.saveSettings();

    new Setting(containerEl).setName('Reports').setHeading();

    new Setting(containerEl)
      .setName('Save reports')
      .setDesc('Where the Report button saves a report before opening it in a new tab; the folder is made if it doesn\'t exist. An existing note is never replaced: a new report gets a number.')
      .addDropdown((d) =>
        d
          .addOption('reports', 'In a Reports folder beside the note')
          .addOption('folder', 'In a folder')
          .setValue(s.reportLocation)
          .onChange(async (v) => {
            s.reportLocation = v;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (s.reportLocation === 'folder') {
      new Setting(containerEl)
        .setName('Report folder')
        .setDesc('Made when the first report is saved, if it doesn\'t exist. Leave empty to use a Reports folder beside the note.')
        .addText((t) => {
          t.setPlaceholder('Threat reports')
            .setValue(s.reportFolder)
            .onChange(async (v) => {
              s.reportFolder = v.trim();
              await this.plugin.saveSettings();
            });
          new TmFolderSuggest(this.app, t.inputEl, async (path) => {
            s.reportFolder = path;
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(containerEl)
      .setName('Include the diagrams')
      .setDesc('Put the Structure, Data flow and Sequence diagrams in saved reports, with their colours fixed so they print the same in any theme.')
      .addToggle((t) =>
        t.setValue(s.reportDiagrams).onChange(async (v) => {
          s.reportDiagrams = v;
          await this.plugin.saveSettings();
        })
      );

        })
      );
  }
}
