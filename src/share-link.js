// A link to the web editor with a model in it, for both builds: the web app's Copy a link to share (web/export.js)
// and the plugin's Open in the web editor (editor-view.js). The model goes after "#", which a browser never sends to
// a website, deflated and in base64url: "#model=z…" (or "#model=p…" where the browser can't compress).

const TM_SHARE_KEY = 'model';
const TM_WEB_EDITOR = 'https://27escape.github.io/threat-model-obsidian/';

const tmB64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const tmFromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function tmSqueeze(bytes, how) {
  const stream = new Blob([bytes]).stream().pipeThrough(how === 'in' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** base (an address without "#") with the model, and a name for it, in it. */
async function tmShareLink(text, name, base) {
  const json = new TextEncoder().encode(JSON.stringify({ n: name, t: text }));
  const packed = typeof CompressionStream === 'function' ? `z${tmB64url(await tmSqueeze(json, 'in'))}` : `p${tmB64url(json)}`;
  return `${base.replace(/#.*$/, '')}#${TM_SHARE_KEY}=${packed}`;
}

/** The model in an address's "#…" part: { name, text }, null when there is none, or throws when it can't be read. */
async function tmReadShareLink(hash) {
  const m = new RegExp(`^#${TM_SHARE_KEY}=([zp])([A-Za-z0-9_-]+)$`).exec(hash || '');
  if (!m) return null;
  const bytes = tmFromB64url(m[2]);
  const json = JSON.parse(new TextDecoder().decode(m[1] === 'z' ? await tmSqueeze(bytes, 'out') : bytes));
  if (typeof json.t !== 'string') throw new Error('no model in the link');
  return { name: String(json.n || 'model'), text: json.t };
}
