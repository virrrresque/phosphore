import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { parse } from '../src/shared/command.ts';
import { COLORS, DEFAULT_PROMPT, NEWPAGE, PARTS, TEXTS } from '../src/shared/types.ts';
import { applySetting, COLOR_IDS, defaults, NEWPAGE_IDS, normKey, PART_IDS, sanitize, TEXT_IDS, toCommands } from '../src/main/settings.ts';
import { crxToZip, storeId, unzip } from '../src/main/crx.ts';
import { bigText } from '../src/ui/ascii.ts';

const S = (k: string, v: string) => applySetting(defaults(), k, v);

test('listes recopiées dans settings.ts identiques à celles de types.ts', () => {
  assert.deepEqual(NEWPAGE_IDS, [...NEWPAGE]);
  assert.deepEqual(COLOR_IDS, Object.keys(COLORS));
  assert.equal(defaults().prompt, DEFAULT_PROMPT);
});

test('nouveaux réglages validés', () => {
  assert.deepEqual((S('newpage', 'clock,shortcuts') as ReturnType<typeof defaults>).newpage, ['clock', 'shortcuts']);
  assert.deepEqual((S('newpage', 'none') as ReturnType<typeof defaults>).newpage, []);
  assert.equal(typeof S('newpage', 'pub'), 'string');
  assert.equal((S('color', 'accent #FF8800') as ReturnType<typeof defaults>).colors.accent, '#ff8800');
  assert.equal(typeof S('color', 'accent red;background:url(x)'), 'string');
  assert.equal(typeof S('color', 'pirate #fff'), 'string');
  assert.equal((S('sidebar-width', '240') as ReturnType<typeof defaults>).sideWidth, 240);
  assert.equal(typeof S('sidebar-width', '5000'), 'string');
  assert.equal((S('closed-max', '3') as ReturnType<typeof defaults>).closedMax, 3);
  assert.equal((S('newtab', 'next') as ReturnType<typeof defaults>).newTabEnd, false);
  assert.equal((S('lang', 'en-US') as ReturnType<typeof defaults>).lang, 'en-US');
  assert.equal(typeof S('font', 'x;}body{'), 'string');
  assert.equal((S('prompt', '"{user}@{space} $"') as ReturnType<typeof defaults>).prompt, '{user}@{space} $ ');
  assert.equal(defaults().closedMax, 3);
});

test('settings.json abîmé : nouveaux champs nettoyés', () => {
  const s = sanitize({ colors: { accent: '#123456', bg: 'javascript:1', evil: '#fff' }, binds: { 'ALT+Y': 'start youtube.com', y: 'rm' }, aliases: { yt: 'start youtube.com', '../x': 'rm' },
    shortcuts: ['https://twitch.tv/', 'file:///c:/x'], newpage: [], sideWidth: 9999, unloadSpaces: false });
  assert.deepEqual(s.colors, { accent: '#123456' });
  assert.deepEqual(s.binds, { 'alt+y': 'start youtube.com' });
  assert.deepEqual(s.aliases, { yt: 'start youtube.com' });
  assert.deepEqual(s.shortcuts, ['https://twitch.tv/']);
  assert.deepEqual(s.newpage, []);
  assert.equal(s.sideWidth, defaults().sideWidth);
  assert.equal(s.unloadSpaces, false);
});

test('touches de bind : Ctrl ou Alt obligatoire (sauf F1-F24)', () => {
  assert.equal(normKey('Shift+Ctrl+K'), 'ctrl+shift+k');
  assert.equal(normKey('f2'), 'f2');
  assert.equal(normKey('y'), null);
  assert.equal(normKey('shift+y'), null);
  assert.equal(normKey('ctrl+alt'), null);
});

test('nouvelles commandes', () => {
  const p = (s: string) => parse(s, 'duckduckgo');
  assert.deepEqual(p('pip'), { type: 'pip' });
  assert.deepEqual(p('speed 1.5'), { type: 'media', op: 'speed', x: 1.5 });
  assert.equal(p('speed 99')?.type, 'error');
  assert.deepEqual(p('mv jeux'), { type: 'mv', which: 'cur', space: 'jeux' });
  assert.deepEqual(p('mv 3 jeux'), { type: 'mv', which: 3, space: 'jeux' });
  assert.deepEqual(p('mv all ecole'), { type: 'mv', which: 'all', space: 'ecole' });
  assert.deepEqual(p('history rm 3 5-7'), { type: 'history-rm', ns: [3, 5, 6, 7], site: '' });
  assert.deepEqual(p('history rm youtube.com'), { type: 'history-rm', ns: [], site: 'youtube.com' });
  assert.deepEqual(p('private'), { type: 'private', url: '' });
  assert.deepEqual(p('private youtube'), { type: 'private', url: 'https://youtube.com/' });
  assert.deepEqual(p('alias yt start youtube.com'), { type: 'alias', op: 'set', name: 'yt', cmd: 'start youtube.com' });
  assert.deepEqual(p('bind alt+y start youtube.com'), { type: 'bind', op: 'set', name: 'alt+y', cmd: 'start youtube.com' });
  assert.deepEqual(p('shortcut add twitch.tv'), { type: 'shortcut', op: 'add', arg: 'https://twitch.tv/' });
  assert.deepEqual(p('mod import C:\\mods\\x.css'), { type: 'mod', op: 'import', name: 'C:\\mods\\x.css' });
  assert.deepEqual(p('ext store https://chromewebstore.google.com/detail/betterttv/ajopnjidmegmdimjlfnijceegpefgped'),
    { type: 'ext', op: 'store', n: 0, arg: 'https://chromewebstore.google.com/detail/betterttv/ajopnjidmegmdimjlfnijceegpefgped' });
  assert.deepEqual(p('source C:\\config.txt'), { type: 'source', file: 'C:\\config.txt' });
});

test('Chrome Web Store : identifiant, en-tête crx, extraction zip sûre', () => {
  assert.equal(storeId('https://chromewebstore.google.com/detail/betterttv/ajopnjidmegmdimjlfnijceegpefgped?hl=fr'), 'ajopnjidmegmdimjlfnijceegpefgped');
  assert.equal(storeId('pas un id'), null);
  // Petit zip fait main : un fichier compressé, un fichier _metadata (ignoré).
  const entry = (name: string, data: Buffer, offset: number) => {
    const comp = deflateRawSync(data), n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(offset, 42);
    return { local: Buffer.concat([local, n, comp]), cd: Buffer.concat([cd, n]) };
  };
  const build = (names: string[]) => {
    let off = 0; const locals: Buffer[] = [], cds: Buffer[] = [];
    for (const nm of names) { const e = entry(nm, Buffer.from('{"name":"x"}'), off); locals.push(e.local); cds.push(e.cd); off += e.local.length; }
    const cd = Buffer.concat(cds), eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(names.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
    return Buffer.concat([...locals, cd, eocd]);
  };
  const zip = build(['manifest.json', '_metadata/verified_contents.json']);
  const head = Buffer.alloc(12); head.write('Cr24', 0, 'latin1'); head.writeUInt32LE(3, 4); head.writeUInt32LE(0, 8);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phos-crx-'));
  assert.equal(unzip(crxToZip(Buffer.concat([head, zip])), dir), 1);
  assert.equal(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'), '{"name":"x"}');
  assert.throws(() => unzip(build(['../evil.txt']), dir));
  assert.throws(() => crxToZip(Buffer.from('<html>')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('personnalisation totale : css, textes, éléments masqués, export', () => {
  assert.deepEqual(PART_IDS, Object.keys(PARTS));
  assert.deepEqual(TEXT_IDS, Object.keys(TEXTS));
  const d = defaults();
  const css = S('css', '--bg-2 #202020') as typeof d;
  assert.equal(css.css['--bg-2'], '#202020');
  assert.equal(typeof S('css', '--side-w 220px'), 'string'); // un seul réglage pour la largeur : set sidebar-width
  for (const bad of ['--x red;}body{', '--x url(https://evil)', 'color red', '--x a</style>']) assert.equal(typeof S('css', bad), 'string', bad);
  assert.equal((S('text', 'closed "récents"') as typeof d).texts.closed, 'récents');
  assert.equal(typeof S('text', 'pirate x'), 'string');
  const sp = S('color', 'spaces #ffffff') as typeof d;
  assert.equal(sp.colors.space1, '#ffffff');
  assert.equal(sp.colors.space6, '#ffffff');
  assert.equal((S('sidebar-side', 'right') as typeof d).sideRight, true);
  assert.deepEqual(sanitize({ hidden: ['tabbar', 'evil'], css: { '--a': '1px', '--b': 'url(x)' } }).hidden, ['tabbar']);
  assert.deepEqual(sanitize({ css: { '--a': '1px', '--b': 'url(x)' } }).css, { '--a': '1px' });
  // Chaque ligne de « settings export » est une commande valide.
  const full = { ...d, colors: { clock: '#ffffff' }, css: { '--bg-2': '#202020' }, texts: { closed: 'récents' }, hidden: ['tabbar' as const], aliases: { yt: 'start youtube.com' }, binds: { 'alt+y': 'pip' }, mods: ['x'] };
  for (const line of toCommands(full).filter(l => !l.startsWith('#'))) {
    const a = parse(line, 'duckduckgo');
    assert.ok(a && a.type !== 'error' && a.type !== 'navigate', line);
  }
  assert.deepEqual(parse('ui hide tabbar', 'duckduckgo'), { type: 'ui', op: 'hide', part: 'tabbar' });
  assert.deepEqual(parse('sidebar move history 1', 'duckduckgo'), { type: 'sidebar', op: 'move', arg: 'history', n: 1 });
  assert.deepEqual(parse('sidebar order clock,closed', 'duckduckgo'), { type: 'sidebar', op: 'order', arg: 'clock,closed' });
  assert.deepEqual(parse('ext store', 'duckduckgo'), { type: 'ext', op: 'store', n: 0, arg: '' });
  assert.deepEqual(parse('settings export', 'duckduckgo'), { type: 'settings-op', op: 'export' });
});

test('horloge ASCII : 6 lignes de même largeur', () => {
  const lines = bigText('12:34');
  assert.equal(lines.length, 6);
  assert.equal(new Set(lines.map(l => l.length)).size, 1);
});

test('Chrome Web Store : recherche et fiche lues en texte seulement', async () => {
  const { parseSearch, parseDetail, text } = await import('../src/main/webstore.ts');
  const card = (id: string, name: string) => `<div data-item-id="${id}"><a href="./detail/x/${id}"></a><h2 class="z">${name}</h2><span aria-label="Note moyenne : 4,2 étoile(s) sur 5."></span></div>`;
  const list = parseSearch(card('a'.repeat(32), 'Bloqueur &amp; <b>Twitch</b>') + card('a'.repeat(32), 'doublon') + card('b'.repeat(32), '<img src=x onerror=alert(1)>'));
  assert.deepEqual(list, [{ id: 'a'.repeat(32), name: 'Bloqueur & Twitch', rating: '4,2' }]); // doublon et nom vide ignorés, balises retirées
  const d = parseDetail('c'.repeat(32), '<meta property="og:title" content="BetterTTV - Chrome Web Store"><meta property="og:description" content="Résumé &quot;court&quot;">'
    + '<h2>Présentation</h2><div>Résumé "court"Long texte<br>ligne 2</div><span>4,0 sur 5</span><h2>Détails</h2><div>Version</div><div>7.7.28</div><div>3 000 000 utilisateurs</div>');
  assert.equal(d.name, 'BetterTTV');
  assert.equal(d.summary, 'Résumé "court"');
  assert.equal(d.about, 'Long texte\nligne 2');
  assert.equal(d.version, '7.7.28');
  assert.equal(d.users, '3 000 000');
  assert.equal(text('&#233;t&#xE9; &lt;3'), 'été <3');
});
