// A small Markdown reader for the two documents the page shows: the threat report (report.js writes it for Obsidian)
// and the language reference (help). It knows what they use and no more: front matter (skipped), headings,
// paragraphs, lists (nested by indent, with Obsidian's block IDs, "^t01"), tables, code blocks (```mermaid drawn
// with Pele, ```threat highlighted), quotes and callouts (> [!NOTE]), lines (---); and in text: **bold**, *italic*,
// `code`, links, Obsidian links to a block ([[#^t01|T01]]), and the report's own <span class="tm-…"> chips and cells.
// It builds DOM, never HTML strings, and keeps only links to web addresses or to places in the document.

/** Fill el with the Markdown text md. opts.draw(el, mermaidText): draws a ```mermaid block. Returns el. */
function twMarkdownInto(el, md, opts = {}) {
  let lines = md.replace(/\r/g, '').split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) lines = lines.slice(end + 1);
  }
  let i = 0;
  const blank = (l) => !l.trim();
  while (i < lines.length) {
    const l = lines[i];
    if (blank(l)) {
      i++;
      continue;
    }
    let m;
    if ((m = /^(`{3,}|~{3,})\s*([\w-]*)\s*$/.exec(l))) {
      const fence = m[1];
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith(fence); i++) body.push(lines[i]);
      i++;
      const text = body.join('\n');
      if (m[2] === 'mermaid' && opts.draw) opts.draw(el.createDiv({ cls: 'tw-md-diagram' }), text);
      else {
        const code = el.createEl('pre', { cls: 'tw-md-code' }).createEl('code');
        if (m[2] === 'threat' || m[2] === 'threat-source') {
          code.addClass('tm-hl');
          tmHighlightInto(code, text);
        } else code.setText(text);
      }
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      const h = el.createEl(`h${Math.min(m[1].length + 1, 6)}`);
      twInline(h, m[2]);
      h.id = twSlug(m[2]);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      el.createEl('hr');
      i++;
      continue;
    }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const table = el.createDiv({ cls: 'tw-md-table' }).createEl('table');
      const hr = table.createEl('thead').createEl('tr');
      for (const c of cells(l)) twInline(hr.createEl('th'), c);
      const tb = table.createEl('tbody');
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
        const tr = tb.createEl('tr');
        for (const c of cells(lines[i])) twInline(tr.createEl('td'), c);
      }
      continue;
    }
    if (/^>/.test(l)) {
      const body = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) body.push(lines[i].replace(/^>\s?/, ''));
      const call = /^\[!(\w+)\]\s*(.*)$/.exec(body[0] || '');
      const q = el.createEl(call ? 'div' : 'blockquote', { cls: call ? `tw-md-callout tw-md-callout-${call[1].toLowerCase()}` : '' });
      if (call) {
        if (call[2]) twInline(q.createDiv({ cls: 'tw-md-callout-title' }), call[2]);
        body.shift();
      }
      twMarkdownInto(q, body.join('\n'), opts);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      i = twList(el, lines, i, opts);
      continue;
    }
    const para = [];
    for (; i < lines.length && !blank(lines[i]) && !/^(#{1,6}\s|```|~~~|>|\s*([-*]|\d+\.)\s+|\s*\|)/.test(lines[i]); i++) para.push(lines[i].trim());
    if (!para.length) para.push(lines[i++].trim());
    twInline(el.createEl('p'), para.join(' '));
  }
  return el;
}

/** A list starting at lines[i], and those nested in it (indented further). Returns the line after it. */
function twList(el, lines, i, opts) {
  const indent = (l) => /^\s*/.exec(l)[0].replace(/\t/g, '    ').length;
  const base = indent(lines[i]);
  const ordered = /^\s*\d+\./.test(lines[i]);
  const list = el.createEl(ordered ? 'ol' : 'ul');
  let li = null;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      if (i + 1 < lines.length && indent(lines[i + 1]) > base && li) {
        i++;
        continue;
      }
      break;
    }
    const d = indent(l);
    const m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(l);
    if (d === base && m) {
      li = list.createEl('li');
      let text = m[2];
      const block = /\s\^([A-Za-z0-9-]+)\s*$/.exec(text);
      if (block) {
        li.id = block[1];
        text = text.slice(0, block.index);
      }
      twInline(li, text);
      i++;
    } else if (d > base && li) {
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) i = twList(li, lines, i, opts);
      else {
        li.appendText(' ');
        twInline(li, l.trim());
        i++;
      }
    } else break;
  }
  return i;
}

const twSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TW_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** Text with its inline Markdown, added to el. */
function twInline(el, text) {
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[\[#\^([A-Za-z0-9-]+)\\?\|([^\]]+)\]\])|(\[([^\]]+)\]\(([^)\s]+)\))|(<span class="(tm-[A-Za-z0-9 _-]+)">(.*?)<\/span>)|(&(nbsp|amp|lt|gt|quot|#39);)/g;
  let at = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > at) el.appendText(text.slice(at, m.index));
    if (m[1]) twInline(el.createEl('strong'), m[2]);
    else if (m[3]) twInline(el.createEl('em'), m[4]);
    else if (m[5]) el.createEl('code', { text: m[6] });
    else if (m[7]) el.createEl('a', { cls: 'tw-md-ref', text: m[9], href: `#${m[8]}` });
    else if (m[10]) {
      const href = /^https?:\/\//.test(m[12]) ? m[12] : /^#/.test(m[12]) ? m[12] : null;
      if (href) twInline(el.createEl('a', { href, attr: /^https?:/.test(href) ? { target: '_blank', rel: 'noopener' } : {} }), m[11]);
      else twInline(el.createSpan(), m[11]); // links to the repository's own files: just their text here
    } else if (m[13]) twInline(el.createSpan({ cls: m[14] }), m[15]);
    else if (m[16]) el.appendText(TW_ENTITIES[m[17]]);
    at = re.lastIndex;
  }
  if (at < text.length) el.appendText(text.slice(at));
}
