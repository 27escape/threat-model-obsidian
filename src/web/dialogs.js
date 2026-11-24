// The web app's dialogs: asking for a name, confirming a deletion, and About. Built with <dialog>, as plain DOM
// (no HTML strings). Each returns a promise that settles when the dialog closes.

/** A dialog with a heading; fill(body, close) adds its content. Resolves with what close() was given. */
function twDialog(title, fill) {
  return new Promise((resolve) => {
    const d = document.body.createEl('dialog', { cls: 'tw-dialog' });
    d.createEl('h2', { text: title });
    const body = d.createDiv({ cls: 'tw-dialog-body' });
    let result;
    const close = (value) => {
      result = value;
      d.close();
    };
    d.addEventListener('close', () => {
      d.remove();
      resolve(result);
    });
    fill(body, close);
    d.showModal();
  });
}

/** Ask for a name; check(name) gives a problem to show, or ''. Resolves with the trimmed name, or null. */
function twAskName(title, { value = '', action = 'Save', help = '', check = () => '' } = {}) {
  return twDialog(title, (body, close) => {
    const form = body.createEl('form', { cls: 'tw-form' });
    if (help) form.createEl('p', { cls: 'tw-help', text: help });
    const label = form.createEl('label', { text: 'Name' });
    const input = label.createEl('input', { type: 'text', value, attr: { maxlength: TW_NAME_MAX, autocomplete: 'off', spellcheck: 'false' } });
    const problem = form.createDiv({ cls: 'tw-problem' });
    problem.setAttr('role', 'alert');
    const buttons = form.createDiv({ cls: 'tw-buttons' });
    buttons.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => close(null));
    buttons.createEl('button', { type: 'submit', cls: 'mod-cta', text: action });
    const say = () => problem.setText(check(input.value.trim()));
    input.addEventListener('input', say);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      const p = check(name);
      if (p) return problem.setText(p);
      close(name);
    });
    setTimeout(() => {
      input.focus();
      input.select();
    });
  });
}

/** Ask before doing something that can't be undone. Resolves true to go ahead. */
function twConfirm(title, message, action) {
  return twDialog(title, (body, close) => {
    body.createEl('p', { text: message });
    const buttons = body.createDiv({ cls: 'tw-buttons' });
    buttons.createEl('button', { type: 'button', text: 'Cancel' }).addEventListener('click', () => close(false));
    const go = buttons.createEl('button', { type: 'button', cls: 'mod-warning', text: action });
    go.addEventListener('click', () => close(true));
    setTimeout(() => go.focus());
  }).then((v) => v === true);
}

const TW_REPO = 'https://github.com/27escape/threat-model-obsidian';

/** What the page is, what it keeps where, and what it is built from. */
function twAbout() {
  return twDialog('About Threat Modelling', (body, close) => {
    const p = (text) => body.createEl('p', { text });
    const link = (parent, text, href) => parent.createEl('a', { text, href, attr: { target: '_blank', rel: 'noopener' } });
    p('Write a threat model in a small text language and see it as diagrams: a C4-style Structure view, a Sequence view of a scenario, and a Data flow view with trust zones. Each shows its threats, coloured by risk, with the threat register underneath. Report downloads the whole model as a report in Markdown.');
    const plugin = body.createEl('p', { text: 'This is the web version of the ' });
    link(plugin, 'Threat Modelling plugin for Obsidian', TW_REPO);
    plugin.appendText('. Models move freely between the two: download a .threat file and drop it into your vault, or copy the model as a code block and paste it into a note. The ');
    link(plugin, 'language reference', `${TW_REPO}/blob/main/docs/language.md`);
    plugin.appendText(' describes everything a model can say.');

    body.createEl('h3', { text: 'Where your models are kept' });
    const ul = body.createEl('ul');
    for (const t of [
      'Nothing leaves your browser. The page sends nothing anywhere, and works without a connection once loaded.',
      'Your models are saved in this browser’s storage, on this device only. They don’t follow you to another browser or computer.',
      'Clearing this site’s data in your browser deletes them, and a private window forgets them when it closes.',
      'Download is your backup: it saves a model as a .threat file you can open here again, or use in Obsidian.',
      'Use the page from its web address. Opened as a file from your computer, some browsers won’t let it save.',
    ])
      ul.createEl('li', { text: t });

    body.createEl('h3', { text: 'Built with' });
    const made = body.createEl('p', { text: 'Diagrams are drawn by ' });
    link(made, 'Pele', 'https://pele.run');
    made.appendText(' (MIT licence), the renderer Obsidian uses; icons are from ');
    link(made, 'Lucide', 'https://lucide.dev');
    made.appendText(' (ISC licence). Threat Modelling is by Kevin Mulholland, MIT licence.');

    const buttons = body.createDiv({ cls: 'tw-buttons' });
    const ok = buttons.createEl('button', { type: 'button', cls: 'mod-cta', text: 'Close' });
    ok.addEventListener('click', () => close());
    setTimeout(() => ok.focus());
  });
}
