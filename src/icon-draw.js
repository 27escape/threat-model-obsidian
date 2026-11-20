// Draws the icons that icons.js marked on diagram nodes (class tmIcon_<name>, and tmIconFg_… / tmIconBg_… for its
// colours), once Pele has drawn the diagram: Obsidian's own Lucide icon, in the empty first line of the node's
// label, in the label's colour unless the model gives one, on a rounded square of the background colour if given.
// An unknown name shows a "?" with a tooltip. Runs with the STRIDE colouring (stride-colour.js), for threat blocks
// and, from a post-processor, for saved reports.

const TM_ICON_SIZE = 18;

/** Obsidian's icon for a Lucide name, as an SVG element, or null when it has none. */
function tmLucide(name) {
  try {
    return getIcon(name) || getIcon(`lucide-${name}`);
  } catch {
    return null;
  }
}

const tmIconTroubles = new Set();
/** Say once, in the developer console, why an icon couldn't be drawn. */
function tmIconTrouble(message) {
  if (tmIconTroubles.has(message)) return;
  tmIconTroubles.add(message);
  console.warn(`Threat Modelling: ${message}`);
}

/**
 * Where the icon goes: the middle (x) and baseline (y) of the label's first line, the empty one left for it.
 * From the line's x and y when the renderer writes them, otherwise from where the browser laid the text out;
 * null while it isn't laid out yet.
 */
function tmIconPlace(label) {
  const line = label.querySelector('tspan');
  if (line && line.hasAttribute('y')) return { x: Number(line.getAttribute('x')) || 0, y: Number(line.getAttribute('y')) || 0 };
  try {
    const box = label.getBBox();
    if (!box.width && !box.height) return null;
    return { x: box.x + box.width / 2, y: box.y + TM_ICON_SIZE - 3 };
  } catch {
    return null;
  }
}

/** Draw the icons in every diagram inside root that hasn't got them yet. Returns how many it drew. */
function tmDrawIcons(root) {
  let done = 0;
  for (const node of root.querySelectorAll('svg g.pele-node[class*="tmIcon_"]')) {
    if (node.querySelector(':scope > .tm-icon')) continue;
    const classes = [...node.classList];
    const part = (prefix) => (classes.find((c) => c.startsWith(prefix)) || '').slice(prefix.length);
    const name = part('tmIcon_').replace(/_/g, '-');
    const label = node.querySelector('text.pele-label') || node.querySelector(':scope > text') || node.querySelector('text');
    if (!TM_ICON_NAME.test(name)) continue;
    if (!label) {
      tmIconTrouble(`a box with icon "${name}" has no label to put it in`);
      continue;
    }
    const at = tmIconPlace(label);
    if (!at) continue; // not laid out yet: tried again on the next change
    const { x, y } = at;
    const fg = tmIconClassColour(part('tmIconFg_'));
    const bg = tmIconClassColour(part('tmIconBg_'));

    const g = document.createElementNS(TM_SVG_NS, 'g');
    g.setAttribute('class', 'tm-icon');
    // the label's own colour, so the icon matches the text on dark and light boxes alike
    g.style.color = fg || window.getComputedStyle(label).fill || 'currentColor';
    const top = y - TM_ICON_SIZE + 4; // the line's baseline is y; centre the icon on the text
    if (bg) {
      const r = document.createElementNS(TM_SVG_NS, 'rect');
      const pad = 3;
      r.setAttribute('x', String(x - TM_ICON_SIZE / 2 - pad));
      r.setAttribute('y', String(top - pad));
      r.setAttribute('width', String(TM_ICON_SIZE + 2 * pad));
      r.setAttribute('height', String(TM_ICON_SIZE + 2 * pad));
      r.setAttribute('rx', '5');
      r.style.fill = bg;
      g.appendChild(r);
    }
    const icon = tmLucide(name);
    if (icon) {
      icon.removeAttribute('class'); // Obsidian's .svg-icon sizes would override the size set here
      icon.setAttribute('class', 'tm-icon-glyph');
      for (const [k, v] of Object.entries({ x: x - TM_ICON_SIZE / 2, y: top, width: TM_ICON_SIZE, height: TM_ICON_SIZE })) icon.setAttribute(k, String(v));
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('fill', 'none');
      g.appendChild(icon);
    } else {
      tmIconTrouble(`Obsidian has no icon called "${name}"`);
      const q = document.createElementNS(TM_SVG_NS, 'text');
      q.setAttribute('class', 'tm-icon-missing');
      q.setAttribute('x', String(x));
      q.setAttribute('y', String(y));
      q.setAttribute('text-anchor', 'middle');
      q.textContent = '?';
      const tip = document.createElementNS(TM_SVG_NS, 'title');
      tip.textContent = `Obsidian has no icon called "${name}": see lucide.dev/icons`;
      q.appendChild(tip);
      g.appendChild(q);
    }
    node.appendChild(g);
    done++;
  }
  return done;
}
