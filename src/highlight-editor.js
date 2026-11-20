// Where threat model text is highlighted (the colouring itself is highlight.js):
// - while editing a note: a CodeMirror extension marks the text inside ```threat and ```threat-source blocks
// - in Reading view: ```threat-source blocks (a model's text shown without drawing it)
// - the .threat file view uses tmHighlightInto for its editor (file-view.js)

const TM_EDITOR_MAX = 500000; // characters; longer notes aren't highlighted while editing

function tmEditorExtension() {
  const marks = new Map();
  const markFor = (cls) => {
    if (!marks.has(cls)) marks.set(cls, Decoration.mark({ class: cls }));
    return marks.get(cls);
  };

  class TmEditorMarks {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(u) {
      if (u.docChanged) this.decorations = this.build(u.view);
    }

    build(view) {
      const b = new RangeSetBuilder();
      if (view.state.doc.length > TM_EDITOR_MAX) return b.finish();
      const text = view.state.doc.toString();
      for (const f of tmThreatFences(text)) {
        for (const t of tmHighlight(text.slice(f.from, f.to))) b.add(f.from + t.from, f.from + t.to, markFor(t.cls));
      }
      return b.finish();
    }
  }

  return ViewPlugin.fromClass(TmEditorMarks, { decorations: (v) => v.decorations });
}

/** Fill an element with the highlighted text, as spans (no HTML strings). */
function tmHighlightInto(el, text) {
  el.empty();
  let at = 0;
  for (const t of tmHighlight(text)) {
    if (t.from > at) el.appendText(text.slice(at, t.from));
    el.createSpan({ cls: t.cls, text: text.slice(t.from, t.to) });
    at = t.to;
  }
  if (at < text.length) el.appendText(text.slice(at));
}

/** Reading view: highlight ```threat-source blocks. */
function tmHighlightReading(el) {
  for (const code of el.querySelectorAll('pre > code.language-threat-source')) {
    code.addClass('tm-hl');
    tmHighlightInto(code, code.textContent);
  }
}
