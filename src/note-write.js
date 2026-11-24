// Writing a changed model back into its note (stage 3 of docs/editor-in-obsidian.md). Plain text in, plain text out,
// so it can be tested without Obsidian; editor-view.js decides whether the change goes through the note's editor
// (so Obsidian's undo takes it back) or into the file.
// A threat block is found by its text: the one whose code is the text the editor was showing (Obsidian's own line
// for the block, if it gives one, picks between two the same). If none is (the note changed meanwhile), nothing is
// written. A block in a callout or a list keeps the "> " or indent at the start of every line.

/** The threat blocks in a note: [{ open, close, prefix, body }], open and close being the fence lines (from 0). */
function tmThreatBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^((?:[ \t]*>)*[ \t]*)(`{3,}|~{3,})[ \t]*threat[ \t]*$/.exec(lines[i]);
    if (!m) continue;
    const prefix = m[1];
    const fence = m[2];
    const bare = prefix.replace(/[ \t]+$/, ''); // an empty line in a callout is just ">"
    const body = [];
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const inner = l.startsWith(prefix) ? l.slice(prefix.length) : l === bare || (!bare && !l.trim()) ? '' : null;
      if (inner === null) break; // the callout or list ended before the block did
      if (new RegExp(`^${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(inner)) {
        close = j;
        break;
      }
      body.push(inner);
    }
    if (close < 0) continue;
    out.push({ open: i, close, prefix, body: body.join('\n') });
    i = close;
  }
  return out;
}

/** A block's code as compared: without the line end Obsidian may or may not keep at the end. */
const tmSameCode = (a, b) => a.replace(/\r\n/g, '\n').replace(/\n$/, '') === b.replace(/\r\n/g, '\n').replace(/\n$/, '');

/**
 * Where to write: the block whose code is `was`, or (several being the same) the one on line `near` (Obsidian's
 * own line for it, or null). Returns { block, lines } (the new code lines, each with the block's prefix), or a
 * problem: { problem }.
 */
function tmPlanBlockWrite(text, was, now, near) {
  const found = tmThreatBlocks(text).filter((b) => tmSameCode(b.body, was));
  let block = found.length === 1 ? found[0] : found.find((b) => b.open === near);
  if (!block) {
    return {
      problem: found.length
        ? 'The note has more than one threat block with this same model, and Obsidian didn’t say which: change it in its text.'
        : 'The note has changed since the editor read it: nothing was written. Try again.',
    };
  }
  const bare = block.prefix.replace(/[ \t]+$/, '');
  const code = now.replace(/\r\n/g, '\n').replace(/\n$/, '');
  const lines = code.split('\n').map((l) => (l ? block.prefix + l : bare));
  return { block, lines };
}

/** The note with the block's code replaced (keeping its line ends), or { problem }. */
function tmWriteBlock(text, was, now, near) {
  const plan = tmPlanBlockWrite(text, was, now, near);
  if (plan.problem) return plan;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const all = text.split(/\r?\n/);
  all.splice(plan.block.open + 1, plan.block.close - plan.block.open - 1, ...plan.lines);
  return { text: all.join(eol) };
}
