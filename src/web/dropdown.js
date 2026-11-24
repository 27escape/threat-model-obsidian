// A small menu under a button in the top bar (Add, Model): a list of actions. Like every overlay on the page it
// closes with Escape, a click outside it, or once an item is chosen, and focus goes back to its button.

/**
 * A button that opens a menu. items() is called each time it opens, and gives [{ text, icon, tip, run, disabled }]
 * or '-' for a line between groups. Returns the button.
 */
function twDropdown(parent, text, tip, icon, items) {
  const wrap = parent.createDiv({ cls: 'tw-dropdown' });
  const button = twButton(wrap, text, tip, () => (isOpen() ? close(true) : open()), icon);
  button.setAttr('aria-haspopup', 'menu');
  button.setAttr('aria-expanded', 'false');
  const chevron = getIcon('chevron-down');
  if (chevron) {
    chevron.addClass('tw-chevron');
    button.appendChild(chevron);
  }
  const menu = wrap.createDiv({ cls: 'tw-dropdown-menu tw-hidden', attr: { role: 'menu' } });
  const isOpen = () => !menu.hasClass('tw-hidden');
  const onKey = (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };
  const onPress = (e) => {
    if (!wrap.contains(e.target)) close();
  };
  function open() {
    menu.empty();
    for (const it of items()) {
      if (it === '-') {
        menu.createDiv({ cls: 'tw-dropdown-line' });
        continue;
      }
      const b = twButton(menu, it.text, it.tip || it.text, () => {
        close(true);
        it.run();
      }, it.icon);
      b.addClass('tw-item');
      b.addClass('tw-action');
      b.setAttr('role', 'menuitem');
      if (it.disabled) b.disabled = true;
    }
    menu.removeClass('tw-hidden');
    button.setAttr('aria-expanded', 'true');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPress, true);
    const first = menu.querySelector('button:not([disabled])');
    if (first) first.focus();
  }
  function close(refocus) {
    menu.addClass('tw-hidden');
    button.setAttr('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPress, true);
    if (refocus) button.focus();
  }
  return button;
}
