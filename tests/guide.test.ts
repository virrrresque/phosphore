import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUIDE } from '../src/shared/guide.ts';
import { parse } from '../src/shared/command.ts';
import { applySetting, defaults } from '../src/main/settings.ts';

test('guide : chaque exemple est une vraie commande, acceptée telle quelle', () => {
  assert.equal(new Set(GUIDE.map(g => g.id)).size, GUIDE.length);
  for (const g of GUIDE) for (const [, , ex] of g.items) {
    const a = parse(ex, 'duckduckgo');
    assert.ok(a && a.type !== 'error' && a.type !== 'navigate', `${g.id} : « ${ex} »`);
    if (a.type === 'set') assert.notEqual(typeof applySetting(defaults(), a.key, a.value), 'string', `${g.id} : « ${ex} » refusé`);
  }
  assert.deepEqual(parse('guide sidebar', 'duckduckgo'), { type: 'page', page: 'guide', q: 'sidebar' });
});

test('ordre des Spaces : space move', async () => {
  const { complete } = await import('../src/shared/complete.ts');
  assert.deepEqual(parse('space move 1', 'duckduckgo'), { type: 'space', op: 'move', arg: '1' });
  assert.equal(parse('space move haut', 'duckduckgo')?.type, 'error');
  const ctx = { spaces: ['GEN', 'VOYAGE'], tabs: [], exts: [], mods: [], widgets: [], parts: [], aliases: [], binds: [], shortcuts: [], closed: [], sleepNever: [], colors: [], texts: [] };
  assert.deepEqual(complete('space move ', ctx).map(c => c.fill), ['space move 1', 'space move 2']);
});
