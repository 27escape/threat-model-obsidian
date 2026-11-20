// Load the plugin's real source files in a sandbox with a tiny Obsidian stand-in
// and return the named top-level values.
import fs from 'node:fs';
import vm from 'node:vm';

const o = JSON.parse(fs.readFileSync(new URL('../tools/files.json', import.meta.url), 'utf8'));
class Stub {}
// a component (toggle, dropdown, text box) whose methods all chain, for the settings page
const chain = () => new Proxy(function () {}, { get: () => chain(), apply: () => chain() });
// records each setting the settings page makes, so a test can list them
class Setting {
  constructor() {
    Setting.made.push(this);
  }
  setName(n) {
    this.name = n;
    return this;
  }
  setDesc() {
    return this;
  }
  setHeading() {
    this.heading = true;
    return this;
  }
}
Setting.made = [];
for (const m of ['addToggle', 'addDropdown', 'addText', 'addSearch', 'addButton'])
  Setting.prototype[m] = function (cb) {
    cb(chain());
    return this;
  };
const stubModule = (extra = {}) => new Proxy(extra, { get: (t, k) => (k in t ? t[k] : Stub) });
const modules = {
  obsidian: stubModule({ Setting, normalizePath: (p) => p.replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '') }),
  '@codemirror/view': stubModule({ ViewPlugin: { fromClass: (c) => c }, Decoration: { mark: (s) => s } }),
  '@codemirror/state': stubModule({
    // collects what the editor extension adds, so a test can read it back
    RangeSetBuilder: class {
      constructor() {
        this.added = [];
      }
      add(from, to, deco) {
        this.added.push({ from, to, deco });
      }
      finish() {
        return this.added;
      }
    },
  }),
};
const require = (r) => {
  if (r in modules) return modules[r];
  throw new Error('no ' + r);
};

/** Every source file in build order; names: the top-level values to return. */
export function load(names) {
  const code = o.js.map((f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n') + `\n;({ ${names.join(', ')} })`;
  const out = vm.runInNewContext(code, { require, module: {}, window: { setTimeout, clearTimeout }, console });
  // results come from another realm, so deepEqual would see different Array/Object; copy plain data into this one
  const local = (v) => {
    try {
      return structuredClone(v);
    } catch {
      return v;
    }
  };
  for (const k of Object.keys(out)) if (typeof out[k] === 'function' && !/^class\b/.test(String(out[k]))) {
    const f = out[k];
    out[k] = (...a) => local(f(...a));
  }
  return out;
}
