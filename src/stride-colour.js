// STRIDE letters in diagrams are boxed letters (🆂 🆃 🆁 🅸 🅳 🅴, Unicode's "negative squared" capitals): a filled box
// with the letter cut out of it. Pele draws text as SVG, and an SVG glyph takes its fill colour, so once a diagram
// is drawn each one is wrapped in a <tspan class="tm-sg tm-sg-S"> that styles.css colours from the theme: a coloured
// box with the letter in it. Without this step (another Mermaid tool, or the plugin turned off) they are still boxed
// letters, just in the text colour.
// It also colours the threat IDs on boxes and arrows by their risk (tm-tid-high and so on) and makes them links
// (id-links.js), from a map of ID to { cls, tip }: a threat block's model, or a saved report's threat register.
// Used for the diagrams in threat blocks, and for any note's diagrams (saved reports), from a post-processor.

const TM_GLYPH_LETTER = new Map(Object.entries(TM_STRIDE_MARKS).map(([l, g]) => [g, l]));
const TM_GLYPH_RE = new RegExp(`(${Object.values(TM_STRIDE_MARKS).join('|')})`, 'u');
const TM_SVG_NS = 'http://www.w3.org/2000/svg';

const tmEscapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Colour the boxed letters in every diagram inside root, and mark the threat IDs that ids names (ID → { cls, tip },
 * from tmThreatIdInfo or tmRegisterIndex): their class, data-tm-id for id-links.js, and a tooltip if tip is given.
 * Returns how many it coloured.
 */
function tmColourStride(root, ids = null) {
  // an ID, with its rating in brackets after it when the diagram gives one: "T01 (4×5)" or "T04 (6.1)" is coloured as one
  const idRe = ids && ids.size ? new RegExp(`(?<![\\w-])((?:${[...ids.keys()].sort((a, b) => b.length - a.length).map(tmEscapeRe).join('|')})(?: \\((?:\\d+(?:\\.\\d+)?|\\d×\\d)\\))?)(?![\\w-])`, 'u') : null;
  const wanted = (v) => TM_GLYPH_RE.test(v) || (idRe && idRe.test(v));
  let done = 0;
  for (const svg of root.querySelectorAll('svg')) {
    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      // never inside what this has already made: a letter, an ID, or an ID's tooltip (whose text holds the ID too,
      // and wrapping it would add another tooltip to wrap, for ever)
      if (wanted(n.nodeValue) && !(n.parentNode instanceof Element && n.parentNode.closest('.tm-sg, .tm-tid, title'))) nodes.push(n);
    }
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const piece of node.nodeValue.split(TM_GLYPH_RE)) {
        if (!piece) continue;
        const letter = TM_GLYPH_LETTER.get(piece);
        if (letter) {
          frag.appendChild(tmSvgSpan(`tm-sg tm-sg-${letter}`, piece));
          done++;
          continue;
        }
        // the parts split out by idRe's group sit at the odd places
        const parts = idRe ? piece.split(new RegExp(idRe.source, 'gu')) : [piece];
        parts.forEach((part, i) => {
          if (!part) return;
          const id = part.replace(/ \(.*$/, '');
          if (i % 2 === 1 && ids.has(id)) {
            const info = ids.get(id);
            const span = tmSvgSpan(`tm-tid ${info.cls}`, part);
            span.setAttribute('data-tm-id', id);
            if (info.tip) {
              const tip = document.createElementNS(TM_SVG_NS, 'title');
              tip.textContent = info.tip;
              span.appendChild(tip);
            }
            frag.appendChild(span);
            done++;
          } else frag.appendChild(document.createTextNode(part));
        });
      }
      node.parentNode.replaceChild(frag, node);
    }
  }
  return done;
}

function tmSvgSpan(cls, text) {
  const t = document.createElementNS(TM_SVG_NS, 'tspan');
  t.setAttribute('class', cls);
  t.textContent = text;
  return t;
}

/**
 * Colour the boxed letters, mark the threat IDs, and draw the icons (icon-draw.js), in the diagrams in el, now and
 * whenever they are drawn again. Obsidian draws a diagram some time after the Markdown, in a long note only once it
 * is scrolled into view, and may draw it again later, so this watches el until the returned function is called
 * (when the block or note section goes away). The returned function's link(links) gives the IDs later, once known.
 * links: { ids, open(id, event, target), hover(id, event, target), clear(event) }, see id-links.js; null for none.
 * clear is called for a click on the diagrams anywhere but an ID.
 * always: el is a threat block, whose diagram may not have started to draw yet; otherwise it does nothing, and
 * returns null, when el has no diagram.
 */
const TM_MAX_BUSY_PASSES = 40;

function tmColourStrideSoon(el, links = null, always = false) {
  const text = el.textContent || '';
  const diagram = el.querySelector('svg, .mermaid, .language-mermaid') || TM_GLYPH_RE.test(text) || text.includes('tmIcon_');
  if (!always && !diagram) return null;
  let current = links;
  // a safety stop: each pass leaves alone what it has done, so passes that keep changing things mean something is
  // wrong; rather than run for ever (and hang Obsidian), it stops watching
  let busy = 0;
  const run = () => {
    if (!el.querySelector('svg')) return;
    const changed = tmColourStride(el, current && current.ids) + tmDrawIcons(el);
    busy = changed ? busy + 1 : 0;
    if (busy > TM_MAX_BUSY_PASSES) {
      console.warn('Threat Modelling: stopped colouring a diagram that kept changing');
      stop();
    }
  };
  run();
  // changes run it again, at most once a frame (an editor changes at every key); what it has already done it
  // leaves alone, so its own changes end there
  let frame = 0;
  const watch = new MutationObserver(() => {
    if (!frame) frame = window.requestAnimationFrame(() => {
      frame = 0;
      run();
    });
  });
  watch.observe(el, { childList: true, subtree: true });
  // the ID links: one listener each on el for every ID in it
  const idAt = (event) => {
    const t = event.target instanceof Element ? event.target.closest('[data-tm-id]') : null;
    return t && current && current.ids && current.ids.has(t.getAttribute('data-tm-id')) ? t : null;
  };
  const onClick = (event) => {
    const t = idAt(event);
    if (!t && current && current.clear) current.clear(event);
    if (!t || !current.open) return;
    event.preventDefault();
    event.stopPropagation();
    current.open(t.getAttribute('data-tm-id'), event, t);
  };
  const onOver = (event) => {
    const t = idAt(event);
    if (t && current.hover) current.hover(t.getAttribute('data-tm-id'), event, t);
  };
  el.addEventListener('click', onClick, true);
  el.addEventListener('mouseover', onOver);
  const stop = () => {
    watch.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    el.removeEventListener('click', onClick, true);
    el.removeEventListener('mouseover', onOver);
  };
  stop.link = (later) => {
    current = later;
    run();
  };
  return stop;
}
