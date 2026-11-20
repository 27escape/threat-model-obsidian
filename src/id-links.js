// Threat IDs on diagrams as links. In a threat block, an ID on a box or arrow shows the threat as a tooltip, and a
// click shows the threat's footprint (every box, arrow and note it appears on stays, the rest fades) and brings its
// row in the table under the diagram into view; a second click on it, or a click anywhere else, clears that. In a saved report (or any note with a threat
// register written the way report.js writes it), an ID links to its register entry: a click goes there, and a
// hover (with Ctrl in Live Preview, as for any link) shows it, through Obsidian's page preview. stride-colour.js
// marks the IDs (a tspan with data-tm-id) and passes clicks and hovers to the open and hover given here.

const TM_HOVER_SOURCE = 'threat-model';

/** Threat ID → { cls, tip }: its colour class in a diagram, and its tooltip ("T01 [S] High 9.2 — title"). */
function tmThreatIdInfo(threats) {
  const map = new Map();
  for (const t of threats) {
    if (!t.id) continue;
    map.set(t.id, { cls: t.status !== 'open' ? 'tm-tid-closed' : `tm-tid-${t.risk || 'none'}`, tip: `${tmThreatHead(t)} — ${t.title}` });
  }
  return map;
}

/**
 * A threat register in a note's text, as report.js writes it ("- **T01** chips High · 9.2 · Open — title ^t01"):
 * threat ID → { cls, anchor }. Empty when the note has none.
 */
function tmRegisterIndex(text) {
  const map = new Map();
  // only the register section: the controls after it are written the same way
  const start = text.search(/^## Threat register[ \t]*$/m);
  if (start < 0) return map;
  const rest = text.slice(start + 1);
  const end = rest.search(/^## /m);
  const register = end < 0 ? rest : rest.slice(0, end);
  const line = /^- \*\*([^*\n]+)\*\*(.*?) — .* \^([a-z0-9-]+)[ \t]*$/gm;
  for (let m = line.exec(register); m; m = line.exec(register)) {
    const id = m[1].trim();
    if (id === '—' || map.has(id)) continue;
    const facts = m[2].replace(/<[^>]*>[^<]*<\/[^>]*>/g, '').toLowerCase();
    const first = new RegExp(`\\b(${TM_RISKS.join('|')})\\b`).exec(facts); // the risk as assessed, before any "→"
    const risk = first ? first[1] : '';
    const open = /\bopen\b/.test(facts);
    map.set(id, { cls: !open ? 'tm-tid-closed' : `tm-tid-${risk || 'none'}`, anchor: m[3] });
  }
  return map;
}

/**
 * What a note's diagrams need to link their threat IDs to its register: { ids, open, hover }, or null when the note
 * has no register. Read from the note's saved text.
 */
async function tmNoteLinks(plugin, sourcePath) {
  const file = sourcePath && plugin.app.vault.getAbstractFileByPath(sourcePath);
  if (!file || !file.extension || file.extension !== 'md') return null;
  const ids = tmRegisterIndex(await plugin.app.vault.cachedRead(file));
  if (!ids.size) return null;
  const link = (id) => `#^${ids.get(id).anchor}`;
  return {
    ids,
    open: (id) => plugin.app.workspace.openLinkText(link(id), sourcePath),
    hover: (id, event, target) =>
      plugin.app.workspace.trigger('hover-link', { event, source: TM_HOVER_SOURCE, hoverParent: { hoverPopover: null }, targetEl: target, linktext: link(id), sourcePath }),
  };
}

// what fades or stays when a footprint is shown
const TM_FOOTPRINT_PARTS = '.pele-node, .pele-edge, .pele-edge-label, .pele-note, .pele-cluster';

/**
 * Show where a threat applies in the diagrams inside root: each place its ID appears (a box, a box around others,
 * an arrow's label and its arrow, a note) is marked tm-hit and the diagram tm-focus, so everything else fades.
 * The same ID again, or none, clears it. Returns true when a footprint is now shown.
 */
function tmShowFootprint(root, id) {
  let shown = false;
  for (const svg of root.querySelectorAll('svg.pele')) {
    const again = svg.getAttribute('data-tm-focus') === id;
    for (const el of svg.querySelectorAll('.tm-hit')) el.classList.remove('tm-hit');
    svg.classList.remove('tm-focus');
    svg.removeAttribute('data-tm-focus');
    if (!id || again) continue;
    const marks = svg.querySelectorAll(`[data-tm-id="${CSS.escape(id)}"]`);
    if (!marks.length) continue;
    for (const m of marks) {
      const part = m.closest(TM_FOOTPRINT_PARTS);
      if (!part) continue;
      part.classList.add('tm-hit');
      // an arrow's label and the arrow itself share an ID
      const edge = part.classList.contains('pele-edge-label') && part.getAttribute('data-id');
      if (edge) for (const e of svg.querySelectorAll(`.pele-edge[data-id="${CSS.escape(edge)}"]`)) e.classList.add('tm-hit');
    }
    svg.classList.add('tm-focus');
    svg.setAttribute('data-tm-focus', id);
    shown = true;
  }
  return shown;
}

/** A threat block: its IDs' row in the table below, brought into view and briefly highlighted. */
function tmShowTableRow(tableEl, id) {
  const row = tableEl.querySelector(`tr[data-tm-threat="${CSS.escape(id)}"]`);
  if (!row) return;
  const details = row.closest('details');
  if (details) details.open = true;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.removeClass('tm-flash');
  void row.offsetWidth; // so the highlight starts again when the same row is chosen twice
  row.addClass('tm-flash');
}
