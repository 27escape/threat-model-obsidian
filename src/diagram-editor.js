// Live Preview: Obsidian draws a note's Mermaid diagrams there itself and runs no Markdown post-processors on them,
// so the boxed STRIDE letters in a saved report (or any note) would stay uncoloured and its icons undrawn while the
// note is being edited. This editor extension watches the editor for diagrams and does what the post-processor
// does in Reading view (stride-colour.js, icon-draw.js, and id-links.js for threat IDs). Threat blocks look after their own diagrams.

function tmDiagramEditorExtension(plugin) {
  class TmDiagramWatch {
    constructor(view) {
      this.stop = tmColourStrideSoon(view.dom, null, true);
      this.path = null;
      this.follow(view);
    }

    // the note's threat register, for its diagrams' threat IDs: read again when the editor shows another note
    follow(view) {
      let info = null;
      try {
        info = view.state.field(editorInfoField);
      } catch {
        info = null;
      }
      const path = info && info.file ? info.file.path : '';
      if (path === this.path) return;
      this.path = path;
      if (this.stop) this.stop.link(null);
      if (path) tmNoteLinks(plugin, path).then((links) => links && this.stop && this.path === path && this.stop.link(links), () => {});
    }

    update(update) {
      this.follow(update.view);
    }

    destroy() {
      if (this.stop) this.stop();
      this.stop = null;
    }
  }
  return ViewPlugin.fromClass(TmDiagramWatch);
}
