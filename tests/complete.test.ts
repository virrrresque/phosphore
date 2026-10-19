import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complete, searchCommands, SET_KEYS, type Ctx } from '../src/shared/complete.ts';
import { COMMANDS, parse } from '../src/shared/command.ts';
import { applySetting, defaults } from '../src/main/settings.ts';

const ctx: Ctx = {
  spaces: ['GEN', 'VOYAGE'], tabs: ['YouTube', 'Twitch'],
  exts: [{ name: 'BetterTTV', off: false }, { name: '7TV', off: true }],
  mods: [{ name: 'sombre', on: true }, { name: 'gros-texte', on: false }],
  widgets: [{ id: 'history', desc: 'historique', on: true }, { id: 'clock', desc: 'horloge', on: false }],
  parts: [{ id: 'tabbar', desc: 'onglets', hidden: false }, { id: 'badge', desc: 'badge', hidden: true }],
  aliases: ['yt'], binds: ['alt+y'], shortcuts: ['https://twitch.tv/'], closed: ['Wikipedia'], sleepNever: ['discord.com'],
  colors: ['bg', 'clock'], texts: ['closed'],
};
const fills = (s: string) => complete(s, ctx).map(c => c.fill);

test('paramètres proposés selon la commande (comme Minecraft)', () => {
  assert.deepEqual(complete('ext rm ', ctx).map(c => [c.fill, c.desc]), [['ext rm 1', 'BetterTTV'], ['ext rm 2', '7TV (disabled)']]);
  assert.deepEqual(fills('ext on '), ['ext on 2']); // seulement les désactivées
  assert.deepEqual(fills('ext off '), ['ext off 1']);
  assert.deepEqual(fills('mod on '), ['mod on gros-texte']);
  assert.deepEqual(fills('sidebar add '), ['sidebar add clock']);
  assert.deepEqual(fills('sidebar move '), ['sidebar move history ']); // un paramètre suit : espace finale
  assert.deepEqual(fills('ui show '), ['ui show badge']);
  assert.deepEqual(fills('cd v'), ['cd voyage']);
  assert.deepEqual(fills('set th'), ['set theme ']);
  assert.deepEqual(fills('set theme '), ['set theme white', 'set theme green', 'set theme amber']);
  assert.deepEqual(fills('set color c'), ['set color clock ']);
  assert.ok(fills('set color clock ').includes('set color clock #ffffff'));
  assert.deepEqual(fills('sleep never rm '), ['sleep never rm discord.com']);
  assert.deepEqual(fills('reopen '), ['reopen 1']);
  assert.deepEqual(fills('mv 2 '), ['mv 2 gen', 'mv 2 voyage']);
  assert.deepEqual(fills('ext'), []); // nom de commande : c'est la liste des commandes qui s'en charge
  assert.deepEqual(fills('start youtube'), []);
});

test('chaque valeur proposée pour set est acceptée', () => {
  for (const [key, , values] of SET_KEYS) {
    if (key === 'css' || key === 'color' || key === 'text') continue; // ces réglages prennent deux paramètres
    for (const v of values) assert.notEqual(typeof applySetting(defaults(), key, v), 'string', `set ${key} ${v}`);
  }
});

test('recherche par mots-clés', () => {
  const first = (q: string) => searchCommands(q, COMMANDS).map(([c]) => c.trim());
  assert.ok(first('sidebar width').includes('set sidebar-width'));
  assert.ok(first('largeur barre').includes('set sidebar-width'));
  assert.ok(first('veille onglet').length > 0);
  assert.deepEqual(first('x'), []);
  // Chaque commande proposée par la recherche se lit sans erreur une fois complétée par un exemple.
  for (const [c] of searchCommands('son', COMMANDS)) if (!c.endsWith(' ')) assert.notEqual(parse(c, 'duckduckgo')?.type, 'error', c);
});

test('descriptions en anglais, recherche aussi en français', () => {
  assert.ok(COMMANDS.every(([, en, fr]) => en && fr), 'chaque commande a sa description anglaise et ses mots français');
  const first = (q: string) => searchCommands(q, COMMANDS).map(([c]) => c.trim());
  assert.ok(first('largeur barre').includes('set sidebar-width')); // français (réglage)
  assert.ok(first('fermer les autres').includes('rm -others'));    // français (commande)
  assert.ok(first('close other').includes('rm -others'));          // anglais
  assert.ok(first('capture page').includes('screenshot'));
  const [, desc] = searchCommands('capture', COMMANDS)[0];
  assert.match(desc, /screenshot/); // ce qui est affiché est la description anglaise
});
