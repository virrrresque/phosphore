import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, toUrl } from '../src/shared/command.ts';
import { applySetting, defaults, sanitize, WIDGET_IDS } from '../src/main/settings.ts';
import { WIDGETS } from '../src/shared/types.ts';

test('toUrl reconnaît les adresses et refuse les protocoles dangereux', () => {
  assert.equal(toUrl('youtube.com'), 'https://youtube.com/');
  assert.equal(toUrl('fr.wikipedia.org/wiki/Phosphore'), 'https://fr.wikipedia.org/wiki/Phosphore');
  assert.equal(toUrl('http://exemple.com'), 'http://exemple.com/');
  assert.equal(toUrl('localhost:3000'), 'http://localhost:3000/');
  assert.equal(toUrl('exemple.com:8080/a'), 'https://exemple.com:8080/a');
  for (const bad of ['file:///C:/Windows', 'javascript:alert(1)', 'data:text/html,x', 'chrome://settings', 'app://ui/index.html', 'bonjour le monde', 'phosphore']) {
    assert.equal(toUrl(bad), null, bad);
  }
});

test('parse : adresses, recherche et commandes', () => {
  assert.deepEqual(parse('youtube.com', 'duckduckgo'), { type: 'navigate', url: 'https://youtube.com/', newTab: false });
  assert.deepEqual(parse('open youtube', 'duckduckgo'), { type: 'navigate', url: 'https://youtube.com/', newTab: true });
  assert.deepEqual(parse('météo lyon', 'google'), { type: 'navigate', url: 'https://www.google.com/search?q=m%C3%A9t%C3%A9o%20lyon', newTab: false });
  assert.deepEqual(parse('javascript:alert(1)', 'duckduckgo'), { type: 'navigate', url: 'https://duckduckgo.com/?q=javascript%3Aalert(1)', newTab: false });
  assert.deepEqual(parse('tab reopen', 'duckduckgo'), { type: 'tab', op: 'restore' });
  assert.deepEqual(parse('space new Jeux vidéo', 'duckduckgo'), { type: 'space', op: 'new', arg: 'Jeux vidéo' });
  assert.deepEqual(parse('space 2', 'duckduckgo'), { type: 'space', op: 'go', arg: '2' });
  assert.deepEqual(parse('folder new École', 'duckduckgo'), { type: 'folder', op: 'new', arg: 'École' });
  assert.deepEqual(parse('set theme vert', 'duckduckgo'), { type: 'set', key: 'theme', value: 'vert' });
  assert.equal(parse('tab danse', 'duckduckgo')?.type, 'error');
  assert.deepEqual(parse('view web', 'duckduckgo'), { type: 'view', mode: 'web' });
  assert.deepEqual(parse('seek 1:30', 'duckduckgo'), { type: 'media', op: 'seek', x: 90 });
  assert.deepEqual(parse('seek -10', 'duckduckgo'), { type: 'media', op: 'fwd', x: -10 });
  assert.equal(parse('seek demain', 'duckduckgo')?.type, 'error');
  assert.equal(parse('   ', 'duckduckgo'), null);
  assert.deepEqual(parse('close', 'google'), { type: 'tab', op: 'close' });
  assert.deepEqual(parse('close others', 'google'), { type: 'tab', op: 'close-others' });
  assert.deepEqual(parse('go 3', 'google'), { type: 'go', n: 3 });
  assert.deepEqual(parse('tab 2', 'google'), { type: 'go', n: 2 });
  assert.equal(parse('go 0', 'google')?.type, 'error');
  assert.deepEqual(parse('zoom 150', 'google'), { type: 'zoom', x: 150 });
  assert.deepEqual(parse('zoom out', 'google'), { type: 'zoom', x: 'out' });
  assert.equal(parse('zoom 9000', 'google')?.type, 'error');
  assert.deepEqual(parse('cd jeux', 'google'), { type: 'space', op: 'go', arg: 'jeux' });
  assert.deepEqual(parse('mkdir Cours', 'google'), { type: 'folder', op: 'new', arg: 'Cours' });
  assert.deepEqual(parse('exit', 'google'), { type: 'win', op: 'exit' });
  assert.deepEqual(parse('find chat noir', 'google'), { type: 'find', text: 'chat noir' });
  // Noms de vrai shell.
  assert.deepEqual(parse('grep prix', 'google'), { type: 'find', text: 'prix' });
  assert.deepEqual(parse('rm', 'google'), { type: 'tab', op: 'close' });
  assert.deepEqual(parse('rm 3', 'google'), { type: 'close', n: 3 });
  assert.deepEqual(parse('rm -others', 'google'), { type: 'tab', op: 'close-others' });
  assert.deepEqual(parse('start youtube', 'google'), { type: 'navigate', url: 'https://youtube.com/', newTab: true });
  assert.deepEqual(parse('start', 'google'), { type: 'tab', op: 'new' });
  assert.deepEqual(parse('ls', 'google'), { type: 'ls' });
  assert.deepEqual(parse('cd ..', 'google'), { type: 'tab', op: 'back' });
  assert.deepEqual(parse('cd +', 'google'), { type: 'tab', op: 'forward' });
  assert.deepEqual(parse('sel 2', 'google'), { type: 'go', n: 2 });
  assert.deepEqual(parse('md -space Travail', 'google'), { type: 'space', op: 'new', arg: 'Travail' });
  assert.deepEqual(parse('curl météo', 'google'), { type: 'navigate', url: 'https://www.google.com/search?q=m%C3%A9t%C3%A9o', newTab: false });
  assert.equal(parse('cd', 'google')?.type, 'error');
  assert.equal(parse('curl', 'google')?.type, 'error');
  assert.deepEqual(parse('top', 'google'), { type: 'page', page: 'perf' });
  assert.deepEqual(parse('eco', 'google'), { type: 'set', key: 'eco', value: 'toggle' });
  assert.deepEqual(parse('eco off', 'google'), { type: 'set', key: 'eco', value: 'off' });
  assert.deepEqual(parse('sidebar add history', 'google'), { type: 'sidebar', op: 'add', arg: 'history' });
  assert.deepEqual(parse('sidebar off', 'google'), { type: 'sidebar', op: 'off', arg: '' });
  assert.equal(parse('sidebar add', 'google')?.type, 'error');
  assert.deepEqual(parse('history clear', 'google'), { type: 'history-clear' });
  assert.deepEqual(parse('history météo', 'google'), { type: 'page', page: 'history', q: 'météo' });
  assert.deepEqual(parse('rmspace jeux', 'google'), { type: 'space', op: 'delete', arg: 'jeux' });
  assert.equal(parse('rmspace', 'google')?.type, 'error');
  assert.deepEqual(parse('import passwords', 'google'), { type: 'import-pass' });
  assert.deepEqual(parse('pass copy 3', 'google'), { type: 'pass', op: 'copy', n: 3, q: '' });
  assert.deepEqual(parse('pass ls google', 'google'), { type: 'pass', op: 'ls', n: 0, q: 'google' });
  assert.equal(parse('pass copy', 'google')?.type, 'error');
  assert.deepEqual(parse('ext rm 2', 'google'), { type: 'ext', op: 'rm', n: 2 });
  assert.deepEqual(parse('mod on youtube-sombre', 'google'), { type: 'mod', op: 'on', name: 'youtube-sombre' });
  assert.equal(parse('mod on ../../x', 'google')?.type, 'error');
});

test('réglages : valeurs validées, fichier abîmé nettoyé', () => {
  const s = defaults();
  assert.equal((applySetting(s, 'theme', 'vert') as typeof s).theme, 'green');
  assert.equal(typeof applySetting(s, 'theme', 'rose'), 'string');
  assert.equal(typeof applySetting(s, 'seal', '<img src=x>'), 'string');
  const clean = sanitize({ theme: 'white', boot: false, seal: 42, size: 'XL', evil: true });
  assert.equal(clean.theme, 'white');
  assert.equal(clean.boot, false);
  assert.equal(clean.size, 'XL');
  assert.equal('evil' in clean, false);
  assert.deepEqual(Object.keys(WIDGETS), WIDGET_IDS);
  assert.deepEqual(sanitize({ sidebar: ['history', 'pirate', 'history'] }).sidebar, ['history']);
  assert.equal((applySetting(s, 'eco', 'toggle') as typeof s).eco, true);
  assert.equal((applySetting(s, 'animations', 'false') as typeof s).reduceMotion, true);
  assert.equal((applySetting(s, 'suggestions', 'true') as typeof s).suggest, true);
  assert.equal((applySetting(s, 'spaces', 'true') as typeof s).sharedCookies, true);
  assert.equal(sanitize({ sharedCookies: true }).sharedCookies, true);
  assert.equal(sanitize({ extensions: ['C:\\ext\\ublock', 'relatif', 42] }).extensions.length, 1);
});

test('update / update install', () => {
  assert.deepEqual(parse('update'), { type: 'update', install: false });
  assert.deepEqual(parse('update install'), { type: 'update', install: true });
});
