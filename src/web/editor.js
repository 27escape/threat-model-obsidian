// The model's text: a textarea over the same text highlighted (highlight.js, as in the plugin's .threat editor), with
// line numbers beside it. Lines don't wrap, so the numbers stay level with them. It can jump to a line (from an
// error) or select a stretch of text (a statement found from the diagrams), and it hands every change to the page,
// which keeps the history (history.js).

class TwEditor {
  /** o: { beforeChange(textBefore), changed(text) }. */
  constructor(parent, o) {
    this.o = o;
    this.el = parent.createDiv({ cls: 'tw-editor' });
    this.gutter = this.el.createEl('pre', { cls: 'tw-gutter', attr: { 'aria-hidden': 'true' } });
    const wrap = this.el.createDiv({ cls: 'tm-source-wrap' });
    this.under = wrap.createEl('pre', { cls: 'tm-source tm-source-under tm-hl', attr: { 'aria-hidden': 'true' } });
    this.ta = wrap.createEl('textarea', { cls: 'tm-source tm-source-over', attr: { spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off', 'aria-label': 'Threat model' } });
    this.lines = 0;
    this.ta.addEventListener('beforeinput', () => this.o.beforeChange(this.ta.value));
    this.ta.addEventListener('input', () => {
      this.paint();
      this.o.changed(this.ta.value);
    });
    this.ta.addEventListener('scroll', () => this.sync());
    this.ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // two spaces, as the examples are indented; Esc then Tab leaves the editor
      document.execCommand('insertText', false, '  ');
    });
  }

  get value() {
    return this.ta.value;
  }

  /** Replace the text, keeping where it is scrolled to. */
  set value(text) {
    const top = this.ta.scrollTop;
    const left = this.ta.scrollLeft;
    this.ta.value = text;
    this.paint();
    this.ta.scrollTop = top;
    this.ta.scrollLeft = left;
    this.sync();
  }

  paint() {
    tmHighlightInto(this.under, this.ta.value + '\n'); // the final newline keeps the last line's height
    const n = this.ta.value.split('\n').length;
    if (n !== this.lines) {
      this.lines = n;
      this.gutter.setText(Array.from({ length: n }, (_, i) => String(i + 1)).join('\n') + '\n');
    }
    this.sync();
  }

  sync() {
    this.under.scrollTop = this.ta.scrollTop;
    this.under.scrollLeft = this.ta.scrollLeft;
    this.gutter.scrollTop = this.ta.scrollTop;
  }

  top() {
    this.ta.scrollTop = 0;
    this.ta.scrollLeft = 0;
    this.sync();
  }

  /** Select [from, to) and bring it into view, near the top third. */
  select(from, to) {
    const text = this.ta.value;
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(from, to);
    const line = text.slice(0, from).split('\n').length - 1;
    const height = parseFloat(window.getComputedStyle(this.ta).lineHeight) || 20;
    this.ta.scrollTop = Math.max(0, line * height - this.ta.clientHeight / 3);
    this.ta.scrollLeft = 0;
    this.sync();
    this.el.removeClass('tw-flash');
    void this.el.offsetWidth; // so the flash starts again when the same thing is shown twice
    this.el.addClass('tw-flash');
  }

  /** Select line n (counting from 1). */
  goToLine(n) {
    const lines = this.ta.value.split('\n');
    const i = Math.max(1, Math.min(n, lines.length)) - 1;
    const from = lines.slice(0, i).reduce((a, l) => a + l.length + 1, 0);
    this.select(from, from + lines[i].length);
  }
}
