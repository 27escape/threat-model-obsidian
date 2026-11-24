// The web app's stand-in for Obsidian: just enough of its API for the plugin's own code (TmBlock, the threat register,
// the key, the STRIDE colouring and icons, the report) to run unchanged in a page. Diagrams are drawn with Pele, the
// same renderer Obsidian uses (bundled into the page as the global "pele"); icons come from Lucide, bundled as
// TW_LUCIDE (name -> list of [tag, attributes]). Nothing here fetches anything.

// ---- Obsidian's helpers on DOM elements (createEl, createDiv, empty, addClass, …)
(() => {
  const apply = (el, o) => {
    if (typeof o === 'string') o = { cls: o };
    if (!o) return el;
    if (o.cls) el.classList.add(...(Array.isArray(o.cls) ? o.cls : String(o.cls).split(/\s+/)).filter(Boolean));
    if (o.text !== undefined) el.textContent = String(o.text);
    if (o.title) el.title = o.title;
    if (o.value !== undefined) el.value = o.value;
    if (o.type) el.type = o.type;
    if (o.href) el.setAttribute('href', o.href);
    if (o.placeholder) el.placeholder = o.placeholder;
    if (o.attr) for (const [k, v] of Object.entries(o.attr)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
    return el;
  };
  const P = Node.prototype;
  P.createEl = function (tag, o, cb) {
    const el = apply(document.createElement(tag), o);
    if (o && o.prepend) this.insertBefore(el, this.firstChild);
    else this.appendChild(el);
    if (cb) cb(el);
    return el;
  };
  P.createDiv = function (o, cb) {
    return this.createEl('div', o, cb);
  };
  P.createSpan = function (o, cb) {
    return this.createEl('span', o, cb);
  };
  P.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  P.appendText = function (t) {
    this.appendChild(document.createTextNode(String(t)));
  };
  P.setText = function (t) {
    this.textContent = String(t);
  };
  const E = Element.prototype;
  E.addClass = function (...c) {
    this.classList.add(...c);
  };
  E.removeClass = function (...c) {
    this.classList.remove(...c);
  };
  E.toggleClass = function (c, on) {
    this.classList.toggle(c, !!on);
  };
  E.hasClass = function (c) {
    return this.classList.contains(c);
  };
  E.setAttr = function (k, v) {
    if (v === null || v === undefined) this.removeAttribute(k);
    else this.setAttribute(k, String(v));
  };
})();

// ---- Components: things with a lifetime, which clean up after themselves
class Component {
  constructor() {
    this._children = [];
    this._cleanups = [];
    this._loaded = false;
  }
  load() {
    if (this._loaded) return;
    this._loaded = true;
    this.onload();
    for (const c of this._children) c.load();
  }
  unload() {
    if (!this._loaded) return;
    this._loaded = false;
    for (const c of this._children.splice(0)) c.unload();
    for (const f of this._cleanups.splice(0)) {
      try {
        f();
      } catch (e) {
        console.error(e);
      }
    }
    this.onunload();
  }
  onload() {}
  onunload() {}
  addChild(c) {
    this._children.push(c);
    if (this._loaded) c.load();
    return c;
  }
  removeChild(c) {
    const i = this._children.indexOf(c);
    if (i >= 0) this._children.splice(i, 1);
    c.unload();
    return c;
  }
  register(f) {
    if (typeof f === 'function') this._cleanups.push(f);
  }
  registerDomEvent(el, type, f, o) {
    el.addEventListener(type, f, o);
    this.register(() => el.removeEventListener(type, f, o));
  }
}

class MarkdownRenderChild extends Component {
  constructor(containerEl) {
    super();
    this.containerEl = containerEl;
  }
}

// The plugin's classes for Obsidian that the page never uses, but whose files are loaded
class Plugin extends Component {}
class PluginSettingTab {}
class TextFileView extends Component {}
class AbstractInputSuggest {}
class TFolder {}
class Setting {}
const ViewPlugin = { fromClass: () => null };
const Decoration = { mark: () => null };
class RangeSetBuilder {}
const editorInfoField = null;

const normalizePath = (p) => String(p).replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '');

// ---- Notices: a short message at the bottom of the page
class Notice {
  constructor(message, ms = 4000) {
    let box = document.querySelector('.tw-notices');
    if (!box) box = document.body.createDiv({ cls: 'tw-notices' });
    // the plugin's report message names a note in the vault; in the page the report is a download
    const saved = /^Saved the report as (?:.*\/)?(.+)$/.exec(message);
    if (saved && twApp.onReport) return; // the page shows the report itself
    if (saved) message = `Downloaded the report: ${saved[1]}`;
    const n = box.createDiv({ cls: 'tw-notice', text: message });
    n.setAttr('role', 'status');
    setTimeout(() => n.remove(), ms);
  }
}

// ---- Icons, from the bundled Lucide set, as Obsidian's getIcon gives them
function getIcon(name) {
  const n = String(name).replace(/^lucide-/, '');
  const nodes = typeof TW_LUCIDE !== 'undefined' && (TW_LUCIDE[n] || TW_LUCIDE[TW_LUCIDE_ALIASES[n]]);
  if (!nodes) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const attrs = { xmlns: NS, width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: `svg-icon lucide-${name}` };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
  for (const [tag, a] of nodes) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}

// ---- Rendering Markdown: the plugin only ever asks for a ```mermaid block, which is drawn with Pele
const MarkdownRenderer = {
  render(app, markdown, el, sourcePath, component) {
    const m = /^```mermaid\n([\s\S]*?)\n```\s*$/.exec(markdown);
    if (!m) {
      el.createEl('pre', { text: markdown });
      return Promise.resolve();
    }
    const host = el.createDiv({ cls: 'mermaid' });
    try {
      const mounted = pele.mount(host, m[1], {
        onError: (e) => {
          host.empty();
          host.createDiv({ cls: 'tm-errors', text: `The diagram couldn't be drawn: ${e && e.message ? e.message : e}` });
        },
      });
      if (component) component.register(() => mounted.destroy());
    } catch (e) {
      host.createDiv({ cls: 'tm-errors', text: `The diagram couldn't be drawn: ${e.message}` });
    }
    return Promise.resolve();
  },
};

// ---- The "app" the plugin's code is given: a vault whose only write is a download (the report)
function twDownload(name, text, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.body.createEl('a', { href: url, attr: { download: name } });
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const twApp = {
  onReport: null, // set by the page: what to do with a report instead of saving it as a note
  vault: {
    getAbstractFileByPath: () => null,
    createFolder: async () => {},
    create: async (path, text) => {
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (twApp.onReport) twApp.onReport(name, text); // the page shows it (report-view.js)
      else twDownload(name, text);
      return { path: name };
    },
  },
  workspace: { getLeaf: () => ({ openFile: async () => {} }), openLinkText: () => {}, trigger: () => {} },
};
