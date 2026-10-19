import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { convertOpera, isOperaMod, LIMITS, renamed, safeAudioName, sampleMod, tone, validateSoundMod, type Source } from '../src/main/soundmods.ts';
import { SOUND_EVENTS } from '../src/shared/sounds.ts';
import { SOUND_KEYS } from '../src/shared/types.ts';
import { applySetting, defaults, sanitize, SOUND_KEY_IDS, toCommands } from '../src/main/settings.ts';
import { parse } from '../src/shared/command.ts';

/** Source en mémoire : nom → contenu (ou taille seule pour simuler un gros fichier). */
const mem = (files: Record<string, Buffer | number>): Source => ({
  files: () => new Map(Object.entries(files).map(([n, v]) => [n, typeof v === 'number' ? v : v.length])),
  read: n => { const v = files[n]; if (v === undefined) throw new Error('absent ' + n); return typeof v === 'number' ? Buffer.alloc(v) : v; },
});

test('mod de sons valide, et chaque borne', () => {
  const ok = validateSoundMod({ name: 'Test', volume: 0.5, sounds: { key: ['a.wav', 'b.wav'], 'tab-new': { files: 'c.ogg', volume: 0.3 } } }, mem({ 'a.wav': 10, 'b.wav': 10, 'c.ogg': 10 }));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.mod, { name: 'Test', volume: 0.5, sounds: { key: { files: ['a.wav', 'b.wav'], volume: 1 }, 'tab-new': { files: ['c.ogg'], volume: 0.3 } } });

  const bad = validateSoundMod({ volume: 3, sounds: {
    key: 'gros.wav', 'key-enter': '../../evil.wav', 'key-back': 'sous/dossier.mp3', 'key-space': 'script.js', 'tab-close': 'absent.wav',
    'tab-switch': { files: 'ok.wav', volume: -1 }, explode: 'ok.wav', boot: 'ok.wav',
  } }, mem({ 'gros.wav': LIMITS.file + 1, 'ok.wav': 100 }));
  assert.equal(bad.mod.volume, 1);
  assert.deepEqual(Object.keys(bad.mod.sounds).sort(), ['boot', 'tab-switch']); // le reste du mod est gardé
  assert.equal(bad.mod.sounds['tab-switch']!.volume, 1);
  const all = bad.errors.join('\n');
  for (const word of ['volume du mod', 'gros.wav', '../../evil.wav', 'sous/dossier.mp3', 'script.js', 'absent.wav', 'explode']) assert.ok(all.includes(word), word);

  // 5 Mo par mod au plus : les fichiers en trop sont ignorés.
  const big = validateSoundMod({ sounds: { key: ['1.wav', '2.wav', '3.wav', '4.wav', '5.wav', '6.wav', '7.wav', '8.wav', '9.wav', '10.wav', '11.wav'] } },
    mem(Object.fromEntries(Array.from({ length: 11 }, (_, k) => [`${k + 1}.wav`, LIMITS.file]))));
  assert.ok(big.mod.sounds.key!.files.length <= LIMITS.variants);
  assert.ok(big.mod.sounds.key!.files.length * LIMITS.file <= LIMITS.mod);
  assert.equal(safeAudioName('..wav'), false);
  assert.equal(safeAudioName('a\\b.wav'), false);
});

// Échantillon réduit d'un vrai mod Opera GX (structure relevée sur « Lethal Company Mod », schéma 1, et « LoFi Chill », schéma 2).
const opera1 = { name: 'Lethal Company Mod', manifest_version: 3, mod: { schema_version: 1, license: 'license.txt', payload: {
  background_music: ['music/track_1.mp3'], wallpaper: { dark: {}, light: {} }, page_styles: [{ css: ['webmodding/style.css'], matches: ['*://*/*'] }],
  browser_sounds: { CLICK: ['sound/click.mp3'], TAB_CLOSE: ['sound/close_tab.mp3'], TAB_INSERT: ['sound/new_tab.mp3'], TAB_SLASH: ['sound/tab_slash.mp3'] },
  keyboard_sounds: { TYPING_BACKSPACE: ['keyboard/backspace.mp3'], TYPING_ENTER: ['keyboard/enter.mp3'], TYPING_LETTER: ['keyboard/letter_1.mp3', 'keyboard/letter_2.mp3'], TYPING_SPACE: ['keyboard/space.mp3'] },
} } };
const opera2 = { name: 'LoFi Chill', mod: { schema_version: 2, payload: {
  browser_sounds: [{ id: '0', name: 'LoFi', sounds: { TAB_INSERT: ['sounds/tab.mp3'] } }],
  keyboard_sounds: [{ id: '0', name: 'LoFi', sounds: { TYPING_LETTER: ['sounds/keyboard1.mp3'], TYPING_ENTER: ['../../etc/passwd'] } }],
  cursors: [{ id: '0' }],
} } };

test('import Opera GX : correspondance des événements, le reste ignoré et listé', () => {
  assert.equal(isOperaMod(opera1), true);
  assert.equal(isOperaMod({ name: 'extension normale', manifest_version: 3 }), false);
  const c = convertOpera(opera1);
  assert.deepEqual(c.raw.sounds, {
    'tab-close': ['sound_close_tab.mp3'], 'tab-new': ['sound_new_tab.mp3'], 'key-back': ['keyboard_backspace.mp3'],
    'key-enter': ['keyboard_enter.mp3'], key: ['keyboard_letter_1.mp3', 'keyboard_letter_2.mp3'], 'key-space': ['keyboard_space.mp3'],
  });
  const ign = c.ignored.join('\n');
  for (const w of ['background_music', 'wallpaper', 'page_styles', 'CLICK', 'TAB_SLASH']) assert.ok(ign.includes(w), w);
  // Validation sur les fichiers d'origine (dans leurs sous-dossiers), sous les noms à plat.
  const files = Object.fromEntries([...c.copy.values()].map(p => [p, 1000]));
  const { mod, errors } = validateSoundMod(c.raw, renamed(mem(files), c.copy));
  assert.deepEqual(errors, []);
  assert.equal(Object.keys(mod.sounds).length, 6);

  const c2 = convertOpera(opera2); // schéma 2 (listes de jeux)
  assert.deepEqual(c2.raw.sounds, { 'tab-new': ['sounds_tab.mp3'], key: ['sounds_keyboard1.mp3'] });
  assert.ok(c2.ignored.some(x => x.includes('../../etc/passwd')));
  assert.ok(c2.ignored.some(x => x.includes('cursors')));
});

test('archive : trop grosse, trop de fichiers, bombe zip, chemin piégé', async () => {
  const { zipSource, openSource, importSoundMod } = await import('../src/main/soundio.ts');
  const zip = (entries: [string, Buffer, number?][]) => {
    let off = 0; const locals: Buffer[] = [], cds: Buffer[] = [];
    for (const [name, data, fakeSize] of entries) {
      const comp = deflateRawSync(data), n = Buffer.from(name);
      const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(fakeSize ?? data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
      locals.push(Buffer.concat([l, n, comp])); cds.push(Buffer.concat([c, n])); off += 30 + n.length + comp.length;
    }
    const cd = Buffer.concat(cds), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
    return Buffer.concat([...locals, cd, e]);
  };
  assert.throws(() => zipSource(zip([['../evil.wav', Buffer.from('x')]])), /chemin interdit/);
  // Bombe : 1 Mo de zéros annoncés comme 10 octets → décompression bornée, refus.
  const bomb = zipSource(zip([['mod.json', Buffer.alloc(1_000_000), 10]]));
  assert.throws(() => bomb.read('mod.json'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phos-snd-'));
  const huge = path.join(dir, 'huge.zip');
  fs.writeFileSync(huge, Buffer.alloc(0));
  fs.truncateSync(huge, LIMITS.archive + 1);
  assert.throws(() => openSource(huge), /trop grosse/);
  // Import complet d'un mod Opera (zip) : seuls mod.json et les sons sont écrits.
  const wav = tone(440, 20);
  const z = zip([['manifest.json', Buffer.from(JSON.stringify(opera1))], ['keyboard/letter_1.mp3', wav], ['keyboard/enter.mp3', wav], ['wallpaper/video.webm', Buffer.alloc(100)], ['webmodding/style.css', Buffer.from('body{}')]]);
  const mods = path.join(dir, 'mods');
  const r = importSoundMod(zipSource(z), mods);
  assert.equal(r.opera, true);
  assert.equal(r.name, 'lethal-company-mod');
  assert.deepEqual(fs.readdirSync(path.join(mods, r.name)).sort(), ['keyboard_enter.mp3', 'keyboard_letter_1.mp3', 'mod.json']);
  assert.ok(r.errors.some(e => e.includes('absent'))); // les sons absents de l'échantillon sont signalés, sans bloquer
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mod d\'exemple, réglages et commandes des sons', () => {
  const s = sampleMod('test');
  assert.equal(tone(440, 10).toString('latin1', 0, 4), 'RIFF');
  const files = Object.fromEntries(s.files.map(([n, b]) => [n, b]));
  const v = validateSoundMod(JSON.parse(s.json), mem(files));
  assert.deepEqual(v.errors, []);
  assert.ok(Object.keys(v.mod.sounds).every(e => (SOUND_EVENTS as readonly string[]).includes(e)));
  assert.deepEqual(SOUND_KEY_IDS, [...SOUND_KEYS]);
  const d = defaults();
  assert.equal(d.sound, true);
  assert.equal(d.soundVolume, 40);
  assert.equal((applySetting(d, 'sound-volume', '60') as typeof d).soundVolume, 60);
  assert.equal(typeof applySetting(d, 'sound-volume', '101'), 'string');
  assert.equal(sanitize({ soundVolume: 500 }).soundVolume, 40);
  assert.ok(toCommands(d).includes('set sound-volume 40'));
  assert.deepEqual(parse('mod new sound test', 'duckduckgo'), { type: 'mod', op: 'new-sound', name: 'test' });
  assert.equal(parse('mod new sound', 'duckduckgo')?.type, 'error');
});
