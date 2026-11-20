// Tokens → the raw model: elements, zones, flows, threats, controls and scenarios as written, with line numbers.
// Names are checked later by tmBuildModel (model.js); this file only knows the grammar (docs/language.md).

const TM_KINDS = ['person', 'external', 'system', 'container', 'component', 'store', 'queue'];
const TM_ZONE_WORDS = ['zone'];
// the .flow format's words, no longer kinds: only named, so that a model still using one is told what to write
const TM_OLD_KINDS = { io: 'external', function: 'container', database: 'store', boundary: 'zone' };
// what may be nested inside each kind
const TM_CONTAINS = {
  system: ['container', 'component', 'store', 'queue'],
  container: ['component', 'store', 'queue'],
};
const TM_RESERVED = [...TM_KINDS, ...TM_ZONE_WORDS, 'threat', 'control', 'scenario'];

class TmParser {
  constructor(tokens) {
    this.t = tokens;
    this.i = 0;
    this.m = { attrs: {}, attrLines: {}, elements: [], zones: [], flows: [], threats: [], controls: [], scenarios: [] };
  }

  peek(n = 0) {
    return this.t[Math.min(this.i + n, this.t.length - 1)];
  }

  fail(message, tok = this.peek()) {
    throw new TmError(message, tok.line);
  }

  what(tok) {
    if (tok.kind === 'eof') return 'the end';
    if (tok.kind === 'string') return 'a string';
    if (tok.kind === 'tag') return `#${tok.value}`;
    return `"${tok.value}"`;
  }

  take(kind, label) {
    const tok = this.peek();
    if (tok.kind !== kind) this.fail(`expected ${label || kind}, found ${this.what(tok)}`);
    this.i++;
    return tok;
  }

  is(kind, value) {
    const tok = this.peek();
    return tok.kind === kind && (value === undefined || tok.value === value);
  }

  /** A new ID for an element, zone or scenario. */
  newId(what) {
    const tok = this.take('id', `an ID for the ${what}`);
    if (TM_RESERVED.includes(tok.value)) this.fail(`"${tok.value}" is a keyword, so it can't be an ID`, tok);
    return tok;
  }

  value() {
    const tok = this.peek();
    if (tok.kind === 'string' || tok.kind === 'number' || tok.kind === 'id' || tok.kind === 'tag') {
      this.i++;
      return { type: tok.kind, value: tok.value, line: tok.line };
    }
    if (tok.kind === '[') {
      this.i++;
      const items = [];
      while (!this.is(']')) {
        // a flow named in a list, for a threat's "on = [a -> b, …]": a -> b, with an optional label
        if (this.is('id') && this.peek(1).kind === 'arrow') {
          const a = this.take('id');
          const arrow = this.take('arrow');
          const b = this.take('id', 'the ID the flow goes to');
          const label = this.is('string') ? this.take('string').value : null;
          const fwd = arrow.value === '->';
          items.push({ type: 'flowref', from: fwd ? a.value : b.value, to: fwd ? b.value : a.value, label, line: a.line });
        } else items.push(this.value());
        if (this.is(']')) break;
        this.take(',', '"," or "]"');
      }
      this.i++;
      return { type: 'list', value: items, line: tok.line };
    }
    this.fail(`expected a value (a string, number, ID, #tag or [list]), found ${this.what(tok)}`);
  }

  attribute(owner) {
    const key = this.take('id');
    this.take('=', '"="');
    if (Object.prototype.hasOwnProperty.call(owner.attrs, key.value)) this.fail(`"${key.value}" is set twice`, key);
    owner.attrs[key.value] = this.value();
    if (owner.attrLines) owner.attrLines[key.value] = key.line;
    if (this.is(',')) this.i++; // "zone = web, icon = \"user\"": a comma between attributes is allowed
  }

  /** The optional title string and hashtags after a header. */
  titleAndTags() {
    const title = this.is('string') ? this.take('string').value : null;
    const tags = [];
    while (this.is('tag')) tags.push(this.take('tag').value);
    return { title, tags };
  }

  /** Statements until "}" (or the end, at the top level). where: top | zone | element | flow | threat | control | scenario. */
  body(where, ctx) {
    const end = where === 'top' ? 'eof' : '}';
    if (where !== 'top' && !this.is('{')) return;
    if (where !== 'top') this.take('{', '"{"');
    while (!this.is(end)) {
      if (this.is('eof')) this.fail('a block is never closed with "}"');
      this.statement(where, ctx);
    }
    this.i++;
  }

  statement(where, ctx) {
    const tok = this.peek();
    const next = this.peek(1);
    if (tok.kind !== 'id') this.fail(`expected an attribute, element, flow, threat, control or scenario, found ${this.what(tok)}`);
    if (next.kind === '=') return this.attribute(ctx.owner || this.m);
    if (where === 'threat' || where === 'control') this.fail(`only attributes can go inside a ${where}, not ${this.what(tok)}`);
    if (where === 'scenario') {
      if (next.kind === 'arrow') return this.step(ctx.owner);
      this.fail(`only steps (a -> b) and attributes can go inside a scenario, not ${this.what(tok)}`);
    }
    if (tok.value === 'threat' && (next.kind === 'string' || next.kind === 'id')) return this.threat(ctx);
    if (tok.value === 'control' && (next.kind === 'string' || next.kind === 'id')) {
      if (where !== 'top') this.fail('a control must be at the top level, not inside a block: list the threats it covers with "covers = [...]"');
      return this.control();
    }
    if (where === 'flow') this.fail(`only attributes and threats can go inside a flow, not ${this.what(tok)}`);
    if (next.kind === 'arrow') return this.flow(ctx);
    if (tok.value === 'scenario') {
      if (where !== 'top') this.fail('a scenario must be at the top level, not inside a block');
      return this.scenario();
    }
    if (TM_ZONE_WORDS.includes(tok.value)) {
      if (where === 'element') this.fail('a zone can\'t go inside an element: give the element "zone = …" instead');
      return this.zone(ctx);
    }
    if (TM_OLD_KINDS[tok.value] && (next.kind === 'id' || next.kind === 'string')) {
      this.fail(`"${tok.value}" was a word in the .flow format: write "${TM_OLD_KINDS[tok.value]}" instead`);
    }
    const kind = tok.value;
    if (TM_KINDS.includes(kind)) {
      if (where === 'element') {
        const parent = ctx.element;
        if (!(TM_CONTAINS[parent.kind] || []).includes(kind)) {
          this.fail(`a ${kind} can't go inside a ${parent.kind}${TM_CONTAINS[parent.kind] ? ` (only ${TM_CONTAINS[parent.kind].join(', ')})` : ''}`);
        }
      }
      return this.element(kind, ctx);
    }
    this.fail(`"${tok.value}" isn't a kind of element (${TM_KINDS.join(', ')}), zone, flow, threat, control or scenario`);
  }

  element(kind, ctx) {
    const kw = this.take('id');
    const id = this.newId(kind);
    const { title, tags } = this.titleAndTags();
    const e = {
      id: id.value,
      kind,
      written: kw.value,
      title,
      tags,
      attrs: {},
      parent: ctx.element ? ctx.element.id : null,
      zoneBlock: ctx.zone || null,
      threats: [],
      line: kw.line,
    };
    this.m.elements.push(e);
    this.body('element', { owner: e, element: e, zone: ctx.zone });
  }

  zone(ctx) {
    const kw = this.take('id');
    const id = this.newId('zone');
    const { title, tags } = this.titleAndTags();
    const z = { id: id.value, title, tags, attrs: {}, parent: ctx.zone || null, threats: [], line: kw.line };
    this.m.zones.push(z);
    this.body('zone', { owner: z, zone: z.id });
  }

  flow(ctx) {
    const a = this.take('id');
    const arrow = this.take('arrow');
    const b = this.take('id', 'the ID the flow goes to');
    const { title, tags } = this.titleAndTags();
    const forward = arrow.value === '->';
    const f = { from: forward ? a.value : b.value, to: forward ? b.value : a.value, label: title, tags, attrs: {}, threats: [], line: a.line };
    this.m.flows.push(f);
    this.body('flow', { owner: f, flow: f, zone: ctx.zone, element: ctx.element });
  }

  threat(ctx) {
    const kw = this.take('id');
    const id = this.is('id') ? this.take('id').value : null;
    if (!this.is('string')) this.fail(`expected the threat's title (a string), found ${this.what(this.peek())}`);
    const { title, tags } = this.titleAndTags();
    let target = { type: 'model', id: null };
    if (ctx.flow) target = { type: 'flow', flow: ctx.flow };
    else if (ctx.owner && ctx.element === ctx.owner) target = { type: 'element', id: ctx.element.id };
    else if (ctx.owner && ctx.zone && ctx.owner.id === ctx.zone) target = { type: 'zone', id: ctx.zone };
    const t = { id, title, tags, attrs: {}, target, line: kw.line };
    this.m.threats.push(t);
    if (ctx.owner && ctx.owner !== this.m && ctx.owner.threats) ctx.owner.threats.push(t);
    this.body('threat', { owner: t });
  }

  /** control C01 "Title" #implemented { covers = [T01, T02] … }: something done (or to be done) about threats. */
  control() {
    const kw = this.take('id');
    if (!this.is('id')) this.fail('a control needs an ID, so threats can name it: control C01 "…"');
    const id = this.take('id').value;
    if (!this.is('string')) this.fail(`expected the control's title (a string), found ${this.what(this.peek())}`);
    const { title, tags } = this.titleAndTags();
    const c = { id, title, tags, attrs: {}, line: kw.line };
    this.m.controls.push(c);
    this.body('control', { owner: c });
  }

  scenario() {
    const kw = this.take('id');
    const id = this.newId('scenario');
    const { title, tags } = this.titleAndTags();
    const s = { id: id.value, title, tags, attrs: {}, steps: [], line: kw.line };
    this.m.scenarios.push(s);
    if (!this.is('{')) this.fail('a scenario needs a block of steps: { a -> b … }');
    this.body('scenario', { owner: s });
  }

  step(s) {
    const a = this.take('id');
    const arrow = this.take('arrow');
    const b = this.take('id', 'the ID the step goes to');
    const label = this.is('string') ? this.take('string').value : null;
    const forward = arrow.value === '->';
    s.steps.push({ from: forward ? a.value : b.value, to: forward ? b.value : a.value, label, line: a.line });
  }

  parse() {
    this.body('top', { owner: this.m });
    return this.m;
  }
}

/** The raw model, or a thrown TmError (with .line). */
function tmParse(src) {
  return new TmParser(tmLex(src)).parse();
}
