// Mise en veille et fermeture automatiques des onglets. Logique pure ou à horloge injectée : testée sans attendre (tests/sleep.test.ts).

/** Horloge et minuterie injectables (setTimeout / Date.now en vrai, fausses dans les tests). */
export interface Clock {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
export const realClock: Clock = { now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as NodeJS.Timeout) };

/** Un minuteur par onglet : relancer remplace l'ancien, annuler ou oublier ne laisse rien derrière. */
export class TabTimers {
  private timers = new Map<string, unknown>();
  private clock: Clock;
  private fire: (id: string) => void;
  // Champs déclarés à part : les tests chargent ce fichier en TypeScript « sans types », qui refuse « constructor(private x) ».
  constructor(clock: Clock, fire: (id: string) => void) { this.clock = clock; this.fire = fire; }
  start(id: string, ms: number): void {
    this.cancel(id);
    this.timers.set(id, this.clock.set(() => { this.timers.delete(id); this.fire(id); }, ms));
  }
  cancel(id: string): void {
    const h = this.timers.get(id);
    if (h !== undefined) { this.clock.clear(h); this.timers.delete(id); }
  }
  has(id: string): boolean { return this.timers.has(id); }
  /** Garde seulement les onglets encore présents (Space supprimé, onglet fermé : minuteurs nettoyés). */
  keep(ids: Set<string>): void { for (const id of [...this.timers.keys()]) if (!ids.has(id)) this.cancel(id); }
  get size(): number { return this.timers.size; }
}

/** Site dans la liste « jamais en veille » (le domaine ou un de ses sous-domaines). */
export function neverSleeps(url: string, never: string[]): boolean {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return false; }
  return never.some(d => host === d || host.endsWith('.' + d));
}

export type TabFacts = { id: string; spaceId: string; url: string; pinned: boolean; live: boolean; audible: boolean; seenAt: number };
export type SweepOptions = {
  now: number; activeSpace: string; current: string | null;
  idleMin: number; ecoMin: number; eco: boolean; sleepPinned: boolean; never: string[]; closeIdleMin: number;
};

/**
 * Passage périodique (toutes les minutes) : onglets à endormir (idle-sleep, eco-sleep) et à fermer (close-idle).
 * Jamais touchés : l'onglet affiché, ceux qui jouent du son, les sites « sleep-never ». Épinglés : endormis seulement si sleep-pinned.
 * close-idle : Spaces inactifs seulement, jamais un épinglé, et chaque Space garde au moins un onglet.
 */
export function sweep(tabs: TabFacts[], o: SweepOptions): { sleep: string[]; close: string[] } {
  const exempt = (t: TabFacts) => t.id === o.current || t.audible || neverSleeps(t.url, o.never);
  const idle = o.eco ? o.ecoMin : o.idleMin;
  const old = (t: TabFacts, min: number) => min > 0 && o.now - t.seenAt >= min * 60_000;
  const sleep = tabs.filter(t => t.live && !exempt(t) && (o.sleepPinned || !t.pinned) && old(t, idle)).map(t => t.id);
  const close: string[] = [];
  if (o.closeIdleMin > 0) {
    const bySpace = new Map<string, TabFacts[]>();
    for (const t of tabs) if (t.spaceId !== o.activeSpace) bySpace.set(t.spaceId, [...(bySpace.get(t.spaceId) ?? []), t]);
    for (const list of bySpace.values()) {
      const gone = list.filter(t => !exempt(t) && !t.pinned && old(t, o.closeIdleMin));
      // Le Space ne doit jamais se vider : si tout partirait, l'onglet vu le plus récemment reste.
      if (gone.length === list.length) gone.splice(gone.indexOf(gone.reduce((a, b) => (b.seenAt > a.seenAt ? b : a))), 1);
      close.push(...gone.map(t => t.id));
    }
  }
  return { sleep: sleep.filter(id => !close.includes(id)), close };
}
