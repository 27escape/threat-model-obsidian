// Getting a model out of the page, without anything leaving the browser: a link with the model in it, pictures of
// the diagram shown (SVG, or PNG), and the threat register as CSV for a spreadsheet or a ticket system.

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

// ---- pictures: the diagram as it is drawn, its look written into it so it stands alone

const TW_SVG_STYLE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-anchor', 'dominant-baseline', 'visibility'];

/** The diagram shown in `view` as SVG text, every element's look written into it from the page's styles. */
function twDiagramSvg(view) {
  const live = view.querySelector('.mermaid svg');
  if (!live) throw new Error('there is no diagram to save');
  const copy = live.cloneNode(true);
  const a = [live, ...live.querySelectorAll('*')];
  const b = [copy, ...copy.querySelectorAll('*')];
  a.forEach((el, i) => {
    const cs = window.getComputedStyle(el);
    const style = TW_SVG_STYLE.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
    b[i].setAttribute('style', style);
    b[i].removeAttribute('class');
  });
  for (const s of copy.querySelectorAll('style, title')) s.remove();
  const box = live.getBoundingClientRect();
  const w = Math.ceil(box.width);
  const h = Math.ceil(box.height);
  copy.setAttribute('width', String(w));
  copy.setAttribute('height', String(h));
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({ x: '-10000', y: '-10000', width: '20000', height: '20000', fill: window.getComputedStyle(document.body).backgroundColor })) bg.setAttribute(k, v);
  copy.insertBefore(bg, copy.firstChild);
  return new XMLSerializer().serializeToString(copy);
}

/** The diagram as a PNG, at twice its size on screen. */
function twDiagramPng(view) {
  const svg = twDiagramSvg(view);
  const w = Number(/width="(\d+)"/.exec(svg)[1]);
  const h = Number(/height="(\d+)"/.exec(svg)[1]);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const g = c.getContext('2d');
      g.scale(2, 2);
      g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the browser couldn’t make a PNG'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('the browser couldn’t draw the picture'));
    };
    img.src = url;
  });
}

function twDownloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.body.createEl('a', { href: url, attr: { download: name } });
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- the threat register as CSV

const twCsvCell = (v) => {
  const s = String(v === null || v === undefined ? '' : v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
};

/** One row per threat: what a spreadsheet or a ticket system needs. Cells that look like formulas are made safe. */
function twRegisterCsv(model) {
  const head = ['ID', 'Threat', 'STRIDE', 'Risk', 'Risk after controls', 'Rating', 'Status', 'Applies to', 'Owner', 'Mitigation', 'Controls', 'Description'];
  const rows = model.threats.map((t) => [
    t.id || '',
    t.title,
    t.stride.join(''),
    t.risk || '',
    t.residual && t.residual !== t.risk ? t.residual : '',
    tmRatingText(t) || '',
    t.status,
    t.where,
    t.owner,
    t.mitigation,
    tmControlLines(model, { controls: t.controls || [] }).join('; '),
    t.description,
  ]);
  return [head, ...rows].map((r) => r.map(twCsvCell).join(',')).join('\r\n') + '\r\n';
}
