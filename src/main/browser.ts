// Onglets, dossiers et Spaces. Seul endroit qui crée ou détruit les vues web.
import { app, BaseWindow, WebContentsView, type Input, type Rectangle, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { VIRTUAL_WIDTH } from './webtext.js';
import type { SoundEvent } from '../shared/sounds.js';
import { neverSleeps, realClock, sweep, TabTimers, type Clock, type SweepOptions, type TabFacts } from './sleep.js';
import { tree, type FolderItem, type Item, type Session, type TabItem, type TabLive } from '../shared/types.js';

const MAX_CLOSED = 25;
const newId = () => randomUUID().slice(0, 8);

export function emptySession(): Session {
  const spaces = [{ id: 'perso', name: 'PERSO' }, { id: 'ecole', name: 'ÉCOLE' }, { id: 'jeux', name: 'JEUX' }];
  return { spaces, activeSpace: 'perso', items: [], active: Object.fromEntries(spaces.map(s => [s.id, null])) };
}

/** Nettoie session.json lu sur le disque : tout ce qui est incohérent est retiré. */
export function sanitizeSession(raw: unknown): Session {
  const base = emptySession();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Session>;
  const str = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length <= max;
  const spaces = Array.isArray(r.spaces) ? r.spaces.filter(s => s && str(s.id, 40) && str(s.name, 40)) : [];
  if (!spaces.length) return base;
  const spaceIds = new Set(spaces.map(s => s.id));
  const items: Item[] = (Array.isArray(r.items) ? r.items : []).filter((i): i is Item =>
    !!i && str(i.id, 40) && spaceIds.has(i.spaceId) && (i.parent === null || str(i.parent, 40)) &&
    (i.kind === 'tab' ? str(i.url) && /^(https?:|$)/.test(i.url) && str(i.title, 1024) && typeof i.pinned === 'boolean' && !i.private
      : i.kind === 'folder' && str(i.name, 80) && typeof i.open === 'boolean'));
  const folders = new Set(items.filter(i => i.kind === 'folder').map(i => i.id));
  for (const i of items) if (i.parent !== null && !folders.has(i.parent)) i.parent = null;
  for (const i of items) if (i.kind === 'tab' && i.label !== undefined && !(typeof i.label === 'string' && i.label.length <= 80)) delete i.label;
  const active: Session['active'] = {};
  for (const s of spaces) {
    const a = r.active?.[s.id];
    active[s.id] = items.some(i => i.id === a && i.kind === 'tab' && i.spaceId === s.id) ? a! : null;
  }
  return { spaces, activeSpace: spaceIds.has(r.activeSpace!) ? r.activeSpace! : spaces[0].id, items, active };
}

interface Live extends TabLive { view?: WebContentsView }

export interface Hooks {
  changed(): void;
  input(wc: WebContents, input: Input, preventDefault: () => void): void;
  visited(tabId: string, url: string, title: string): void;
  /** Titre reçu après la navigation (pour l'historique). */
  titled(url: string, title: string): void;
  ready(wc: WebContents): void;
  /** Mode d'affichage d'une adresse : texte (terminal) ou web (vraie page). */
  mode(url: string): 'text' | 'web';
  /** Partition (cookies, stockage) d'un Space : la sienne, ou une commune à tous (set spaces true). */
  partition(spaceId: string): string;
  /** Réglages lus à chaque fois : set unload-spaces, set newtab. */
  unloadSpaces(): boolean;
  /** Minutes hors du Space actif avant la veille (0 = tout de suite). */
  unloadDelay(): number;
  /** Sites jamais mis en veille (set sleep-never). */
  sleepNever(): string[];
  newTabEnd(): boolean;
  /** set dedupe-on-open : une adresse déjà ouverte dans le Space n'ouvre pas de second onglet. */
  dedupeOnOpen(): boolean;
  /** set autoplay-mute : son coupé pour les onglets en arrière-plan. */
  autoplayMute(): boolean;
  /** Zoom par défaut des pages (set zoom), en %. */
  zoom(): number;
  /** Son d'interface (mod de sons) : nom d'événement seulement. */
  sound(ev: SoundEvent): void;
  /** Dernière page privée fermée : ses données en mémoire sont effacées. */
  privateClosed(): void;
}

/** Partition en mémoire (sans « persist: ») : rien n'est écrit sur le disque. */
export const PRIVATE_PARTITION = 'phos-private';

export class Browser {
  live = new Map<string, Live>();
  /** Dernière fois où chaque onglet a été affiché (mise en veille automatique). */
  private seenAt = new Map<string, number>();
  closed: TabItem[] = [];
  private shown: WebContentsView | null = null;
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private mediaBounds: Rectangle = { x: 0, y: 0, width: 640, height: 360 };
  private panel = false;
  private fullscreen: string | null = null;
  private overlay = false;
  /** Vrai quand l'interface affiche une page interne (aide, réglages) à la place du site. */
  internal = false;

  /** Mise en veille : heure et mémoire privée du processus juste avant (estimation de ce que la veille a libéré, pour perf). */
  slept = new Map<string, { at: number; mb: number }>();
  private fresh: string | null = null;
  /** Onglets dont le son a été coupé par autoplay-mute. */
  autoMuted = new Set<string>();
  /** Veille différée des onglets des Spaces inactifs (set unload-delay). */
  private unloadTimers: TabTimers;

  constructor(readonly win: BaseWindow, readonly ui: WebContentsView, readonly s: Session, private hooks: Hooks, private clock: Clock = realClock) {
    this.unloadTimers = new TabTimers(clock, id => this.unloadNow(id));
  }

  // ── lecture ──
  tab(id: string | null | undefined): TabItem | undefined {
    const i = this.s.items.find(x => x.id === id);
    return i?.kind === 'tab' ? i : undefined;
  }
  folder(id: string | null | undefined): FolderItem | undefined {
    const i = this.s.items.find(x => x.id === id);
    return i?.kind === 'folder' ? i : undefined;
  }
  active(): TabItem | undefined { return this.tab(this.s.active[this.s.activeSpace]); }
  tabsInOrder(spaceId = this.s.activeSpace): TabItem[] {
    return tree(this.s.items, spaceId).map(r => r.item).filter((i): i is TabItem => i.kind === 'tab');
  }
  liveState(): Record<string, TabLive> {
    const out: Record<string, TabLive> = {};
    for (const i of this.s.items) {
      if (i.kind !== 'tab') continue;
      const l = this.live.get(i.id);
      const wc = l?.view?.webContents;
      out[i.id] = { asleep: !l?.view, loading: !!l?.loading, error: l?.error ?? null, audible: !!wc?.isCurrentlyAudible(), muted: !!wc?.isAudioMuted() };
    }
    return out;
  }
  webContentsOf(id: string): WebContents | undefined { return this.live.get(id)?.view?.webContents; }
  allWebContents(): WebContents[] { return [...this.live.values()].flatMap(l => l.view ? [l.view.webContents] : []); }
  tabIdOf(wc: WebContents): string | undefined {
    for (const [id, l] of this.live) if (l.view?.webContents === wc) return id;
  }

  // ── onglets ──
  newTab(url = '', opts: { background?: boolean; spaceId?: string; parent?: string | null; private?: boolean; next?: boolean; lazy?: boolean } = {}): TabItem {
    const cur = this.active();
    // À la fin de la liste (set newtab end), ou juste après l'onglet courant (set newtab next, « nouvelle page à droite »).
    // dedupe-on-open : même adresse déjà ouverte dans ce Space (même mode privé ou non) → on y va au lieu d'ouvrir un doublon.
    const twin = url && this.hooks.dedupeOnOpen() ? this.s.items.find((i): i is TabItem => i.kind === 'tab' && i.url === url
      && i.spaceId === (opts.spaceId ?? this.s.activeSpace) && !!i.private === !!opts.private) : undefined;
    if (twin) { if (!opts.background) this.activate(twin.id); return twin; }
    const next = (opts.next || !this.hooks.newTabEnd()) && cur && (opts.spaceId ?? this.s.activeSpace) === cur.spaceId;
    const tab: TabItem = {
      kind: 'tab', id: newId(), spaceId: opts.spaceId ?? this.s.activeSpace, url, title: url ? new URL(url).host : 'nouvelle-page',
      pinned: false, parent: opts.parent ?? (next && !cur.pinned ? cur.parent : null),
      ...(opts.private ? { private: true } : {}),
    };
    const at = next ? this.s.items.indexOf(cur) + 1 : this.s.items.length;
    this.s.items.splice(at, 0, tab);
    this.hooks.sound('tab-new');
    this.fresh = tab.id; // son « tab-new » déjà joué : pas de « tab-switch » en plus
    // lazy : onglet ajouté endormi (session load), la page ne se charge qu'à l'ouverture.
    if (opts.background) { if (url && !opts.lazy) this.view(tab); this.changed(); }
    else this.activate(tab.id);
    return tab;
  }

  navigate(url: string, newTab = false): void {
    const cur = this.active();
    if (newTab || !cur) { this.newTab(url); return; }
    this.internal = false;
    cur.url = url;
    const l = this.live.get(cur.id);
    if (l) l.error = null;
    if (l?.view) l.view.webContents.loadURL(url).catch(() => {}); else this.view(cur);
    this.show();
  }

  activate(id: string): void {
    const tab = this.tab(id);
    if (!tab) return;
    const from = this.s.activeSpace;
    const was = this.s.active[from];
    this.s.activeSpace = tab.spaceId;
    this.s.active[tab.spaceId] = id;
    this.internal = false;
    if (from !== tab.spaceId) { this.unloadOtherSpaces(); this.hooks.sound('space-switch'); }
    else if (was !== id && this.fresh !== id) this.hooks.sound('tab-switch');
    this.fresh = null;
    this.show();
  }

  /**
   * Changement de Space : les pages des autres Spaces sont mises en veille, tout de suite ou après unload-delay minutes.
   * Revenir dans un Space annule les minuteurs de ses pages.
   */
  private unloadOtherSpaces(): void {
    for (const [id, l] of this.live) {
      const t = this.tab(id);
      if (!t || !l.view) continue;
      if (t.spaceId === this.s.activeSpace) this.unloadTimers.cancel(id);
      else this.scheduleUnload(id);
    }
  }

  /** Veille d'une page d'un Space inactif : jamais si elle joue du son ou si son site est dans sleep-never. */
  private unloadable(id: string): boolean {
    const l = this.live.get(id), t = this.tab(id);
    return !!l?.view && !!t && this.hooks.unloadSpaces() && t.spaceId !== this.s.activeSpace
      && !l.view.webContents.isCurrentlyAudible() && !neverSleeps(t.url, this.hooks.sleepNever());
  }
  private scheduleUnload(id: string): void {
    if (!this.unloadable(id)) return this.unloadTimers.cancel(id);
    const min = this.hooks.unloadDelay();
    if (min > 0) this.unloadTimers.start(id, min * 60_000); else this.sleep(id);
  }
  /** Minuteur échu : les conditions sont revérifiées (le Space a pu redevenir actif, le son a pu reprendre). */
  private unloadNow(id: string): void { if (this.unloadable(id)) this.sleep(id); }
  /** Pour les tests et perf : minuteur de veille en cours sur cet onglet. */
  unloadPending(id: string): boolean { return this.unloadTimers.has(id); }

  close(id: string, quiet = false): void {
    const tab = this.tab(id);
    if (!tab) return;
    if (!quiet) this.hooks.sound('tab-close'); // fermetures automatiques (close-idle) : silencieuses
    if (this.s.active[tab.spaceId] === id) {
      const order = this.tabsInOrder(tab.spaceId);
      const k = order.indexOf(tab);
      this.s.active[tab.spaceId] = (order[k + 1] ?? order[k - 1])?.id ?? null;
    }
    this.sleep(id);
    this.live.delete(id);
    this.slept.delete(id);
    this.zooms.delete(id);
    this.s.items.splice(this.s.items.indexOf(tab), 1);
    // Une page privée ne laisse aucune trace : ni dans « fermés », ni dans undo.
    if (tab.private) { if (!this.s.items.some(i => i.kind === 'tab' && i.private)) this.hooks.privateClosed(); }
    else {
      this.closed.push({ ...tab });
      if (this.closed.length > MAX_CLOSED) this.closed.shift();
    }
    this.show();
  }

  /** Rouvre la dernière page fermée, ou celle dont l'id est donné (liste « fermés »). */
  restoreClosed(id?: string): void {
    const k = id ? this.closed.findIndex(t => t.id === id) : this.closed.length - 1;
    if (k < 0) return;
    const [tab] = this.closed.splice(k, 1);
    if (!this.s.spaces.some(s => s.id === tab.spaceId)) tab.spaceId = this.s.activeSpace;
    if (!this.folder(tab.parent)) tab.parent = null;
    this.s.items.push(tab);
    this.activate(tab.id);
  }

  pin(id: string, pinned: boolean): void {
    const tab = this.tab(id);
    if (!tab) return;
    tab.pinned = pinned;
    if (pinned) tab.parent = null;
    this.changed();
  }

  cycle(step: 1 | -1): void {
    const order = this.tabsInOrder();
    if (!order.length) return;
    const k = order.findIndex(t => t.id === this.s.active[this.s.activeSpace]);
    this.activate(order[(k + step + order.length) % order.length].id);
  }

  /** Met un onglet en veille : la vue est détruite, l'onglet reste dans la liste. */
  sleep(id: string): void {
    this.unloadTimers.cancel(id); // onglet endormi, fermé, déplacé ou Space supprimé : plus de minuteur
    const l = this.live.get(id);
    if (!l?.view) return;
    const tab = this.tab(id);
    const pid = l.view.webContents.getOSProcessId();
    const m = app.getAppMetrics().find(x => x.pid === pid);
    // Estimation : un processus peut servir plusieurs onglets du même site.
    this.slept.set(id, { at: this.clock.now(), mb: m ? Math.round((m.memory.privateBytes ?? m.memory.workingSetSize) / 1024) : 0 });
    const url = l.view.webContents.getURL();
    if (tab && /^https?:/.test(url)) tab.url = url;
    if (this.shown === l.view) { this.win.contentView.removeChildView(l.view); this.shown = null; }
    l.view.webContents.close();
    l.view = undefined;
    l.loading = false;
    this.changed();
  }

  /** Déplace un onglet dans un autre Space : sa vue est recréée dans la partition (cookies) de ce Space. */
  moveToSpace(id: string, spaceId: string): void {
    const tab = this.tab(id);
    if (!tab || tab.spaceId === spaceId || !this.s.spaces.some(s => s.id === spaceId)) return;
    if (this.s.active[tab.spaceId] === id) {
      const order = this.tabsInOrder(tab.spaceId);
      const k = order.indexOf(tab);
      this.s.active[tab.spaceId] = (order[k + 1] ?? order[k - 1])?.id ?? null;
    }
    this.sleep(id);
    tab.spaceId = spaceId;
    tab.parent = null;
    this.s.items.splice(this.s.items.indexOf(tab), 1);
    this.s.items.push(tab);
    if (!this.s.active[spaceId]) this.s.active[spaceId] = id;
    this.show();
  }

  /** Toutes les pages d'un Space vers un autre (dossiers compris, rangés à la racine). */
  moveAll(from: string, to: string): number {
    const tabs = this.s.items.filter((i): i is TabItem => i.kind === 'tab' && i.spaceId === from);
    for (const t of tabs) this.moveToSpace(t.id, to);
    for (const f of this.s.items.filter(i => i.kind === 'folder' && i.spaceId === from)) this.deleteFolder(f.id);
    return tabs.length;
  }

  /** Trie les pages de la racine (non épinglées) d'un Space, à leurs places actuelles dans la liste. */
  sort(spaceId: string, by: 'title' | 'site'): void {
    const tabs = this.s.items.filter((i): i is TabItem => i.kind === 'tab' && i.spaceId === spaceId && i.parent === null && !i.pinned);
    const key = (t: TabItem) => by === 'title' ? t.title.toLowerCase() : (/^https?:\/\/(?:www\.)?([^/]+)/.exec(t.url)?.[1] ?? '~') + ' ' + t.url;
    const at = tabs.map(t => this.s.items.indexOf(t));
    [...tabs].sort((a, b) => key(a).localeCompare(key(b))).forEach((t, k) => { this.s.items[at[k]] = t; });
    this.changed();
  }

  /** Ferme les pages en double (même adresse) d'un Space ; garde la page active ou la première. */
  dedup(spaceId: string): number {
    const keep = new Map<string, TabItem>();
    const cur = this.s.active[spaceId];
    for (const t of this.tabsInOrder(spaceId)) if (t.url && (!keep.has(t.url) || t.id === cur)) keep.set(t.url, t);
    const dup = this.tabsInOrder(spaceId).filter(t => t.url && keep.get(t.url) !== t && !t.pinned);
    for (const t of dup) this.close(t.id);
    return dup.length;
  }

  /** Ferme les onglets non épinglés situés après celui-ci. */
  closeRight(id: string): void {
    const tab = this.tab(id);
    if (!tab) return;
    const order = this.tabsInOrder(tab.spaceId);
    for (const t of order.slice(order.indexOf(tab) + 1)) if (!t.pinned) this.close(t.id);
  }

  /**
   * Passage périodique (toutes les minutes) : idle-sleep / eco-sleep endorment, close-idle ferme (vers « fermés »).
   * Les règles sont dans sweep() (sleep.ts, testée) ; ici on lui donne l'état réel des onglets.
   */
  sweepNow(o: Omit<SweepOptions, 'now' | 'activeSpace' | 'current'>): { slept: number; closed: number } {
    const now = this.clock.now();
    const facts: TabFacts[] = this.s.items.flatMap(i => {
      if (i.kind !== 'tab') return [];
      // Onglet jamais affiché depuis le démarrage : compté à partir de maintenant (sinon close-idle fermerait tout d'un coup).
      if (!this.seenAt.has(i.id)) this.seenAt.set(i.id, now);
      const wc = this.live.get(i.id)?.view?.webContents;
      return [{ id: i.id, spaceId: i.spaceId, url: i.url, pinned: i.pinned, live: !!wc, audible: !!wc?.isCurrentlyAudible(), seenAt: this.seenAt.get(i.id)! }];
    });
    const r = sweep(facts, { ...o, now, activeSpace: this.s.activeSpace, current: this.s.active[this.s.activeSpace] });
    for (const id of r.sleep) this.sleep(id);
    for (const id of r.close) this.close(id, true);
    return { slept: r.sleep.length, closed: r.close.length };
  }

  /** Réveille toutes les pages d'un Space (vues recréées en coulisse). */
  /** Réveille une page (sa vue est recréée en coulisse). */
  wake(id: string): void { const t = this.tab(id); if (t?.url) { this.view(t); this.changed(); } }

  /** Déplace la page à la place « to » (1 = en haut) de son Space, dans l'ordre de ls. */
  moveTo(id: string, to: number): void {
    const t = this.tab(id);
    if (!t) return;
    const order = this.tabsInOrder(t.spaceId).filter(x => x.id !== id);
    const k = Math.min(Math.max(to - 1, 0), order.length);
    if (!order.length) return;
    if (k >= order.length) this.move(id, order[order.length - 1].id, 'after'); else this.move(id, order[k].id, 'before');
  }

  /** Zoom de la page (gardé quand la fenêtre change de taille). */
  zooms = new Map<string, number>();
  setZoom(id: string, factor: number): void {
    this.zooms.set(id, factor);
    if (this.active()?.id === id) this.layout();
  }
  private zoomOf(id: string | undefined): number { return (id && this.zooms.get(id)) || this.hooks.zoom() / 100; }

  wakeAll(spaceId = this.s.activeSpace): void {
    for (const t of this.tabsInOrder(spaceId)) if (t.url) this.view(t);
    this.changed();
  }

  /** Endort la page affichée : on passe d'abord à la suivante du Space (une page affichée se réveillerait aussitôt). */
  sleepCurrent(): boolean {
    const cur = this.active();
    if (!cur || this.tabsInOrder().length < 2) return false;
    this.cycle(1);
    this.sleep(cur.id);
    return true;
  }

  sleepOthers(): void {
    for (const id of [...this.live.keys()]) if (id !== this.s.active[this.s.activeSpace]) this.sleep(id);
  }

  // ── dossiers ──
  newFolder(name: string): FolderItem {
    const f: FolderItem = { kind: 'folder', id: newId(), spaceId: this.s.activeSpace, parent: null, name, open: true };
    this.s.items.push(f);
    this.changed();
    return f;
  }

  /** Supprime un dossier : son contenu remonte d'un niveau (aucun onglet n'est fermé). */
  deleteFolder(id: string): void {
    const f = this.folder(id);
    if (!f) return;
    for (const i of this.s.items) if (i.parent === id) i.parent = f.parent;
    this.s.items.splice(this.s.items.indexOf(f), 1);
    this.changed();
  }

  toggleFolder(id: string): void {
    const f = this.folder(id);
    if (f) { f.open = !f.open; this.changed(); }
  }

  /** Glisser-déposer : place `id` avant/après `target`, ou dedans si `target` est un dossier. */
  move(id: string, targetId: string | null, where: 'before' | 'after' | 'inside'): void {
    const item = this.s.items.find(i => i.id === id);
    const target = targetId === null ? null : this.s.items.find(i => i.id === targetId);
    if (!item || target === undefined || item === target) return;
    if (target && target.spaceId !== item.spaceId) return;
    const parent = target === null ? null : where === 'inside' ? (target.kind === 'folder' ? target.id : undefined) : target.parent;
    if (parent === undefined) return;
    // Un dossier ne peut pas entrer dans lui-même ni dans un de ses sous-dossiers.
    for (let p: string | null = parent; p; p = this.folder(p)?.parent ?? null) if (p === item.id) return;
    this.s.items.splice(this.s.items.indexOf(item), 1);
    item.parent = parent;
    if (item.kind === 'tab' && parent !== null) item.pinned = false;
    const at = target === null || where === 'inside' ? this.s.items.length : this.s.items.indexOf(target) + (where === 'after' ? 1 : 0);
    this.s.items.splice(at, 0, item);
    if (target?.kind === 'folder' && where === 'inside') target.open = true;
    this.changed();
  }

  // ── Spaces ──
  switchSpace(id: string): void {
    if (!this.s.spaces.some(s => s.id === id)) return;
    const from = this.s.activeSpace;
    this.s.activeSpace = id;
    this.internal = false;
    if (from !== id) { this.unloadOtherSpaces(); this.hooks.sound('space-switch'); }
    this.show();
  }

  /** Change la place d'un Space dans la liste (0 = en haut) : barre latérale, Ctrl+1-9 et couleurs suivent l'ordre. */
  moveSpace(id: string, index: number): void {
    const sp = this.s.spaces.find(s => s.id === id);
    if (!sp) return;
    this.s.spaces.splice(this.s.spaces.indexOf(sp), 1);
    this.s.spaces.splice(Math.min(Math.max(index, 0), this.s.spaces.length), 0, sp);
    this.changed();
  }

  newSpace(name: string): void {
    const id = newId();
    this.s.spaces.push({ id, name });
    this.s.active[id] = null;
    this.switchSpace(id);
  }

  /** Supprime un Space et ferme ses onglets. Renvoie l'id de partition à effacer, ou null si refusé. */
  deleteSpace(id: string): string | null {
    if (this.s.spaces.length <= 1 || !this.s.spaces.some(s => s.id === id)) return null;
    for (const t of this.s.items.filter(i => i.spaceId === id)) if (t.kind === 'tab') { this.sleep(t.id); this.live.delete(t.id); }
    this.s.items = this.s.items.filter(i => i.spaceId !== id);
    this.closed = this.closed.filter(t => t.spaceId !== id);
    this.s.spaces = this.s.spaces.filter(s => s.id !== id);
    delete this.s.active[id];
    if (this.s.activeSpace === id) this.s.activeSpace = this.s.spaces[0].id;
    this.show();
    return 'persist:space-' + id;
  }

  // ── affichage ──
  setBounds(page: Rectangle, media: Rectangle): void { this.bounds = page; this.mediaBounds = media; this.layout(); this.stack(); }
  setOverlay(on: boolean): void { this.overlay = on; this.stack(); }
  /** Panneau « sortie » (vidéo, image) ouvert : la page réelle y est visible. */
  setPanel(on: boolean): void { this.panel = on; this.stack(); }
  /** Sortie forcée du plein écran d'une page (Échap, F11) : même si la page n'a pas signalé sa sortie, l'interface revient. */
  exitFullscreen(): boolean {
    if (!this.fullscreen) return false;
    const wc = this.shown?.webContents;
    if (wc && !wc.isDestroyed()) void wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {});
    this.fullscreen = null;
    this.win.setFullScreen(false);
    this.layout();
    this.stack();
    return true;
  }

  textMode(): boolean { const t = this.active(); return !!t && this.hooks.mode(t.url) === 'text'; }

  private layout(): void {
    if (!this.shown) return;
    const wc = this.shown.webContents;
    if (this.fullscreen) {
      const { width, height } = this.win.getContentBounds();
      this.shown.setBounds({ x: 0, y: 0, width, height });
      wc.setZoomFactor(1);
    } else if (this.textMode()) {
      // En coulisse, la page garde une largeur d'ordinateur ; le panneau en montre une version réduite.
      this.shown.setBounds(this.mediaBounds);
      wc.setZoomFactor(Math.min(1, Math.max(0.25, this.mediaBounds.width / VIRTUAL_WIDTH)));
    } else {
      this.shown.setBounds(this.bounds);
      wc.setZoomFactor(this.zoomOf(this.active()?.id));
    }
  }

  /** Ordre des couches : l'interface passe au-dessus du site quand elle affiche des suggestions. */
  private stack(): void {
    const top = this.fullscreen ? this.shown : this.overlay || (this.textMode() && !this.panel) ? this.ui : this.shown;
    if (top) this.win.contentView.addChildView(top);
  }

  /** Affiche la vue de l'onglet actif (créée à la demande : c'est le lazy loading). */
  show(): void {
    const tab = this.active();
    const l = tab && this.live.get(tab.id);
    const want = tab && tab.url && !this.internal && !l?.error ? this.view(tab) : null;
    if (this.shown !== want) {
      if (this.shown) this.win.contentView.removeChildView(this.shown);
      this.shown = want;
      if (want) this.win.contentView.addChildView(want);
    }
    if (tab) this.seenAt.set(tab.id, this.clock.now());
    if (tab && want && this.autoMuted.delete(tab.id)) want.webContents.setAudioMuted(false);
    this.layout();
    this.stack();
    this.changed();
  }

  focusPage(): void {
    if (this.shown) this.shown.webContents.focus();
  }

  private changed(): void { this.hooks.changed(); }

  private view(tab: TabItem): WebContentsView {
    let l = this.live.get(tab.id);
    if (l?.view) return l.view;
    if (!l) { l = { asleep: false, loading: false, error: null }; this.live.set(tab.id, l); }
    this.slept.delete(tab.id); // réveillé
    const view = new WebContentsView({
      webPreferences: {
        partition: tab.private ? PRIVATE_PARTITION : this.hooks.partition(tab.spaceId),
        sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
        allowRunningInsecureContent: false, experimentalFeatures: false, navigateOnDragDrop: false,
      },
    });
    view.setBackgroundColor('#0c0c0c');
    l.view = view;
    const live = l;
    const wc = view.webContents;
    wc.on('page-title-updated', (_e, title) => { tab.title = title.slice(0, 1024); if (!tab.private) this.hooks.titled(wc.getURL(), tab.title); this.changed(); });
    wc.on('audio-state-changed', () => {
      // Son : la veille différée est annulée ; silence revenu dans un Space inactif : elle repart (unload-delay > 0).
      if (wc.isCurrentlyAudible()) {
        this.unloadTimers.cancel(tab.id);
        // autoplay-mute : une page en arrière-plan qui se met à jouer est coupée (rétablie quand on l'affiche).
        if (this.hooks.autoplayMute() && this.shown !== view && !wc.isAudioMuted()) { wc.setAudioMuted(true); this.autoMuted.add(tab.id); }
      }
      else if (this.hooks.unloadDelay() > 0 && tab.spaceId !== this.s.activeSpace) this.scheduleUnload(tab.id);
      this.changed();
    });
    const nav = (_e: unknown, url: string) => { if (/^https?:/.test(url)) tab.url = url; this.changed(); };
    wc.on('did-navigate', (e, url) => { live.error = null; nav(e, url); this.hooks.visited(tab.id, url, tab.title); if (this.shown === view) { this.layout(); this.stack(); } });
    wc.on('did-navigate-in-page', (e, url, isMain) => { if (isMain) nav(e, url); });
    wc.on('did-start-loading', () => { live.loading = true; this.changed(); });
    wc.on('did-stop-loading', () => { live.loading = false; this.changed(); });
    wc.on('did-finish-load', () => { if (this.shown === view) this.hooks.sound('page-load'); }); // seulement la page affichée
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return; // -3 = chargement annulé, pas une erreur
      live.error = `${desc} (${code})`;
      if (/^https?:/.test(url)) tab.url = url;
      this.show();
    });
    wc.on('dom-ready', () => this.hooks.ready(wc));
    wc.on('before-input-event', (e, input) => this.hooks.input(wc, input, () => e.preventDefault()));
    wc.on('enter-html-full-screen', () => { this.fullscreen = tab.id; this.win.setFullScreen(true); this.layout(); this.stack(); });
    wc.on('leave-html-full-screen', () => { this.fullscreen = null; this.win.setFullScreen(false); this.layout(); this.stack(); });
    wc.on('render-process-gone', (_e, d) => {
      if (d.reason === 'clean-exit') return;
      live.error = 'PAGE PLANTÉE (' + d.reason + ')';
      this.sleep(tab.id);
      this.show();
    });
    if (tab.url) wc.loadURL(tab.url).catch(() => {}); // les échecs passent par did-fail-load
    return view;
  }
}
