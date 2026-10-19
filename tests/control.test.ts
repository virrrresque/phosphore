import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from '../src/shared/command.ts';
import { MORE_KEYS, PERMS, restoreMode } from '../src/shared/types.ts';
import { applySetting, defaults, MORE_KEY_IDS, PERM_ID_LIST, permNames, sanitize, toCommands } from '../src/main/settings.ts';
import { complete } from '../src/shared/complete.ts';

const p = (s: string) => parse(s, 'duckduckgo');

test('contrôle complet : nouvelles commandes', () => {
  assert.deepEqual(p('tab move 5 1'), { type: 'tabmove', from: 5, to: 1 });
  assert.deepEqual(p('tab move 2'), { type: 'tabmove', from: 0, to: 2 });
  assert.deepEqual(p('tab up'), { type: 'tabmove', from: 0, to: 'up' });
  assert.deepEqual(p('tab rename Mail perso'), { type: 'tabrename', name: 'Mail perso' });
  assert.deepEqual(p('tab rename'), { type: 'tabrename', name: '' });
  assert.deepEqual(p('rm -right'), { type: 'closeset', which: 'right' });
  assert.deepEqual(p('rm -all'), { type: 'closeset', which: 'all' });
  assert.deepEqual(p('sleep 3'), { type: 'tabn', op: 'sleep', n: 3 });
  assert.deepEqual(p('wake 3'), { type: 'tabn', op: 'wake', n: 3 });
  assert.deepEqual(p('wake'), { type: 'tool', op: 'wake' });
  assert.deepEqual(p('pin 2'), { type: 'tabn', op: 'pin', n: 2 });
  assert.deepEqual(p('pin'), { type: 'tab', op: 'pin' });
  assert.deepEqual(p('mute 4'), { type: 'tabn', op: 'mute', n: 4 });
  assert.deepEqual(p('r all'), { type: 'reload-all' });
  assert.deepEqual(p('start youtube.com twitch.tv'), { type: 'open-many', urls: ['https://youtube.com/', 'https://twitch.tv/'] });
  assert.deepEqual(p('start météo lyon'), { type: 'navigate', url: 'https://duckduckgo.com/?q=m%C3%A9t%C3%A9o%20lyon', newTab: true }); // pas des adresses : recherche
  assert.deepEqual(p('fold Cours'), { type: 'tabfold', name: 'Cours' });
  assert.deepEqual(p('unfold'), { type: 'tabfold', name: '' });
  assert.deepEqual(p('space sleep'), { type: 'space', op: 'sleep', arg: '' });
  assert.deepEqual(p('space unfold all'), { type: 'space', op: 'unfold', arg: 'all' });
  assert.deepEqual(p('fullscreen'), { type: 'win', op: 'full' });
  assert.deepEqual(p('ontop'), { type: 'win', op: 'ontop' });
  assert.deepEqual(p('bm add'), { type: 'bm', op: 'add', arg: '', name: '' });
  assert.deepEqual(p('bm add youtube.com Vidéos'), { type: 'bm', op: 'add', arg: 'https://youtube.com/', name: 'Vidéos' });
  assert.deepEqual(p('bm rm 2'), { type: 'bm', op: 'rm', arg: '2', name: '' });
  assert.deepEqual(p('bm cuisine'), { type: 'page', page: 'bookmarks', q: 'cuisine' });
  assert.deepEqual(p('clip md'), { type: 'clip', what: 'md' });
  assert.deepEqual(p('perm allow meet.google.com camera'), { type: 'perm', op: 'allow', site: 'meet.google.com', perm: 'camera' });
  assert.deepEqual(p('session save travail'), { type: 'session', op: 'save', name: 'travail' });
  assert.equal(p('session save ../x')?.type, 'error');
  assert.deepEqual(p('cookies clear-all'), { type: 'cookies-all' });
});

test('contrôle complet : réglages validés, nettoyés, exportés', () => {
  assert.deepEqual(MORE_KEY_IDS, [...MORE_KEYS]);
  assert.deepEqual(PERM_ID_LIST, [...PERMS]);
  const d = defaults();
  const S = (k: string, v: string) => applySetting(d, k, v);
  assert.equal((S('zoom', '110') as typeof d).zoom, 110);
  assert.equal(typeof S('zoom', '900'), 'string');
  assert.equal((S('download-dir', 'C:\\Users\\moi\\Downloads') as typeof d).downloadDir, 'C:\\Users\\moi\\Downloads');
  assert.equal(typeof S('download-dir', 'C:\\x\\..\\..\\Windows'), 'string');
  assert.equal(typeof S('download-dir', 'relatif'), 'string');
  assert.equal((S('proxy', 'socks5://127.0.0.1:9050') as typeof d).proxy, 'socks5://127.0.0.1:9050');
  assert.equal((S('proxy', 'socks5h://127.0.0.1:9050') as typeof d).proxy, 'socks5h://127.0.0.1:9050');
  assert.equal(typeof S('proxy', 'javascript:alert(1)'), 'string');
  assert.equal((S('home', 'youtube.com') as typeof d).home, 'https://youtube.com/');
  assert.equal(typeof S('home', 'file:///c:/x'), 'string');
  const s = sanitize({ bookmarks: [{ name: 'Y', url: 'https://youtube.com/' }, { name: 'X', url: 'javascript:1' }], permissions: { 'www.meet.google.com': ['camera', 'root'], 'bad site': ['camera'] }, zoom: 125 });
  assert.deepEqual(s.bookmarks, [{ name: 'Y', url: 'https://youtube.com/' }]);
  assert.deepEqual(s.permissions, { 'meet.google.com': ['camera'] });
  assert.equal(s.zoom, 125);
  const lines = toCommands({ ...d, bookmarks: [{ name: 'Y', url: 'https://youtube.com/' }], permissions: { 'meet.google.com': ['camera'] } });
  for (const k of MORE_KEYS) assert.ok(lines.some(l => l.startsWith(`set ${k} `)), k);
  for (const l of lines.filter(x => !x.startsWith('#'))) assert.notEqual(p(l)?.type, 'error', l);
  assert.ok(lines.includes('bm add https://youtube.com/ Y'));
  assert.ok(lines.includes('perm allow meet.google.com camera'));
});

test('droits des sites : correspondance avec Electron', () => {
  assert.deepEqual(permNames('media', ['video']), ['camera']);
  assert.deepEqual(permNames('media', ['audio', 'video']), ['microphone', 'camera']);
  assert.deepEqual(permNames('clipboard-read'), ['clipboard']);
  assert.deepEqual(permNames('openExternal'), []); // inconnu : jamais accordable
});

test('page d\'accueil au démarrage et complétion', () => {
  const s = { spaces: [{ id: 'a', name: 'A' }], activeSpace: 'a', active: { a: null }, items: [] };
  const home = restoreMode(s, 'home', 'h', 'https://youtube.com/');
  assert.equal(home.items[0].kind === 'tab' && home.items[0].url, 'https://youtube.com/');
  const ctx = { spaces: ['A'], tabs: ['YouTube', 'Twitch'], exts: [], mods: [], widgets: [], parts: [], aliases: [], binds: [], shortcuts: [], closed: [], sleepNever: [], colors: [], texts: [], bookmarks: ['Y'], folders: ['Cours'], host: 'meet.google.com' };
  const fills = (x: string) => complete(x, ctx).map(c => c.fill);
  assert.deepEqual(fills('tab move '), ['tab move 1 ', 'tab move 2 ']);
  assert.deepEqual(fills('fold '), ['fold Cours']);
  assert.deepEqual(fills('bm rm '), ['bm rm 1']);
  assert.deepEqual(fills('perm allow '), ['perm allow meet.google.com ']);
  assert.ok(fills('perm allow meet.google.com ').includes('perm allow meet.google.com camera'));
});
