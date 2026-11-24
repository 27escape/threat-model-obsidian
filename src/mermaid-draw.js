// Drawing a diagram's Mermaid text. With Obsidian's own Mermaid (loadMermaid) the diagram is drawn straight into the
// block, so no Markdown post-processor runs on it: going through MarkdownRenderer ran every plugin's post-processor
// on a ```mermaid code block, and one that throws (Embedded Code Title 0.5.5 does, on a code element with two
// classes, as Obsidian's "language-mermaid node-insert-event") stopped the diagram, the threat register and the key
// being drawn at all. Without loadMermaid (older Obsidian, or the web app's stand-in) it goes through
// MarkdownRenderer as before, and a failure there no longer stops the rest of the block.

let tmMermaidCount = 0;

/**
 * Draw `text` into `el`. o: { app, sourcePath, component } for MarkdownRenderer; o.load and o.parse stand in for
 * loadMermaid and for turning Mermaid's SVG text into a node (tests). Resolves once drawn (or the problem is shown).
 */
async function tmDrawMermaid(text, el, o = {}) {
  const load = 'load' in o ? o.load : typeof loadMermaid === 'function' ? loadMermaid : null;
  if (!load) {
    try {
      await MarkdownRenderer.render(o.app, '```mermaid\n' + text + '\n```', el, o.sourcePath, o.component);
    } catch (e) {
      tmMermaidProblem(el, e);
    }
    return;
  }
  const host = el.createDiv({ cls: 'mermaid' });
  const id = `tm-mermaid-${++tmMermaidCount}`;
  try {
    const mermaid = await load();
    const { svg, bindFunctions } = await mermaid.render(id, text);
    // Mermaid's own output, cleaned by Mermaid, as Obsidian's renderer puts it in the page; parsed, not run
    const node = (o.parse || tmParseSvg)(svg);
    host.empty();
    if (node) host.appendChild(node);
    if (typeof bindFunctions === 'function') bindFunctions(host);
  } catch (e) {
    tmMermaidProblem(host, e);
  } finally {
    // Mermaid leaves its working copy in the page when it fails
    const stray = typeof document !== 'undefined' && document.getElementById(`d${id}`);
    if (stray) stray.remove();
  }
}

const tmParseSvg = (svg) => new DOMParser().parseFromString(svg, 'text/html').body.querySelector('svg');

function tmMermaidProblem(el, e) {
  el.empty();
  el.createDiv({ cls: 'tm-errors', text: `The diagram couldn’t be drawn: ${e && e.message ? e.message : e}` });
}
