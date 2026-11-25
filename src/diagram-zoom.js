// Zoom for a threat block's diagram: buttons above it to zoom out, fit the diagram to the space it has (its width,
// and the height of the pane, for a long diagram) and zoom in, with the zoom shown between them (click it to go back
// to the diagram's own size). The choice is kept for the block, like its view, and applied each time the diagram is
// drawn: Obsidian draws it a moment later, so a watcher waits for the picture.

const TM_ZOOM_STEP = 1.25;
const TM_ZOOM_MIN = 0.1;
const TM_ZOOM_MAX = 4;

Object.assign(TmBlock.prototype, {
  /** The zoom buttons, in `parent`. */
  zoomBar(parent) {
    const bar = parent.createDiv({ cls: 'tm-zoom' });
    const button = (icon, text, tip, run) => {
      const b = bar.createEl('button', { cls: 'tm-btn tm-small tm-zoom-btn' });
      const svg = getIcon(icon);
      if (svg) b.appendChild(svg);
      else b.setText(text);
      b.setAttr('aria-label', tip);
      this.registerDomEvent(b, 'click', run);
      return b;
    };
    button('zoom-out', '−', 'Zoom out', () => this.zoomBy(1 / TM_ZOOM_STEP));
    this.zoomLabel = bar.createEl('button', { cls: 'tm-btn tm-small tm-zoom-label' });
    this.zoomLabel.setAttr('aria-label', 'Show the diagram at its own size');
    this.registerDomEvent(this.zoomLabel, 'click', () => this.choose({ zoom: null }));
    button('zoom-in', '+', 'Zoom in', () => this.zoomBy(TM_ZOOM_STEP));
    button('scan', 'Fit', 'Fit the whole diagram in view', () => this.choose({ zoom: 'fit' }));
    return bar;
  },

  /** Zoom in or out from what is shown now. */
  zoomBy(factor) {
    const svg = this.body && this.body.querySelector('.mermaid svg');
    const now = svg ? this.zoomNow(svg) : 1;
    this.choose({ zoom: Math.min(TM_ZOOM_MAX, Math.max(TM_ZOOM_MIN, Math.round(now * factor * 100) / 100)) });
  },

  /** The zoom the diagram is shown at: its drawn width against its own. */
  zoomNow(svg) {
    const own = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 1;
    return svg.getBoundingClientRect().width / own || 1;
  },

  /** The zoom changed: size the picture shown now. */
  applyZoomNow() {
    const svg = this.body && this.body.querySelector('.mermaid svg');
    if (svg) this.applyZoom(svg);
  },

  /** Apply the chosen zoom to the diagram, once it is drawn (and again whenever it is drawn afresh). */
  watchZoom(body, component) {
    const apply = () => {
      const svg = body.querySelector('.mermaid svg');
      if (!svg || svg.getAttribute('data-tm-zoom') === String(this.state.zoom)) return;
      this.applyZoom(svg);
    };
    const watch = new MutationObserver(apply);
    watch.observe(body, { childList: true, subtree: true });
    component.register(() => watch.disconnect());
    apply();
  },

  /**
   * Size the picture: the box around it (its .mermaid) gets the width, and the picture fills that box (styles.css),
   * as a renderer may draw the picture again (Pele does when its box changes size) and would lose a size set on it.
   */
  applyZoom(svg) {
    const zoom = this.state.zoom;
    const box = svg.parentElement;
    svg.setAttribute('data-tm-zoom', String(zoom));
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (!zoom || !w || !h) {
      // as drawn: its own size, or narrower to fit the width
      box.removeClass('tm-zoomed');
      box.style.removeProperty('width');
    } else {
      let z = zoom;
      if (zoom === 'fit') {
        const room = this.body.clientWidth || w;
        // the height of the pane the note is in, less a little for the bar above the diagram
        const pane = this.body.closest('.markdown-preview-view, .cm-scroller, .view-content, .tw-view');
        const tall = Math.max(200, (pane ? pane.clientHeight : window.innerHeight) - 100);
        z = Math.min(room / w, tall / h);
      }
      box.addClass('tm-zoomed');
      box.style.setProperty('width', `${Math.round(w * z)}px`);
    }
    if (this.zoomLabel) this.zoomLabel.setText(`${Math.round(this.zoomNow(svg) * 100)}%`);
  },
});
