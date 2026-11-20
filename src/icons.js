// Icons on elements: icon = "user" (a Lucide icon name, the set Obsidian ships), with an optional icon_colour and
// icon_background. Pele, Obsidian's Mermaid renderer, draws no icons in labels, and Mermaid's own icon shapes come
// out empty, so the plugin draws them itself once a diagram is drawn (icon-draw.js), from Obsidian's own icons:
// nothing is fetched. The diagram carries what is needed as class names on the node, so saved reports get their
// icons too: tmIcon_user (a "-" in the name becomes "_"), tmIconFg_x08427b (a colour: "x" and hex digits, or a
// name), tmIconBg_white. Each gets a classDef that changes nothing, so the class is kept on the node. The label
// starts with an empty line that leaves room for the icon. In other Mermaid tools the box has that empty line.

const TM_ICON_KEYS = ['icon', 'icon_colour', 'icon_color', 'icon_background'];
// Default icons, for an element that doesn't name one: a person is always "user"; otherwise its technology, when a
// word in it is known (TM_TECH_ICONS, first match wins), and then its kind. Systems, containers and components have
// no kind icon: they vary too much for one icon to help. icon = "none" leaves it off one element; the "Default
// icons" setting leaves them all off (views: opts.defaultIcons === false), with the untrusted-zone icon and the
// padlock on sensitive data.
const TM_DEFAULT_ICONS = { person: 'user', external: 'building-2', store: 'database', queue: 'list-ordered' };
const TM_TECH_ICONS = [
  ['smartphone', ['ios', 'android', 'xamarin', 'react native', 'flutter', 'mobile', 'mobile app', 'swift', 'kotlin']],
  ['list-ordered', ['kafka', 'rabbitmq', 'sqs', 'sns', 'service bus', 'event hubs', 'event hub', 'activemq', 'nats', 'mqtt', 'queue', 'message queue']],
  ['database', ['postgresql', 'postgres', 'mysql', 'mariadb', 'sql server', 'mssql', 'oracle', 'mongodb', 'redis', 'dynamodb', 'cosmos db', 'cosmosdb', 'sqlite', 'cassandra', 'elasticsearch', 'database', 'sql']],
  ['archive', ['s3', 'blob', 'blob storage', 'object storage', 'file share', 'files', 'sharepoint']],
  ['mail', ['email', 'e-mail', 'smtp', 'imap', 'exchange']],
  ['key-round', ['ldap', 'active directory', 'entra id', 'azure ad', 'idp', 'oauth', 'oauth2', 'openid', 'openid connect', 'oidc', 'saml', 'keycloak', 'okta', 'auth0']],
  ['globe', ['react', 'angular', 'vue', 'svelte', 'web', 'web app', 'spa', 'html', 'javascript', 'typescript', 'browser', 'next.js']],
  ['server', ['node.js', 'node', 'java', '.net', 'asp.net', 'c#', 'go', 'golang', 'python', 'django', 'flask', 'spring', 'spring boot', 'ruby', 'rails', 'php', 'api', 'rest', 'grpc']],
];
// the icon on a zone marked untrusted (dataflow.js), and the mark before sensitive data on a flow
const TM_UNTRUSTED_ICON = 'shield-alert';
// room at the end of an untrusted zone's title for its icon: em spaces, kept by a zero-width space after them
const TM_ZONE_ICON_ROOM = '\u2003\u2003\u200b';
const TM_SENSITIVE_MARK = '\u{1F512}'; // 🔒: text, so it shows in copied diagrams too

/** The icon for a technology such as "React, TypeScript" or "PostgreSQL 15": a known word in it, or null. */
function tmTechIcon(technology) {
  const t = ` ${String(technology || '').toLowerCase().replace(/[^a-z0-9.#+-]+/g, ' ')} `;
  for (const [icon, words] of TM_TECH_ICONS) if (words.some((w) => t.includes(` ${w} `))) return icon;
  return null;
}
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
    const name = e.kind === 'person' ? 'user' : tmTechIcon(a.technology && tmValText(a.technology)) || TM_DEFAULT_ICONS[e.kind];
    if (name) {
      // the default icon, coloured if asked
      const colour = (v) => (v && tmIconColour(tmValText(v))) || null;
      return { name, fg: colour(fgAttr), bg: colour(a.icon_background), isDefault: true };
    }
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

/** The icon a view draws for an element: its own, or its kind's unless opts.defaultIcons is false; null for none. */
const tmIconFor = (e, opts = {}) => (e.icon && (!e.icon.isDefault || opts.defaultIcons !== false) ? e.icon : null);

/** A classDef for each icon class these elements use; the style changes nothing but makes sure the class is kept. */
function tmIconClassDefs(elements, opts = {}) {
  const names = new Set(elements.flatMap((e) => tmIconClassNames(tmIconFor(e, opts))));
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
