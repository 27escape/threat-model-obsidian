// Getting a model out of the page, without anything leaving the browser: a link with the model in it (share-link.js).
// Pictures of the diagram and the threat register as CSV are in export-files.js, which the plugin shares.

// ---- links: the model compressed into the address, after "#" (which browsers never send to a website)

/** The page's address with the model (and a name for it) in it (share-link.js). */
const twShareLink = (text, name) => tmShareLink(text, name, location.href);

/** The model in the page's address, if it was opened from a link: { name, text }, or null. */
async function twSharedFromAddress() {
  try {
    const shared = await tmReadShareLink(location.hash);
    return shared && { name: `Shared: ${shared.name.slice(0, TW_NAME_MAX - 8)}`, text: shared.text };
  } catch {
    new Notice('That link’s model couldn’t be read: it may have been cut short.');
    return null;
  }
}

/** Take the model out of the address once something else is shown, so a reload doesn't bring it back. */
function twClearShared() {
  if (location.hash.startsWith(`#${TM_SHARE_KEY}=`)) history.replaceState(null, '', location.href.replace(/#.*$/, ''));
}
