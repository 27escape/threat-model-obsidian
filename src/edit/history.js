// Undo and redo for the model's text, whether it changed by typing or through a form. The page keeps the history
// itself (a textarea's own undo is lost whenever a form rewrites the text): each entry is the whole text before a
// change. Typing is grouped: one entry for each burst of typing, ended by a pause.

const TW_HISTORY_MAX = 200;
const TW_TYPING_PAUSE = 800; // ms without a key that ends a burst of typing

class TwHistory {
  constructor() {
    this.clear();
  }

  clear() {
    this.past = [];
    this.future = [];
    this.typing = false;
    clearTimeout(this.timer);
  }

  /** Keep `text`, the text before a change, so the change can be undone. */
  record(text) {
    if (this.past[this.past.length - 1] === text) return;
    this.past.push(text);
    if (this.past.length > TW_HISTORY_MAX) this.past.shift();
    this.future = [];
  }

  /** Before a key changes the text: the first key of a burst keeps the text as it was. */
  typed(before) {
    if (!this.typing) this.record(before);
    this.typing = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.typing = false), TW_TYPING_PAUSE);
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  /** The text to go back to, given the text now; null when there is nothing to undo. */
  undo(now) {
    if (!this.past.length) return null;
    this.typing = false;
    this.future.push(now);
    return this.past.pop();
  }

  redo(now) {
    if (!this.future.length) return null;
    this.typing = false;
    this.past.push(now);
    return this.future.pop();
  }
}
