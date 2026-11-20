// Syntax highlighting for threat model text: text → [{ from, to, cls }], in order and never overlapping.
// Forgiving where the parser is strict: half-typed text (an open string, a stray character) still highlights.
// Used by the editor (highlight-editor.js), "threat-source" code blocks in Reading view, and the .threat file view.
// Colours are in styles.css (.tm-hl-*), taken from the theme's own code colours.

const TM_HL_KEYWORDS = new Set([...TM_KINDS, ...Object.keys(TM_KIND_ALIASES), ...TM_ZONE_WORDS, 'threat', 'control', 'scenario']);

/** The class for a hashtag: STRIDE letters, risks, statuses and sensitive data each have their own. */
function tmTagClass(tag) {
  const t = tag.toLowerCase();
  const stride = TM_STRIDE_ORDER.includes(tag) ? tag : TM_STRIDE_WORDS[t];
  if (stride) return `tm-hl-tag tm-hl-stride-${stride}`;
  if (TM_RISKS.includes(t)) return `tm-hl-tag tm-hl-risk-${t}`;
  if (TM_STATUSES.includes(t)) return `tm-hl-tag tm-hl-status${t === 'open' ? '' : ' tm-hl-closed'}`;
  if (TM_CONTROL_STATUSES.includes(t)) return `tm-hl-tag tm-hl-status${t === 'planned' ? '' : ' tm-hl-closed'}`;
  if (TM_SENSITIVE.includes(t)) return 'tm-hl-tag tm-hl-sensitive';
  return 'tm-hl-tag';
}

/** A hashtag's range; a combined STRIDE tag (#STR) is split so each letter gets its own colour. */
function tmHlTag(out, from, tag) {
  if (tag.length > 1 && tmIsStrideLetters(tag)) {
    out.push({ from, to: from + 2, cls: `tm-hl-tag tm-hl-stride-${tag[0]}` });
    for (let k = 1; k < tag.length; k++) out.push({ from: from + 1 + k, to: from + 2 + k, cls: `tm-hl-tag tm-hl-stride-${tag[k]}` });
  } else out.push({ from, to: from + 1 + tag.length, cls: tmTagClass(tag) });
}

/** A string's text split into plain string parts and the hashtags inside it. */
function tmHlString(text, from, to, out) {
  const re = /(^|[\s(\[,;])#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g;
  const body = text.slice(from, to);
  let at = from;
  let m;
  while ((m = re.exec(body))) {
    if (!/[A-Za-z_]/.test(m[2])) continue;
    const start = from + m.index + m[1].length;
    const end = start + 1 + m[2].length;
    if (start > at) out.push({ from: at, to: start, cls: 'tm-hl-string' });
    tmHlTag(out, start, m[2]);
    at = end;
  }
  if (to > at) out.push({ from: at, to, cls: 'tm-hl-string' });
}

function tmHighlight(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  let prev = ''; // the last word read: "kind", "threat" or ""
  const nextChar = (j) => {
    while (j < n && /\s/.test(text[j])) j++;
    return text[j] || '';
  };
  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const to = end < 0 ? n : end;
      out.push({ from: i, to, cls: 'tm-hl-comment' });
      i = to;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const to = end < 0 ? n : end + 2;
      out.push({ from: i, to, cls: 'tm-hl-comment' });
      i = to;
      continue;
    }
    if (c === '"' || c === '`') {
      const end = text.indexOf(c, i + 1);
      const to = end < 0 ? n : end + 1;
      tmHlString(text, i, to, out);
      i = to;
      prev = '';
      continue;
    }
    if ((c === '-' && text[i + 1] === '>') || (c === '<' && text[i + 1] === '-')) {
      out.push({ from: i, to: i + 2, cls: 'tm-hl-arrow' });
      i += 2;
      prev = '';
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_/-]/.test(text[j]) && !(text[j] === '-' && text[j + 1] === '>')) j++;
      if (j > i + 1) tmHlTag(out, i, text.slice(i + 1, j));
      i = Math.max(j, i + 1);
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(i, i + 40));
      out.push({ from: i, to: i + m[0].length, cls: 'tm-hl-number' });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < n && (/[A-Za-z0-9_]/.test(text[j]) || (text[j] === '-' && text[j + 1] !== '>'))) j++;
      const word = text.slice(i, j);
      let cls = 'tm-hl-name';
      if (nextChar(j) === '=') cls = 'tm-hl-key';
      else if (prev === 'threat') cls = 'tm-hl-threat-id';
      else if (prev === 'kind') cls = 'tm-hl-def';
      else if (TM_HL_KEYWORDS.has(word)) cls = 'tm-hl-keyword';
      out.push({ from: i, to: j, cls });
      prev = cls === 'tm-hl-keyword' ? (word === 'threat' || word === 'control' ? 'threat' : 'kind') : '';
      i = j;
      continue;
    }
    if ('{}[]=,'.includes(c)) out.push({ from: i, to: i + 1, cls: 'tm-hl-punct' });
    i++;
  }
  return out;
}

/** The text of each ```threat (and ```threat-source) block in a note: [{ from, to }], the lines between the fences. */
function tmThreatFences(text) {
  const out = [];
  const re = /^([ \t]*)(`{3,}|~{3,})[ \t]*(threat|threat-source)[ \t]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const fence = m[2];
    const from = m.index + m[0].length + 1;
    if (from > text.length) break;
    const close = new RegExp(`^[ \\t]*${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`, 'm');
    const rest = text.slice(from);
    const c = close.exec(rest);
    const to = c ? from + c.index : text.length;
    out.push({ from, to });
    re.lastIndex = c ? to + c[0].length : text.length;
  }
  return out;
}
