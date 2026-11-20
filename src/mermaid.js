// Helpers shared by the three Mermaid views: safe text, short IDs, trimming.

const TM_MM_ENTITIES = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '`': '#96;', ';': '#59;' };

/**
 * User text made safe inside a Mermaid label: characters Mermaid reads as syntax become entity codes, line breaks
 * become <br/>. html: keep <sub>, <sup>, <b> and <i> (flowcharts draw them); otherwise they are removed.
 */
function tmMmText(s, html = true) {
  let out = String(s == null ? '' : s).replace(/[#"<>`;]/g, (c) => TM_MM_ENTITIES[c]);
  const tag = /#lt;(\/?)(sub|sup|b|i)#gt;/gi;
  out = html ? out.replace(tag, '<$1$2>') : out.replace(tag, '');
  return out.replace(/\r?\n/g, '<br/>');
}

/** Text cut to n characters at a word, with "…". */
function tmClip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return (cut.lastIndexOf(' ') > n * 0.6 ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '…';
}

/** Short Mermaid IDs for every element and zone (model IDs may hold "-", which Mermaid reads as part of an arrow). */
function tmMmIds(model) {
  const ids = new Map();
  model.elements.forEach((e, i) => ids.set(e.id, `e${i + 1}`));
  model.zones.forEach((z, i) => ids.set(`zone:${z.id}`, `z${i + 1}`));
  return ids;
}

/** "🆂 🅸": the STRIDE letters of some threats as boxed letters (see TM_STRIDE_MARKS), or "". */
function tmStrideBadge(threats) {
  return tmStrideOf(threats.flatMap((t) => t.stride))
    .map((l) => TM_STRIDE_MARKS[l])
    .join(' ');
}

/** Most threat IDs a box or arrow lists; the rest are counted ("+2"). */
const TM_DIAGRAM_IDS = 4;

/**
 * text formatted to show how serious a threat is while it is open: Low in italics, Medium bold, High bold and
 * underlined, Critical all three (the same as the risk word in the Sequence view). Closed threats stay plain.
 */
function tmRiskStyled(t, text) {
  if (t.status !== 'open' || !t.risk) return text;
  if (t.risk === 'critical') return `<b><i><u>${text}</u></i></b>`;
  if (t.risk === 'high') return `<b><u>${text}</u></b>`;
  if (t.risk === 'medium') return `<b>${text}</b>`;
  return `<i>${text}</i>`;
}

/**
 * "T03 (9.1) T01 +2": the threats' IDs, with their scores when they have one, most serious open threat first
 * (register order), each formatted by its risk (tmRiskStyled), so a reader can find them in the table under the
 * diagram. "?" for a threat without an ID.
 */
function tmThreatIdsText(threats, max = TM_DIAGRAM_IDS) {
  const sorted = tmSortThreats(threats);
  const score = (t) => (tmRatingShort(t) ? ` (${tmRatingShort(t)})` : '');
  const shown = sorted.slice(0, max).map((t) => tmRiskStyled(t, tmMmText(t.id || '?', false) + score(t)));
  if (sorted.length > max) shown.push(`+${sorted.length - max}`);
  return shown.join(' ');
}

/** The threat marks on a box or arrow: "🆂 🆃 T01 (4×5) T02" (boxed STRIDE letters, then the IDs and ratings), or "". */
function tmThreatMarks(threats) {
  if (!threats.length) return '';
  return [tmStrideBadge(threats), tmThreatIdsText(threats)].filter(Boolean).join(' ');
}

/** One line about a threat: "T01 [S, I] Critical 9.2 (mitigated)". */
function tmThreatHead(t) {
  const parts = [];
  if (t.id) parts.push(t.id);
  if (t.stride.length) parts.push(`[${t.stride.join(', ')}]`);
  if (t.risk) parts.push(tmCap(t.risk));
  if (tmRatingShort(t)) parts.push(tmRatingShort(t));
  if (t.status !== 'open') parts.push(`(${t.status})`);
  return parts.join(' ');
}
