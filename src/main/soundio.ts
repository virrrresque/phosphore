// Lecture des mods de sons sur le disque (processus principal seulement ; l'interface ne donne jamais de chemin).
// Imports en .ts : chargé tel quel par les tests ; tsc les réécrit en .js (rewriteRelativeImportExtensions).
import fs from 'node:fs';
import path from 'node:path';
import { crxToZip, zipIndex, zipRead } from './crx.ts';
import { convertOpera, isOperaMod, LIMITS, modName, renamed, validateSoundMod, type Source } from './soundmods.ts';
import type { SoundPack } from '../shared/sounds.ts';

/** Fichiers d'un dossier, sous-dossiers compris. Les liens symboliques sont refusés (ils pourraient pointer n'importe où). */
export function dirSource(dir: string): Source {
  const files = new Map<string, number>();
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) throw new Error(`lien symbolique refusé : ${r}`);
      if (st.isDirectory()) walk(full, r); else files.set(r, st.size);
      if (files.size > LIMITS.entries) throw new Error(`trop de fichiers (${LIMITS.entries} au plus)`);
    }
  };
  walk(dir, '');
  return { files: () => files, read: name => { if (!files.has(name)) throw new Error('fichier absent : ' + name); return fs.readFileSync(path.join(dir, ...name.split('/'))); } };
}

/** Fichiers d'une archive zip ou .crx (lus à la demande, jamais extraits en entier). */
export function zipSource(buf: Buffer): Source {
  const zip = buf.toString('latin1', 0, 4) === 'Cr24' ? crxToZip(buf) : buf;
  const index = zipIndex(zip, LIMITS.entries);
  for (const n of index.keys()) if (n.includes('..') || /^[/\\]|^[a-z]:/i.test(n)) throw new Error('chemin interdit dans l\'archive : ' + n);
  return { files: () => new Map([...index].map(([n, e]) => [n, e.size])), read: name => { const e = index.get(name); if (!e) throw new Error('fichier absent : ' + name); return zipRead(zip, e, name); } };
}

/** Dossier, .zip ou .crx. */
export function openSource(p: string): Source {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) throw new Error('lien symbolique refusé');
  if (st.isDirectory()) return dirSource(p);
  if (st.size > LIMITS.archive) throw new Error(`archive trop grosse (${Math.round(st.size / 2 ** 20)} Mo, ${LIMITS.archive / 2 ** 20} Mo au plus)`);
  return zipSource(fs.readFileSync(p));
}

const readJson = (src: Source, name: string) => {
  const size = src.files().get(name)!;
  if (size > LIMITS.json) throw new Error(`${name} trop gros (${Math.round(size / 1024)} Ko, 64 Ko au plus)`);
  return JSON.parse(src.read(name).toString('utf8').replace(/^﻿/, ''));
};

/**
 * Importe un mod de sons : notre format (mod.json) ou un mod Opera GX (manifest.json avec « mod »).
 * Le mod validé est recopié dans <mods>/<nom>/ : mod.json réécrit + fichiers audio seulement.
 */
export function importSoundMod(src: Source, modsDir: string): { name: string; events: number; errors: string[]; ignored: string[]; opera: boolean } {
  const files = src.files();
  // Le fichier de description peut être à la racine ou dans un seul sous-dossier (archive d'un dossier).
  const find = (base: string) => [...files.keys()].find(n => n === base || (n.endsWith('/' + base) && n.split('/').length === 2));
  let raw: unknown, view: Source = src, ignored: string[] = [], opera = false, prefix = '';
  const ours = find('mod.json'), manifest = find('manifest.json');
  if (ours) { prefix = ours.slice(0, -'mod.json'.length); raw = readJson(src, ours); }
  else if (manifest) {
    prefix = manifest.slice(0, -'manifest.json'.length);
    const m = readJson(src, manifest);
    if (!isOperaMod(m)) throw new Error('manifest.json trouvé, mais ce n\'est pas un mod Opera GX (pas de clé « mod ») : pour une extension, utilisez ext add');
    const c = convertOpera(m);
    raw = c.raw; ignored = c.ignored; opera = true;
    view = renamed(sub(src, prefix), c.copy);
  } else throw new Error('ni mod.json ni manifest.json : ce n\'est pas un mod de sons');
  if (!opera && prefix) view = sub(src, prefix);
  const { mod, errors } = validateSoundMod(raw, view);
  const events = Object.keys(mod.sounds).length;
  if (!events) throw new Error('aucun son utilisable · ' + [...errors, ...ignored].slice(0, 5).join(' · '));
  let name = modName(mod.name || 'sons') || 'sons';
  if (fs.existsSync(path.join(modsDir, name + '.css'))) name = (name.slice(0, 35) + '-sons'); // un mod CSS porte déjà ce nom
  const dir = path.join(modsDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set(Object.values(mod.sounds).flatMap(s => s!.files));
  for (const f of used) fs.writeFileSync(path.join(dir, f), view.read(f));
  fs.writeFileSync(path.join(dir, 'mod.json'), JSON.stringify({ name: mod.name || name, volume: mod.volume, sounds: mod.sounds }, null, 2));
  return { name, events, errors, ignored, opera };
}

/** Vue d'une source limitée à un sous-dossier (« dossier/ »). */
function sub(src: Source, prefix: string): Source {
  if (!prefix) return src;
  const all = src.files();
  return { files: () => new Map([...all].flatMap(([n, s]) => n.startsWith(prefix) ? [[n.slice(prefix.length), s] as [string, number]] : [])), read: n => src.read(prefix + n) };
}

/** Mods de sons installés : dossiers <mods>/<nom>/ qui contiennent un mod.json. */
export function soundModNames(modsDir: string): string[] {
  try { return fs.readdirSync(modsDir, { withFileTypes: true }).filter(e => e.isDirectory() && /^[a-z0-9_-]{1,40}$/.test(e.name) && fs.existsSync(path.join(modsDir, e.name, 'mod.json'))).map(e => e.name); } catch { return []; }
}

/** Charge et valide un mod de sons installé : octets audio prêts pour l'interface, et les erreurs éventuelles. */
export function loadSoundPack(modsDir: string, name: string): { pack: SoundPack; errors: string[] } {
  const src = dirSource(path.join(modsDir, name));
  const { mod, errors } = validateSoundMod(readJson(src, 'mod.json'), src);
  const sounds: SoundPack['sounds'] = {};
  for (const [ev, s] of Object.entries(mod.sounds)) sounds[ev as keyof typeof sounds] = { volume: s!.volume, data: s!.files.map(f => new Uint8Array(src.read(f))) };
  return { pack: { name: mod.name || name, volume: mod.volume, sounds }, errors };
}
