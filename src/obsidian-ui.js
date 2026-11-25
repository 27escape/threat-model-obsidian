// The two helpers the point-and-click editor (src/edit/) asks each build for, made with Obsidian's own parts: a
// button with a Lucide icon, and a question before a deletion. The web app has its own (web/app.js, web/dialogs.js).

/** A button with an optional Lucide icon, its tooltip, and what it does. */
function twButton(parent, text, tip, run, icon) {
  const b = parent.createEl('button', { attr: { type: 'button', 'aria-label': tip } });
  if (icon) {
    const i = b.createSpan({ cls: 'svg-icon-wrap' });
    setIcon(i, icon);
    // setIcon puts the svg inside the span; the panel's styles size an svg that is the button's own child
    const svg = i.querySelector('svg');
    if (svg) b.replaceChild(svg, i);
    else i.remove();
  }
  if (text) b.createSpan({ text });
  b.addEventListener('click', run);
  return b;
}

class TmConfirmModal extends Modal {
  constructor(app, title, message, action, done) {
    super(app);
    this.titleText = title;
    this.message = message;
    this.action = action;
    this.done = done;
    this.answer = false;
  }

  onOpen() {
    this.titleEl.setText(this.titleText);
    this.contentEl.createEl('p', { text: this.message });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    const go = buttons.createEl('button', { cls: 'mod-warning', text: this.action });
    go.addEventListener('click', () => {
      this.answer = true;
      this.close();
    });
    setTimeout(() => go.focus());
  }

  onClose() {
    this.contentEl.empty();
    this.done(this.answer);
  }
}

/** Ask before doing something that can't be undone. Resolves true to go ahead. Uses the open plugin's app. */
function twConfirm(title, message, action) {
  return new Promise((resolve) => new TmConfirmModal(tmApp, title, message, action, resolve).open());
}

// the app, for twConfirm (whose callers in src/edit/ don't know it): set when the plugin loads
let tmApp = null;

// ---- icon suggestions in the Icon field (edit/icon-suggest.js): Obsidian's own suggestion list, each icon drawn

class TmIconSuggest extends AbstractInputSuggest {
  constructor(app, inputEl, technology) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.technology = technology;
  }

  getSuggestions(query) {
    return twIconChoices(query, this.technology(), twIconNames());
  }

  renderSuggestion(name, el) {
    el.addClass('tm-icon-suggestion');
    setIcon(el.createSpan({ cls: 'tm-icon-suggestion-icon' }), name);
    el.createSpan({ text: name });
  }

  selectSuggestion(name) {
    this.inputEl.value = name;
    this.inputEl.dispatchEvent(new Event('input'));
    this.close();
  }
}

/** Every icon name Obsidian has (Lucide's, without the "lucide-" Obsidian puts before some). */
let tmIconNameList = null;
function twIconNames() {
  if (!tmIconNameList) tmIconNameList = [...new Set(getIconIds().map((id) => id.replace(/^lucide-/, '')))].filter((n) => TM_ICON_NAME.test(n)).sort();
  return tmIconNameList;
}

function twIconSuggest(input, technology) {
  new TmIconSuggest(tmApp, input, technology);
}
