// Lecteur des sons de l'interface (mod de sons). Les octets audio viennent du principal, déjà validés ; rien n'est lu ici.
import { isSoundEvent, type SoundEvent, type SoundPack } from '../shared/sounds.js';

const MAX_VOICES = 4;      // polyphonie
const KEY_GAP_MS = 35;     // anti-rafale : frappe très rapide = un son toutes les 35 ms au plus
const BOOT_WINDOW_MS = 4000;

let ctx: AudioContext | null = null;
let pack: SoundPack | null = null;
let decoded = new Map<SoundEvent, AudioBuffer[]>();
let voices = 0, lastKey = 0, bootAt = 0;
const startedAt = performance.now();

async function decodeAll(p: SoundPack) {
  const out = new Map<SoundEvent, AudioBuffer[]>();
  for (const [ev, s] of Object.entries(p.sounds)) {
    if (!isSoundEvent(ev) || !s) continue;
    // Un fichier illisible est simplement ignoré (le principal a déjà vérifié noms et tailles).
    const bufs = await Promise.all(s.data.map(d => ctx!.decodeAudioData(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer).catch(() => null)));
    out.set(ev, bufs.filter((b): b is AudioBuffer => !!b));
  }
  if (pack === p) decoded = out;
}

export function setPack(p: SoundPack | null) {
  pack = p && typeof p === 'object' && p.sounds && typeof p.sounds === 'object' ? p : null;
  decoded = new Map();
  if (ctx && pack) void decodeAll(pack);
}

/** Premier geste de l'utilisateur : le seul AudioContext est créé ici (les navigateurs l'exigent). */
function unlock() {
  if (ctx) return;
  ctx = new AudioContext();
  removeEventListener('keydown', unlock, true);
  removeEventListener('pointerdown', unlock, true);
  if (pack) void decodeAll(pack).then(() => { if (bootAt && performance.now() - startedAt < BOOT_WINDOW_MS) play('boot', lastOpts); });
}
addEventListener('keydown', unlock, true);
addEventListener('pointerdown', unlock, true);

let lastOpts = { volume: 0.4, enabled: true };
/** Joue le son d'un événement (variante au hasard). Silencieux si le mod n'a pas de son pour cet événement. */
export function play(ev: string, opts: { volume: number; enabled: boolean }) {
  lastOpts = opts;
  if (!isSoundEvent(ev) || !opts.enabled) return;
  if (ev === 'boot' && !ctx) { bootAt = performance.now(); return; } // joué au premier geste, s'il arrive tout de suite
  if (!ctx || !pack) return;
  const now = performance.now();
  if (ev.startsWith('key')) { if (now - lastKey < KEY_GAP_MS) return; lastKey = now; }
  const list = decoded.get(ev);
  if (!list?.length || voices >= MAX_VOICES) return;
  const src = ctx.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1, Math.max(0, opts.volume * pack.volume * (pack.sounds[ev]?.volume ?? 1)));
  src.connect(gain).connect(ctx.destination);
  voices++;
  src.onended = () => { voices--; };
  src.start();
}

/** Événement de frappe pour une touche du clavier (null : pas de son). */
export function keyEvent(e: KeyboardEvent): SoundEvent | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === 'Enter') return 'key-enter';
  if (e.key === 'Backspace' || e.key === 'Delete') return 'key-back';
  if (e.key === ' ') return 'key-space';
  return e.key.length === 1 ? 'key' : null;
}
