// Icon names to suggest as the user types in the Icon field (item-forms.js), for both builds: the one the plugin would
// choose for the technology first, then names that start with what is typed, then names that contain every word of
// it (so "lock key" finds key-round and lock-keyhole). Each build lists its icons (twIconNames) and shows the list (twIconSuggest):
// obsidian-ui.js with Obsidian's own suggestion list, web/icon-suggest.js in the page.

const TW_ICON_SUGGESTIONS = 40;

/** The names to offer for `query`, given the element's technology and every icon name the build has. */
function twIconChoices(query, technology, names) {
  const q = String(query || '').trim().toLowerCase();
  const known = new Set(names);
  const out = [];
  const add = (n) => out.length < TW_ICON_SUGGESTIONS && n && known.has(n) && !out.includes(n) && out.push(n);
  const tech = tmTechIcon(technology || '');
  if (tech && (!q || tech.includes(q))) add(tech);
  const words = q.split(/[\s-]+/).filter(Boolean);
  for (const n of names) if (n.startsWith(q)) add(n);
  for (const n of names) if (words.every((w) => n.includes(w))) add(n);
  return out;
}
