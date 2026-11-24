// Threat model text → tokens. Kinds: id, string, number, tag, arrow ("->" or "<-"), the punctuation { } [ ] = ,
// and eof. Every token carries the line it starts on, and where it is in the text (from, to: character offsets, as
// for String.slice), so that edits can change just the text of one token (edit.js). Errors are thrown as TmError
// with a line number.

class TmError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

const tmIdStart = (c) => /[A-Za-z]/.test(c);
const tmIdChar = (c) => /[A-Za-z0-9_]/.test(c);

/** Backtick text: the indentation of every line is removed, then blank lines at either end. */
function tmDedent(s) {
  return s
    .split('\n')
    .map((x) => x.replace(/^[ \t]+/, '').replace(/\r$/, ''))
    .join('\n')
    .trim();
}

function tmLex(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  // a token from offset `from` to the current position i
  const add = (kind, value, at, from) => out.push({ kind, value, line: at, from, to: i });

  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new TmError('a /* comment is never closed with */', line);
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end + 2;
      continue;
    }
    if ((c === '-' && src[i + 1] === '>') || (c === '<' && src[i + 1] === '-')) {
      i += 2;
      add('arrow', c === '-' ? '->' : '<-', line, i - 2);
      continue;
    }
    if (c === '"' || c === '`') {
      const start = line;
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\n') line++;
        j++;
      }
      if (j >= n) throw new TmError(`a string starting with ${c} is never closed`, start);
      const raw = src.slice(i + 1, j);
      const from = i;
      i = j + 1;
      add('string', c === '`' ? tmDedent(raw) : raw.replace(/\r/g, ''), start, from);
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_/-]/.test(src[j]) && !(src[j] === '-' && src[j + 1] === '>')) j++;
      const tag = src.slice(i + 1, j);
      if (!tag || !/[A-Za-z_]/.test(tag)) throw new TmError(`"#${tag}" isn't a hashtag: a tag needs a letter`, line);
      const from = i;
      i = j;
      add('tag', tag, line, from);
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i, i + 40));
      if (tmIdStart(src[i + m[0].length] || '')) throw new TmError(`"${m[0]}${src[i + m[0].length]}…": an ID must start with a letter`, line);
      const from = i;
      i += m[0].length;
      add('number', Number(m[0]), line, from);
      continue;
    }
    if (tmIdStart(c)) {
      let j = i + 1;
      // "-" belongs to the ID (T-01) unless it starts an arrow (a->b)
      while (j < n && (tmIdChar(src[j]) || (src[j] === '-' && src[j + 1] !== '>'))) j++;
      const from = i;
      i = j;
      add('id', src.slice(from, j), line, from);
      continue;
    }
    if ('{}[]=,'.includes(c)) {
      i++;
      add(c, c, line, i - 1);
      continue;
    }
    throw new TmError(`unexpected character ${JSON.stringify(c)}`, line);
  }
  add('eof', '', line, i);
  return out;
}
