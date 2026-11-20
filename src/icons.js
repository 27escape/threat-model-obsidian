// Icons on elements: icon = "user" (a Lucide icon name, the set Obsidian ships), with an optional icon_colour and
// icon_background. Pele, Obsidian's Mermaid renderer, draws no icons in labels, and Mermaid's own icon shapes come
// out empty, so the plugin draws them itself once a diagram is drawn (icon-draw.js), from Obsidian's own icons:
// nothing is fetched. The diagram carries what is needed as class names on the node, so saved reports get their
// icons too: tmIcon_user (a "-" in the name becomes "_"), tmIconFg_x08427b (a colour: "x" and hex digits, or a
// name), tmIconBg_white. Each gets a classDef that changes nothing, so the class is kept on the node. The label
// starts with an empty line that leaves room for the icon. In other Mermaid tools the box has that empty line.

const TM_ICON_KEYS = ['icon', 'icon_colour', 'icon_color', 'icon_background'];
const TM_ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// the empty first line of a label with an icon (an em space, which Pele keeps)
const TM_ICON_LINE = ' <br/>';

// Font Awesome names people are likely to try, and the Lucide icon to use instead
const TM_FA_TO_LUCIDE = {
  user: 'user',
  users: 'users',
  database: 'database',
  server: 'server',
  cloud: 'cloud',
  globe: 'globe',
  lock: 'lock',
  key: 'key',
  mobile: 'smartphone',
  'mobile-screen': 'smartphone',
  desktop: 'monitor',
  laptop: 'laptop',
  envelope: 'mail',
  'credit-card': 'credit-card',
  shield: 'shield',
  'shield-halved': 'shield-half',
  gear: 'settings',
  cog: 'settings',
  building: 'building',
  'building-columns': 'landmark',
  university: 'landmark',
  code: 'code',
  file: 'file',
};

/** A colour for an icon: "#08427b" (3, 4, 6 or 8 hex digits) or a CSS name such as "white"; null if neither. */
function tmIconColour(text) {
  const t = String(text || '').trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(t)) return t;
  if (/^[a-z]{3,20}$/.test(t)) return t;
  return null;
}

/** An element's icon from its attributes, { name, fg, bg } or null; problems become warnings. */
function tmIconOf(e, warn) {
  const a = e.attrs;
  const fgAttr = a.icon_colour || a.icon_color;
  if (!a.icon) {
    if (fgAttr || a.icon_background) warn((fgAttr || a.icon_background).line, `${e.id} has an icon colour but no icon = "…"`);
    return null;
  }
  let name = tmValText(a.icon).trim().toLowerCase();
  if (name === 'none' || name === '') return null;
  const fa = /^fa[srb]?:(?:fa-)?(.+)$/.exec(name);
  if (fa) {
    const instead = TM_FA_TO_LUCIDE[fa[1]];
    warn(
      a.icon.line,
      `icon = "${name}": Font Awesome icons aren't available in Obsidian; use a Lucide icon name${instead ? `, such as "${instead}"` : ''} (see lucide.dev/icons)`
    );
    return null;
  }
  name = name.replace(/^lucide[:-]/, '');
  if (!TM_ICON_NAME.test(name)) {
    warn(a.icon.line, `icon = "${name}" isn't an icon name: use a Lucide name such as "user" or "database" (see lucide.dev/icons)`);
    return null;
  }
  const colour = (v, what) => {
    if (!v) return null;
    const c = tmIconColour(tmValText(v));
    if (!c) warn(v.line, `${what} = "${tmValText(v)}" isn't a colour: use one such as "#08427b" or "white"`);
    return c;
  };
  return { name, fg: colour(fgAttr, a.icon_colour ? 'icon_colour' : 'icon_color'), bg: colour(a.icon_background, 'icon_background') };
}

/** The Mermaid class names that carry an element's icon to icon-draw.js: "tmIcon_file_text", "tmIconFg_x08427b". */
function tmIconClassNames(icon) {
  if (!icon) return [];
  const c = (v) => v.replace(/^#/, 'x'); // hex colours start with "x", so "#abc" and a name never look alike
  return [`tmIcon_${icon.name.replace(/-/g, '_')}`, ...(icon.fg ? [`tmIconFg_${c(icon.fg)}`] : []), ...(icon.bg ? [`tmIconBg_${c(icon.bg)}`] : [])];
}

/** A classDef for each icon class these elements use; the style changes nothing but makes sure the class is kept. */
function tmIconClassDefs(elements) {
  const names = new Set(elements.flatMap((e) => tmIconClassNames(e.icon)));
  return [...names].map((c) => `  classDef ${c} opacity:1`);
}

/** The lines that give a Mermaid node its icon classes (none without an icon). */
function tmIconClassLines(pad, mmId, icon) {
  return tmIconClassNames(icon).map((c) => `${pad}class ${mmId} ${c}`);
}

/** A class name's colour back as CSS: "x08427b" → "#08427b", "white" → "white"; null if it is neither. */
function tmIconClassColour(v) {
  if (/^x(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return `#${v.slice(1)}`;
  return /^[a-z]{3,20}$/.test(v) ? v : null;
}
