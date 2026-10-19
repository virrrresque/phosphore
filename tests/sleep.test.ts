import assert from 'node:assert/strict';
import { test } from 'node:test';
import { neverSleeps, sweep, TabTimers, type Clock, type TabFacts } from '../src/main/sleep.ts';
import { TAB_KEYS } from '../src/shared/types.ts';
import { applySetting, cleanDomain, defaults, sanitize, TAB_KEY_IDS, toCommands } from '../src/main/settings.ts';
import { parse } from '../src/shared/command.ts';

/** Fausse horloge : le temps n'avance que par tick(ms). */
function fakeClock() {
  let now = 0, next = 1;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = { now: () => now, set: (fn, ms) => { const id = next++; jobs.set(id, { at: now + ms, fn }); return id; }, clear: h => { jobs.delete(h as number); } };
  const tick = (ms: number) => {
    now += ms;
    for (const [id, j] of [...jobs].sort((a, b) => a[1].at - b[1].at)) if (j.at <= now && jobs.has(id)) { jobs.delete(id); j.fn(); }
  };
  return { clock, tick, pending: () => jobs.size };
}

test('unload-delay : un minuteur par onglet, relancé, annulé, nettoyé', () => {
  const { clock, tick, pending } = fakeClock();
  const fired: string[] = [];
  const t = new TabTimers(clock, id => fired.push(id));
  t.start('a', 3 * 60_000);
  t.start('b', 3 * 60_000);
  tick(60_000);
  t.start('a', 3 * 60_000); // le son s'est arrêté : le délai repart de zéro
  tick(2 * 60_000);
  assert.deepEqual(fired, ['b']);
  t.cancel('a'); // retour dans le Space
  tick(10 * 60_000);
  assert.deepEqual(fired, ['b']);
  t.start('c', 1000);
  t.keep(new Set(['x'])); // Space supprimé / onglet fermé
  assert.equal(t.size, 0);
  assert.equal(pending(), 0); // aucune minuterie oubliée
});

test('sleep-never : domaine et sous-domaines', () => {
  assert.equal(neverSleeps('https://app.discord.com/channels', ['discord.com']), true);
  assert.equal(neverSleeps('https://www.deezer.com/', ['deezer.com']), true);
  assert.equal(neverSleeps('https://notdiscord.com/', ['discord.com']), false);
  assert.equal(cleanDomain('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(cleanDomain('pas un site'), null);
});

test('passage périodique : veille et fermeture avec garde-fous', () => {
  const M = 60_000;
  const tab = (id: string, o: Partial<TabFacts> = {}): TabFacts => ({ id, spaceId: 'a', url: 'https://ex.com/' + id, pinned: false, live: true, audible: false, seenAt: 0, ...o });
  const base = { now: 40 * M, activeSpace: 'a', current: 'cur', idleMin: 30, ecoMin: 5, eco: false, sleepPinned: true, never: ['discord.com'], closeIdleMin: 0 };
  const tabs = [tab('cur'), tab('old'), tab('new', { seenAt: 30 * M }), tab('music', { audible: true }), tab('chat', { url: 'https://discord.com/x' }), tab('pin', { pinned: true })];
  assert.deepEqual(sweep(tabs, base).sleep, ['old', 'pin']);
  assert.deepEqual(sweep(tabs, { ...base, sleepPinned: false }).sleep, ['old']);
  assert.deepEqual(sweep(tabs, { ...base, eco: true }).sleep, ['old', 'new', 'pin']); // éco : 5 min
  assert.deepEqual(sweep(tabs, { ...base, idleMin: 0 }).sleep, []);
  // close-idle : seulement les Spaces inactifs, jamais épinglé / son / sleep-never, jamais le dernier onglet du Space.
  const others = [tab('b1', { spaceId: 'b', seenAt: 1 }), tab('b2', { spaceId: 'b', seenAt: 2 }), tab('c1', { spaceId: 'c', pinned: true }), tab('c2', { spaceId: 'c' }), tab('d1', { spaceId: 'd', audible: true })];
  const r = sweep([...tabs, ...others], { ...base, idleMin: 0, closeIdleMin: 30 });
  assert.deepEqual(r.close.sort(), ['b1', 'c2']);
});

test('nouveaux réglages : validés, nettoyés, exportés', () => {
  assert.deepEqual(TAB_KEY_IDS, [...TAB_KEYS]);
  const d = defaults();
  assert.equal(d.unloadDelay, 0);
  assert.equal(d.idleSleep, 30); // comportement d'avant
  assert.equal((applySetting(d, 'unload-delay', '3') as typeof d).unloadDelay, 3);
  assert.equal(typeof applySetting(d, 'unload-delay', '500'), 'string');
  assert.deepEqual((applySetting(d, 'sleep-never', 'https://www.discord.com/app, deezer.com') as typeof d).sleepNever, ['discord.com', 'deezer.com']);
  assert.equal(typeof applySetting(d, 'sleep-never', 'javascript:alert(1)'), 'string');
  assert.equal((applySetting(d, 'restore', 'home') as typeof d).restore, 'home');
  assert.equal(typeof applySetting(d, 'restore', 'partout'), 'string');
  const s = sanitize({ unloadDelay: 5, idleSleep: 999999, sleepNever: ['discord.com', 42, '<x>'], restore: 'none', dedupeOnOpen: true });
  assert.equal(s.unloadDelay, 5);
  assert.equal(s.idleSleep, d.idleSleep);
  assert.deepEqual(s.sleepNever, d.sleepNever); // une entrée invalide : liste refusée
  assert.equal(s.restore, 'none');
  assert.equal(s.dedupeOnOpen, true);
  const lines = toCommands({ ...d, sleepNever: ['discord.com'] });
  for (const k of TAB_KEYS) assert.ok(lines.some(l => l.startsWith(`set ${k} `)), k);
  for (const l of lines.filter(x => x.startsWith('set '))) assert.notEqual(parse(l, 'duckduckgo')?.type, 'error', l);
});

test('commandes de veille, fermés, son, recherche de pages, restauration', async () => {
  const p = (s: string) => parse(s, 'duckduckgo');
  assert.deepEqual(p('sleep'), { type: 'tab', op: 'sleep-others' }); // comportement d'avant gardé
  assert.deepEqual(p('sleep all'), { type: 'tab', op: 'sleep-others' });
  assert.deepEqual(p('sleep tab'), { type: 'tab', op: 'sleep-current' });
  assert.deepEqual(p('sleep never add discord.com'), { type: 'sleep-never', op: 'add', site: 'discord.com' });
  assert.deepEqual(p('sleep never ls'), { type: 'sleep-never', op: 'ls', site: '' });
  assert.deepEqual(p('reopen'), { type: 'tab', op: 'restore' });
  assert.deepEqual(p('reopen 2'), { type: 'reopen', n: 2 });
  assert.equal(p('reopen x')?.type, 'error');
  assert.deepEqual(p('dedupe'), { type: 'dedup' });
  assert.deepEqual(p('unmute'), { type: 'media', op: 'unmute', x: 0 });
  assert.deepEqual(p('mute all-but-current'), { type: 'media', op: 'mute-others', x: 0 });
  assert.deepEqual(p('mute'), { type: 'media', op: 'mute', x: 0 });
  assert.deepEqual(p('find-tab météo lyon'), { type: 'page', page: 'tabs', q: 'météo lyon' });
  assert.deepEqual(p('space color #ffffff'), { type: 'space', op: 'color', arg: '#ffffff' });
  assert.deepEqual(p('move 3 jeux'), { type: 'mv', which: 3, space: 'jeux' });

  const { restoreMode } = await import('../src/shared/types.ts');
  const s = { spaces: [{ id: 'a', name: 'A' }], activeSpace: 'a', active: { a: 't1' },
    items: [{ kind: 'tab' as const, id: 't1', spaceId: 'a', parent: null, url: 'https://x.com/', title: 'x', pinned: false },
      { kind: 'tab' as const, id: 't2', spaceId: 'a', parent: null, url: 'https://y.com/', title: 'y', pinned: true },
      { kind: 'folder' as const, id: 'f', spaceId: 'a', parent: null, name: 'F', open: true }] };
  assert.equal(restoreMode(s, 'last', 'h'), s);
  assert.deepEqual(restoreMode(s, 'none', 'h').items.map(i => i.id), ['t2', 'f']); // épinglées et dossiers gardés
  const home = restoreMode(s, 'home', 'h');
  assert.deepEqual(home.items.map(i => i.id), ['t2', 'f', 'h']);
  assert.equal(home.active.a, 'h');
});
