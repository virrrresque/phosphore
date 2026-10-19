// Mods de sons : de la DONNÉE seulement (un mod.json + des fichiers audio), jamais du code. Validation et conversion
// des mods Opera GX ici, sans accès Electron : testées dans tests/soundmods.test.ts.
// Import en .ts : les tests chargent ce fichier sans compilation ; tsc le réécrit en .js (rewriteRelativeImportExtensions).
import { isSoundEvent, SOUND_EVENTS, type SoundEvent } from '../shared/sounds.ts';

export const LIMITS = { json: 64 * 1024, file: 500 * 1024, mod: 5 * 1024 * 1024, archive: 100 * 1024 * 1024, entries: 3000, variants: 8 };

/** Fichiers lisibles d'un mod (dossier ou archive) : noms relatifs avec « / », taille en octets. */
export interface Source { files(): Map<string, number>; read(name: string): Buffer }

export type SoundMod = { name: string; volume: number; sounds: Partial<Record<SoundEvent, { files: string[]; volume: number }>> };

/** Nom de fichier audio accepté dans notre format : simple, sans dossier ni « .. ». */
export const safeAudioName = (n: string) => /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}\.(wav|ogg|mp3)$/i.test(n) && !n.includes('..');
/** Nom de mod : minuscules, chiffres, - et _, 40 caractères au plus. */
export const modName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const vol = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Valide un mod.json et ses fichiers. Une entrée invalide est ignorée avec un message clair, le reste du mod est gardé.
 * Format : { name, volume?: 0-1, sounds: { <événement>: "a.wav" | ["a.wav", "b.wav"] | { files, volume } } }
 */
export function validateSoundMod(raw: unknown, src: Source): { mod: SoundMod; errors: string[] } {
  const errors: string[] = [];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mod: SoundMod = { name: typeof r.name === 'string' ? r.name.slice(0, 60) : '', volume: 1, sounds: {} };
  if (r.volume !== undefined) { if (vol(r.volume)) mod.volume = r.volume as number; else errors.push('volume du mod hors de 0-1 : 1 utilisé'); }
  if (!r.sounds || typeof r.sounds !== 'object') { errors.push('pas de « sounds » dans mod.json'); return { mod, errors }; }
  const files = src.files();
  let total = 0;
  for (const [ev, v] of Object.entries(r.sounds as Record<string, unknown>)) {
    if (!isSoundEvent(ev)) { errors.push(`événement inconnu « ${ev.slice(0, 40)} » ignoré (connus : ${SOUND_EVENTS.join(', ')})`); continue; }
    const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : { files: v }) as { files?: unknown; volume?: unknown };
    const list = (Array.isArray(o.files) ? o.files : [o.files]).filter((f): f is string => typeof f === 'string');
    let volume = 1;
    if (o.volume !== undefined) { if (vol(o.volume)) volume = o.volume as number; else errors.push(`${ev} : volume hors de 0-1, 1 utilisé`); }
    const ok: string[] = [];
    for (const f of list.slice(0, LIMITS.variants)) {
      const size = files.get(f);
      if (!safeAudioName(f)) errors.push(`${ev} : nom de fichier refusé « ${f.slice(0, 60)} » (wav, ogg ou mp3, sans dossier ni ..)`);
      else if (size === undefined) errors.push(`${ev} : fichier absent « ${f} »`);
      else if (size > LIMITS.file) errors.push(`${ev} : « ${f} » fait ${Math.round(size / 1024)} Ko (500 Ko au plus)`);
      else if (total + size > LIMITS.mod) errors.push(`${ev} : « ${f} » dépasse les 5 Mo du mod, ignoré`);
      else { total += size; ok.push(f); }
    }
    if (list.length > LIMITS.variants) errors.push(`${ev} : ${LIMITS.variants} variantes au plus, les autres sont ignorées`);
    if (ok.length) mod.sounds[ev] = { files: ok, volume };
  }
  return { mod, errors };
}

/** Événements Opera GX qui ont un équivalent évident chez nous (relevés sur de vrais mods : schémas 1 et 2). */
export const OPERA_EVENTS: Record<string, SoundEvent> = {
  TYPING_LETTER: 'key', TYPING_ENTER: 'key-enter', TYPING_BACKSPACE: 'key-back', TYPING_SPACE: 'key-space',
  TAB_INSERT: 'tab-new', TAB_CLOSE: 'tab-close',
};

/** Le manifest.json est-il celui d'un mod Opera GX (extension avec une clé « mod ») ? */
export const isOperaMod = (m: unknown) => !!m && typeof m === 'object' && !!(m as { mod?: { payload?: unknown } }).mod?.payload;

/**
 * Convertit un mod Opera GX vers notre format. Seuls les sons sont repris ; fonds d'écran, musique, thèmes, CSS, curseurs…
 * sont ignorés et listés. Les fichiers sont renommés à plat (keyboard/letter_1.mp3 → keyboard_letter_1.mp3).
 */
export function convertOpera(manifest: unknown): { raw: { name: string; volume: number; sounds: Record<string, string[]> }; copy: Map<string, string>; ignored: string[] } {
  const m = manifest as { name?: unknown; mod: { payload: Record<string, unknown> } };
  const payload = m.mod.payload;
  const ignored: string[] = [];
  const copy = new Map<string, string>(); // nom à plat → chemin d'origine
  const sounds: Record<string, string[]> = {};
  for (const k of Object.keys(payload)) if (k !== 'browser_sounds' && k !== 'keyboard_sounds') ignored.push(`« ${k} » (pas un son de l'interface)`);
  for (const block of ['browser_sounds', 'keyboard_sounds']) {
    let set = payload[block];
    // Schéma 2 : liste de jeux [{ id, name, sounds }] ; on prend le premier.
    if (Array.isArray(set)) { if (set.length > 1) ignored.push(`${block} : ${set.length - 1} jeu(x) de sons en plus`); set = (set[0] as { sounds?: unknown })?.sounds; }
    if (!set || typeof set !== 'object') continue;
    for (const [ev, files] of Object.entries(set as Record<string, unknown>)) {
      const ours = OPERA_EVENTS[ev];
      if (!ours) { ignored.push(`événement Opera « ${ev.slice(0, 40)} » (pas d'équivalent)`); continue; }
      for (const f of (Array.isArray(files) ? files : [files]).filter((x): x is string => typeof x === 'string')) {
        if (f.includes('..') || /^[/\\]|^[a-z]:/i.test(f)) { ignored.push(`${ev} : chemin refusé « ${f.slice(0, 60)} »`); continue; }
        const flat = f.replace(/[/\\]+/g, '_').replace(/[^A-Za-z0-9 _.-]/g, '-').slice(-80);
        copy.set(flat, f.replace(/\\/g, '/'));
        (sounds[ours] ??= []).push(flat);
      }
    }
  }
  return { raw: { name: typeof m.name === 'string' ? m.name.slice(0, 60) : 'opera', volume: 1, sounds }, copy, ignored };
}

/** Source vue sous les noms à plat de convertOpera (la validation et la copie lisent les fichiers d'origine). */
export function renamed(src: Source, copy: Map<string, string>): Source {
  const all = src.files();
  return {
    files: () => new Map([...copy].flatMap(([flat, orig]) => all.has(orig) ? [[flat, all.get(orig)!] as [string, number]] : [])),
    read: name => src.read(copy.get(name) ?? '\0'),
  };
}

/** Son court synthétisé (WAV 16 bits mono) pour le mod d'exemple de « mod new sound ». */
export function tone(freq: number, ms: number, volume = 0.4): Buffer {
  const rate = 22050, n = Math.round(rate * ms / 1000);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * (1 - i / n) * volume * 32767), 44 + i * 2);
  return b;
}

/** Mod d'exemple : quelques bips, un fichier par événement, prêt à remplacer par ses propres sons. */
export function sampleMod(name: string): { json: string; files: [string, Buffer][] } {
  const files: [string, Buffer][] = [['key.wav', tone(1400, 18, 0.25)], ['enter.wav', tone(700, 60)], ['back.wav', tone(500, 30, 0.3)],
    ['tab-new.wav', tone(880, 70)], ['tab-close.wav', tone(440, 70)], ['switch.wav', tone(990, 35, 0.3)], ['error.wav', tone(220, 140)], ['boot.wav', tone(660, 200)]];
  const json = JSON.stringify({
    name, volume: 1,
    sounds: { key: 'key.wav', 'key-space': 'key.wav', 'key-enter': 'enter.wav', 'key-back': 'back.wav', 'tab-new': 'tab-new.wav', 'tab-close': 'tab-close.wav',
      'tab-switch': 'switch.wav', 'space-switch': { files: 'switch.wav', volume: 0.6 }, 'cmd-error': 'error.wav', boot: 'boot.wav' },
    _aide: `Remplacez les fichiers par vos sons (wav, ogg ou mp3, 500 Ko max, 5 Mo par mod). Événements : ${SOUND_EVENTS.join(', ')}. Une liste [\"a.wav\", \"b.wav\"] joue une variante au hasard.`,
  }, null, 2);
  return { json, files };
}
