// Icon suggestions as you type in the Icon field (src/edit/icon-suggest.js): the technology's icon first, then names
// starting with what is typed, then names containing every word of it; never more than the list's length.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { twIconChoices } = load(['twIconChoices']);
const NAMES = ['database', 'database-backup', 'database-zap', 'globe', 'key', 'key-round', 'lock', 'lock-keyhole', 'server', 'shield'];

test('icon suggestions: the technology’s icon first, then starts, then every word', () => {
  assert.deepEqual(twIconChoices('', 'PostgreSQL', NAMES).slice(0, 2), ['database', 'database-backup']); // PostgreSQL's icon first
  assert.deepEqual(twIconChoices('data', '', NAMES), ['database', 'database-backup', 'database-zap']);
  assert.deepEqual(twIconChoices('zap', '', NAMES), ['database-zap']);
  assert.deepEqual(twIconChoices('lock key', '', NAMES), ['lock-keyhole']);
  assert.deepEqual(twIconChoices('key', 'React', NAMES), ['key', 'key-round', 'lock-keyhole'], 'React’s globe doesn’t match "key", so it isn’t first');
  assert.deepEqual(twIconChoices('glo', 'React', NAMES), ['globe']);
  assert.deepEqual(twIconChoices('nothing like it', '', NAMES), []);
  const many = Array.from({ length: 100 }, (_, i) => `icon-${i}`);
  assert.equal(twIconChoices('icon', '', many).length, 40);
});
