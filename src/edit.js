// The edit engine: changes to a model's text that touch only what they must, keeping the user's comments, spacing
// and layout everywhere else. Pure functions, text in and text out, with no Obsidian and no DOM, for the web app and
// the plugin alike. Each works from where the parser found things (parse.js: .src and .attrSpans) and parses the
// text afresh first, so they can be chained. A text that doesn't parse can't be edited (a TmError is thrown).
//
// Things are named by a ref: { type: 'model' } | { type: 'element' | 'zone' | 'control' | 'scenario', id }
//   | { type: 'threat', id } (or { type: 'threat', index } for a threat without an ID, counting from 0)
//   | { type: 'flow', n } (as numbered in the views, from 1)
// Values for attributes are JavaScript: a string (written quoted), a number, true or false, { id: 'web' } (a bare
// ID), { tag: 'pii' }, { flow: { from, to, label } } (in a threat's "on"), or an array of these.
// Higher-level edits for threats, built from these, are in edit-threat.js.

class TmEditError extends Error {}

/** The raw model of a text, with positions; throws a TmError if it doesn't parse. */
const tmEditParse = (text) => tmParse(text);

/** The raw item a ref names, or a TmEditError. The model itself is the raw model. */
function tmEditFind(raw, ref) {
  const byId = (list, what) => {
    const x = list.find((i) => i.id === ref.id);
    if (!x) throw new TmEditError(`there is no ${what} ${ref.id}`);
    return x;
  };
  switch (ref.type) {
    case 'model':
      return raw;
    case 'element':
      return byId(raw.elements, 'element');
    case 'zone':
      return byId(raw.zones, 'zone');
    case 'control':
      return byId(raw.controls, 'control');
    case 'scenario':
      return byId(raw.scenarios, 'scenario');
    case 'threat': {
      const t = ref.id ? raw.threats.find((x) => x.id === ref.id) : raw.threats[ref.index];
      if (!t) throw new TmEditError(`there is no threat ${ref.id || `number ${ref.index + 1}`}`);
      return t;
    }
    case 'flow': {
      const f = raw.flows[ref.n - 1];
      if (!f) throw new TmEditError(`there is no flow ${ref.n}`);
      return f;
    }
    default:
      throw new TmEditError(`"${ref.type}" isn't something that can be edited`);
  }
}

// ---- writing values

/** A string as the language writes it: "…", or `…` when it has a " or a line break (strings have no escapes). */
function tmQuote(s) {
  s = String(s);
  if (!/["\n]/.test(s)) return `"${s}"`;
  if (!s.includes('`')) return `\`${s}\``;
  return `"${s.replace(/"/g, '”').replace(/\n/g, ' ')}"`; // both kinds of quote and a break: the best we can do
}

/** A value as the language writes it. */
function tmFormatValue(v) {
  if (typeof v === 'string') return tmQuote(v);
  if (typeof v === 'number' && isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.map(tmFormatValue).join(', ')}]`;
  if (v && typeof v === 'object') {
    if (typeof v.id === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(v.id)) return v.id;
    if (typeof v.tag === 'string' && /^[A-Za-z_][A-Za-z0-9_/-]*$/.test(v.tag)) return `#${v.tag}`;
    if (v.flow) return `${v.flow.from} -> ${v.flow.to}${v.flow.label ? ` ${tmQuote(v.flow.label)}` : ''}`;
  }
  throw new TmEditError(`can't write ${JSON.stringify(v)} as a value`);
}

// ---- text helpers

const tmSplice = (text, from, to, insert) => text.slice(0, from) + insert + text.slice(to);
const tmLineStart = (text, at) => text.lastIndexOf('\n', at - 1) + 1;
function tmLineEnd(text, at) {
  const n = text.indexOf('\n', at);
  return n < 0 ? text.length : n;
}
/** The indentation of the line `at` is on. */
const tmIndentAt = (text, at) => /^[ \t]*/.exec(text.slice(tmLineStart(text, at)))[0];
/** Whether only spaces and tabs come between the start of the line and `at`. */
const tmOnlySpaceBefore = (text, at) => /^[ \t]*$/.test(text.slice(tmLineStart(text, at), at));

/** One step of indentation in this text: the smallest indent used, or two spaces. */
function tmIndentUnit(text) {
  let best = null;
  for (const m of text.matchAll(/^([ \t]+)\S/gm)) if (!best || m[1].length < best.length) best = m[1];
  return best || '  ';
}

/** A statement written over several lines, its later lines indented by `indent`. */
const tmIndentLines = (s, indent) => s.split('\n').map((l, i) => (i && l ? indent + l : l)).join('\n');

/** After something is removed at `at`: if that leaves a block with nothing in it, take the block away too. */
function tmDropEmptyBlock(text, at) {
  let a = at;
  while (a > 0 && /\s/.test(text[a - 1])) a--;
  let b = at;
  while (b < text.length && /\s/.test(text[b])) b++;
  if (text[a - 1] !== '{' || text[b] !== '}') return text;
  let from = a - 1;
  while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--;
  return tmSplice(text, from, b + 1, '');
}

/** Remove [from, to): the whole line(s) when nothing else is on them, otherwise just it and the spaces after it. */
function tmRemoveRange(text, from, to) {
  const ls = tmLineStart(text, from);
  const le = tmLineEnd(text, to);
  if (tmOnlySpaceBefore(text, from) && /^[ \t]*$/.test(text.slice(to, le))) {
    return tmDropEmptyBlock(tmSplice(text, ls, Math.min(le + 1, text.length), ''), ls);
  }
  let end = to;
  while (text[end] === ' ' || text[end] === '\t') end++;
  let start = from;
  // removed from the end of a line or just before "}": don't leave spaces behind
  if (text[end] === '\n' || text[end] === '}' || end >= text.length) while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
  let out = tmSplice(text, start, end, '');
  if (out[start] === '}' && out[start - 1] !== ' ' && out[start - 1] !== '{') out = tmSplice(out, start, start, ' ');
  return tmDropEmptyBlock(out, start);
}

// ---- edits

/**
 * Put a statement (an attribute "key = value", or a threat, which may run over several lines) inside the block of
 * the item a ref names, making the block if there isn't one; for the model, at the end of the text.
 */
function tmInsertInto(text, ref, statement) {
  const raw = tmEditParse(text);
  const unit = tmIndentUnit(text);
  if (ref.type === 'model') {
    const body = text.replace(/\s*$/, '');
    return `${body}${body ? '\n\n' : ''}${statement}\n`;
  }
  const item = tmEditFind(raw, ref);
  const indent = tmIndentAt(text, item.src.from);
  const child = indent + unit;
  const multi = statement.includes('\n');
  const block = item.src.block;
  if (!block) {
    const add = multi ? ` {\n${child}${tmIndentLines(statement, child)}\n${indent}}` : ` { ${statement} }`;
    return tmSplice(text, item.src.head, item.src.head, add);
  }
  const inner = text.slice(block.open + 1, block.close);
  if (!inner.trim()) return tmSplice(text, block.open, block.close + 1, multi ? `{\n${child}${tmIndentLines(statement, child)}\n${indent}}` : `{ ${statement} }`);
  if (!inner.includes('\n')) {
    // a block on one line: keep it on one line for an attribute (the user's choice), open it out for anything more
    let at = block.close;
    while (text[at - 1] === ' ' || text[at - 1] === '\t') at--;
    if (!multi) return tmSplice(text, at, block.close, `  ${statement} `);
    return tmSplice(text, block.open, block.close + 1, `{\n${child}${inner.trim()}\n${child}${tmIndentLines(statement, child)}\n${indent}}`);
  }
  // a block over several lines: a new line before the "}"
  if (tmOnlySpaceBefore(text, block.close)) {
    const at = tmLineStart(text, block.close);
    return tmSplice(text, at, at, `${child}${tmIndentLines(statement, child)}\n`);
  }
  return tmSplice(text, block.close, block.close, `\n${child}${tmIndentLines(statement, child)}\n${indent}`);
}

/** Set an attribute (changing only its value if it is there), or remove it with value null. */
function tmSetAttr(text, ref, key, value) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new TmEditError(`"${key}" can't be an attribute name`);
  const item = tmEditFind(tmEditParse(text), ref);
  const span = (item.attrSpans || {})[key];
  if (value === null || value === undefined) {
    if (!span) return text;
    return tmRemoveRange(text, span.from, span.comma !== null ? span.comma + 1 : span.to);
  }
  const v = tmFormatValue(value);
  if (span) return tmSplice(text, span.valueFrom, span.valueTo, v);
  return tmInsertInto(text, ref, `${key} = ${v}`);
}

/** Set the title (a flow's label) in its header, or in its title attribute if it is given that way. */
function tmSetTitle(text, ref, title) {
  if (ref.type === 'model') return tmSetAttr(text, ref, 'title', title);
  const item = tmEditFind(tmEditParse(text), ref);
  if (item.attrSpans && item.attrSpans.title) return tmSetAttr(text, ref, 'title', title);
  if (item.attrSpans && item.attrSpans.label && ref.type === 'flow' && !item.src.title) return tmSetAttr(text, ref, 'label', title);
  const q = tmQuote(title);
  if (item.src.title) return tmSplice(text, item.src.title.from, item.src.title.to, q);
  if (item.src.tags.length) return tmSplice(text, item.src.tags[0].from, item.src.tags[0].from, `${q} `);
  return tmSplice(text, item.src.head, item.src.head, ` ${q}`);
}

/** Add a hashtag to the header (after the title and the other tags), unless it is there already. */
function tmAddTag(text, ref, tag) {
  if (!/^[A-Za-z_][A-Za-z0-9_/-]*$/.test(tag)) throw new TmEditError(`"#${tag}" isn't a hashtag`);
  const item = tmEditFind(tmEditParse(text), ref);
  if (!item.src) throw new TmEditError('the model has no header for tags');
  if (item.src.tags.some((t) => t.value === tag)) return text;
  return tmSplice(text, item.src.head, item.src.head, ` #${tag}`);
}

/** Remove the header hashtags for which drop(tag) is true. */
function tmRemoveTags(text, ref, drop) {
  const item = tmEditFind(tmEditParse(text), ref);
  if (!item.src) return text;
  for (const t of [...item.src.tags].reverse().filter((x) => drop(x.value))) {
    let from = t.from;
    while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--;
    text = tmSplice(text, from, t.to, '');
  }
  return text;
}

/** Remove a whole statement (an element with all inside it, a flow, a threat, a control or a scenario). */
function tmRemoveStatement(text, ref) {
  if (ref.type === 'model') throw new TmEditError('the model itself can’t be removed');
  const item = tmEditFind(tmEditParse(text), ref);
  return tmRemoveRange(text, item.src.from, item.src.to);
}
