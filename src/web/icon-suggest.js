// Icon suggestions in the Icon field for the web app (the plugin uses Obsidian's suggestion list: obsidian-ui.js): a
// small list under the field as you type, each icon drawn beside its name (edit/icon-suggest.js chooses them). Up and
// Down move through it, Enter or a click chooses, Escape or leaving the field closes it.

/** Every icon name the page has: Lucide's, and the old names it still answers to. */
function twIconNames() {
  return (twIconNames.all ||= [...Object.keys(TW_LUCIDE), ...Object.keys(TW_LUCIDE_ALIASES)].sort());
}

function twIconSuggest(input, technology) {
  const wrap = input.parentElement;
  wrap.addClass('tw-suggest-wrap');
  const list = wrap.createDiv({ cls: 'tw-suggest tw-hidden', attr: { role: 'listbox' } });
  input.setAttr('autocomplete', 'off');
  let names = [];
  let at = -1;
  const close = () => {
    list.addClass('tw-hidden');
    at = -1;
  };
  const mark = () => [...list.children].forEach((c, i) => c.toggleClass('is-selected', i === at));
  const choose = (name) => {
    input.value = name;
    input.dispatchEvent(new Event('input'));
    close();
  };
  const show = () => {
    names = twIconChoices(input.value, technology(), twIconNames());
    list.empty();
    at = -1;
    if (!names.length) return close();
    for (const name of names) {
      const item = list.createDiv({ cls: 'tw-suggest-item', attr: { role: 'option' } });
      const svg = getIcon(name);
      if (svg) item.appendChild(svg);
      item.createSpan({ text: name });
      // pointerdown, so the choice is made before the field loses focus and closes the list
      item.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        choose(name);
      });
    }
    list.removeClass('tw-hidden');
  };
  input.addEventListener('input', (e) => e.isTrusted !== false && document.activeElement === input && show());
  input.addEventListener('focus', show);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (list.hasClass('tw-hidden')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      at = (at + (e.key === 'ArrowDown' ? 1 : -1) + names.length) % names.length;
      mark();
      list.children[at].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && at >= 0) {
      e.preventDefault();
      choose(names[at]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the list, not the panel
      close();
    }
  });
}
