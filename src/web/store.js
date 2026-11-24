// The user's own models, kept in this browser's local storage under one key, with a version number so the format
// can change later without losing anything: { version: 1, models: { "<name>": { text, updated } } }. Plus the model
// that was open last. Storage can be missing, full or switched off (some browsers, private windows, pages opened from
// disk): every call copes, and says so, rather than failing.

const TW_STORE_KEY = 'threat-modelling:models';
const TW_LAST_KEY = 'threat-modelling:last';
const TW_PREFS_KEY = 'threat-modelling:ui'; // how the page is laid out, such as whether the text is shown
const TW_NAME_MAX = 80;

class TwStore {
  constructor(storage) {
    this.storage = storage || null;
    this.ok = this.works();
    this.data = this.read();
  }

  /** Whether storage can be written here (it may be switched off, or throw in a private window). */
  works() {
    try {
      if (!this.storage) return false;
      const k = `${TW_STORE_KEY}:test`;
      this.storage.setItem(k, '1');
      this.storage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  read() {
    try {
      const raw = this.ok && this.storage.getItem(TW_STORE_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.version === 1 && d.models && typeof d.models === 'object') return d;
    } catch {
      // unreadable: start empty, and don't overwrite it until something is saved
    }
    return { version: 1, models: {} };
  }

  /** Write everything back; false (with the reason in this.error) if the browser refused. */
  write() {
    if (!this.ok) {
      this.error = 'This browser isn’t letting the page save. Use Download to keep a copy.';
      return false;
    }
    try {
      this.storage.setItem(TW_STORE_KEY, JSON.stringify(this.data));
      this.error = '';
      return true;
    } catch (e) {
      this.error = /quota/i.test(String(e && e.name)) ? 'The browser’s storage for this page is full. Download and delete some models.' : `Couldn’t save: ${e.message}`;
      return false;
    }
  }

  /** The names of the user's models, A to Z. */
  names() {
    return Object.keys(this.data.models).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  get(name) {
    const m = this.data.models[name];
    return m ? m.text : null;
  }

  has(name) {
    const n = name.toLowerCase();
    return Object.keys(this.data.models).some((k) => k.toLowerCase() === n);
  }

  /** What is wrong with a name for a new model (or for renaming `except`), or '' if it is fine. */
  problem(name, except) {
    const n = String(name || '').trim();
    if (!n) return 'Give it a name.';
    if (n.length > TW_NAME_MAX) return `Keep the name under ${TW_NAME_MAX} characters.`;
    if (/[\\/:*?"<>|#^[\]]/.test(n)) return 'A name can’t contain \\ / : * ? " < > | # ^ [ or ].';
    if (this.has(n) && (!except || except.toLowerCase() !== n.toLowerCase())) return 'There is already a model with that name.';
    return '';
  }

  /** A name not yet used, from a wish: "Shop" → "Shop 2" → "Shop 3". */
  free(wish) {
    const base = String(wish || 'Untitled').trim().replace(/[\\/:*?"<>|#^[\]]/g, '-').slice(0, TW_NAME_MAX - 4) || 'Untitled';
    if (!this.has(base)) return base;
    for (let i = 2; ; i++) if (!this.has(`${base} ${i}`)) return `${base} ${i}`;
  }

  save(name, text) {
    this.data.models[name] = { text, updated: new Date().toISOString() };
    return this.write();
  }

  rename(from, to) {
    if (!this.data.models[from]) return false;
    const m = this.data.models[from];
    delete this.data.models[from];
    this.data.models[to] = m;
    return this.write();
  }

  remove(name) {
    delete this.data.models[name];
    return this.write();
  }

  /** The model open last: { kind: 'example' | 'mine', name }, or null. */
  last() {
    try {
      const l = this.ok && JSON.parse(this.storage.getItem(TW_LAST_KEY) || 'null');
      return l && (l.kind === 'example' || l.kind === 'mine') && typeof l.name === 'string' ? l : null;
    } catch {
      return null;
    }
  }

  /** A layout preference, or `fallback` when none is kept. */
  pref(key, fallback) {
    try {
      const p = this.ok && JSON.parse(this.storage.getItem(TW_PREFS_KEY) || '{}');
      return p && Object.prototype.hasOwnProperty.call(p, key) ? p[key] : fallback;
    } catch {
      return fallback;
    }
  }

  setPref(key, value) {
    try {
      if (!this.ok) return;
      const p = JSON.parse(this.storage.getItem(TW_PREFS_KEY) || '{}') || {};
      p[key] = value;
      this.storage.setItem(TW_PREFS_KEY, JSON.stringify(p));
    } catch {
      // a layout preference isn't worth troubling anyone about
    }
  }

  setLast(kind, name) {
    try {
      if (this.ok) this.storage.setItem(TW_LAST_KEY, JSON.stringify({ kind, name }));
    } catch {
      // not worth troubling anyone about
    }
  }
}
