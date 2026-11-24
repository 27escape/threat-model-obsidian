// The report in the page: the plugin's own report (report.js), which in Obsidian becomes a note, shown here as a
// document to read, print (or save as PDF from the print dialog) or download as Markdown. Its diagrams are drawn with
// Pele and coloured as in Obsidian; threat and control IDs link to their entries in the register.

function twShowReport(app, name, text) {
  const life = new Component();
  life.load();
  twDialog(name.replace(/\.md$/, ''), (body, close, dialog, tools) => {
    twButton(tools, 'Print or save as PDF', 'Print the report, or choose “Save as PDF” in the print dialog', () => window.print(), 'printer');
    twButton(tools, 'Download Markdown', 'The report as a Markdown file, as Obsidian saves it', () => twDownload(name, text), 'download');
    // the toolbar first, then the close button
    tools.appendChild(tools.querySelector('.tw-menu-close'));
    const doc = body.createDiv({ cls: 'tw-report tm-vars' });
    twMarkdownInto(doc, text, {
      draw: (el, mermaid) => {
        const host = el.createDiv({ cls: 'mermaid' });
        try {
          const mounted = pele.mount(host, mermaid);
          life.register(() => mounted.destroy());
        } catch (e) {
          host.setText(`The diagram couldn’t be drawn: ${e.message}`);
        }
      },
    });
    life.register(tmColourStrideSoon(doc, null, true) || (() => {}));
    // IDs in the text and on the diagrams jump to the register
    doc.addEventListener('click', (e) => {
      const a = e.target instanceof Element && e.target.closest('a.tw-md-ref');
      if (!a) return;
      e.preventDefault();
      const to = doc.querySelector(`[id="${CSS.escape(a.getAttribute('href').slice(1))}"]`);
      if (to) {
        to.scrollIntoView({ block: 'center', behavior: 'smooth' });
        to.removeClass('tm-flash');
        void to.offsetWidth;
        to.addClass('tm-flash');
      }
    });
    // printing: a dialog over the page prints as one screenful, so a copy of the report goes in the page itself while
    // it prints (from the button or the browser's own Print), and only that copy is printed
    let copy = null;
    const before = () => {
      copy = document.body.createDiv({ cls: 'tw-print' });
      copy.createEl('h1', { text: name.replace(/\.md$/, '') });
      copy.appendChild(doc.cloneNode(true));
      document.body.addClass('tw-printing-report');
    };
    const after = () => {
      if (copy) copy.remove();
      copy = null;
      document.body.removeClass('tw-printing-report');
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    life.register(() => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      after();
    });
  }, { wide: true, cls: 'tw-report-dialog' }).then(() => life.unload());
  app.say('Report ready: print it, save it as PDF, or download it');
}
