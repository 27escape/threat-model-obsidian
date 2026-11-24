// Help: the keyboard shortcuts and the language reference (docs/language.md, put in the page as TW_LANGUAGE by
// tools/build-web.mjs, without its pictures), in a wide dialog with a list of its sections to jump to.

function twHelp() {
  if (document.querySelector('dialog.tw-help-dialog[open]')) return Promise.resolve();
  return twDialog(
    'Help',
    (body) => {
      const nav = body.createEl('nav', { cls: 'tw-help-nav', attr: { 'aria-label': 'Sections' } });
      const doc = body.createDiv({ cls: 'tw-help-doc tw-md' });

      doc.createEl('h3', { text: 'Keyboard shortcuts', attr: { id: 'tw-help-keys' } });
      const table = doc.createEl('table', { cls: 'tw-keys' });
      for (const [keys, what] of TW_SHORTCUTS) {
        const tr = table.createEl('tr');
        const th = tr.createEl('th');
        keys.split(/( or |\+)/).forEach((part) => (part === '+' || part === ' or ' ? th.appendText(part === '+' ? '+' : ' or ') : th.createEl('kbd', { text: part })));
        tr.createEl('td', { text: what });
      }
      doc.createEl('p', {
        cls: 'tw-note',
        text: 'Click a box, a zone or an arrow on a diagram to change it; click a threat’s ID to change the threat. Click “Line N” on an error or a warning to go to that line in the text.',
      });

      twMarkdownInto(doc, TW_LANGUAGE);
      // the sections to jump to (Markdown's ## sections are h3 here: markdown.js puts its headings a level down)
      for (const h of doc.querySelectorAll('h3')) {
        if (!h.id) h.id = `tw-help-${(h.textContent || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const a = nav.createEl('a', { text: h.textContent, href: `#${h.id}` });
        a.addEventListener('click', (e) => {
          e.preventDefault();
          h.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      }
      // links within the reference scroll inside the dialog rather than changing the page's address
      doc.addEventListener('click', (e) => {
        const a = e.target instanceof Element && e.target.closest('a[href^="#"]');
        if (!a) return;
        e.preventDefault();
        const to = doc.querySelector(`[id="${CSS.escape(decodeURIComponent(a.getAttribute('href').slice(1)))}"]`);
        if (to) to.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    },
    { wide: true, cls: 'tw-help-dialog' }
  );
}
