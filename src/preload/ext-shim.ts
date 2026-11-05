// Preload des service workers d'extension et des pages d'extension ouvertes par « ext open » (jamais des sites) :
// Electron n'a pas chrome.webNavigation, contextMenus, notifications, windows… Bitwarden lit chrome.webNavigation.onCommitted
// au démarrage, son service worker plante et son popup reste vide. On ajoute ces API absentes en version inerte
// (écouteurs ignorés, appels résolus sans effet), sauf chrome.windows qui ouvre un onglet Phosphore.
import { contextBridge } from 'electron';

contextBridge.executeInMainWorld({
  func: () => {
    const c = (globalThis as { chrome?: Record<string, unknown> & { runtime?: { id?: string } } }).chrome;
    if (!c?.runtime?.id) return; // page ou service worker d'un site : rien à faire
    type Cb = (v?: unknown) => void;
    const g = globalThis as { innerWidth?: number; innerHeight?: number; open?: (url: string, target: string) => unknown };
    const def = (o: Record<string, unknown>, k: string, v: unknown) => { if (!o[k]) try { Object.defineProperty(o, k, { value: v, configurable: true }); } catch { /* API figée */ } };
    // Fonction façon chrome.* : résultat donné au rappel (dernier argument fonction) et à la promesse.
    const fn = (get: (...a: unknown[]) => unknown) => (...a: unknown[]) => { const v = get(...a); (a.find(x => typeof x === 'function') as Cb | undefined)?.(v); return Promise.resolve(v); };
    const event = () => ({ addListener() {}, removeListener() {}, hasListener: () => false, hasListeners: () => false });
    const ns = (real: Record<string, unknown> = {}) => new Proxy(real, {
      get: (t, k) => typeof k === 'symbol' || k === 'then' ? undefined : (t[k] ??= k.startsWith('on') ? event() : fn(() => undefined)),
    });
    // Une seule « fenêtre » : celle de Phosphore. windows.create ouvre l'adresse dans un onglet (Bitwarden : import de fichier, passkeys).
    const win = () => ({ id: 1, focused: true, top: 0, left: 0, width: g.innerWidth || 1280, height: g.innerHeight || 800, type: 'normal', state: 'normal', incognito: false, alwaysOnTop: false, tabs: [] });
    const tabs = c.tabs as Record<string, unknown> | undefined;
    const open = (u: unknown) => {
      const url = String(Array.isArray(u) ? u[0] ?? '' : u ?? '');
      if (!url) return;
      if (g.open) g.open(url, '_blank');
      else void (tabs?.create as ((o: object) => Promise<unknown>) | undefined)?.({ url })?.catch?.(() => {});
    };
    def(c, 'windows', ns({
      WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2,
      get: fn(win), getCurrent: fn(win), getLastFocused: fn(win), getAll: fn(() => [win()]),
      create: fn((o?: unknown) => { open((o as { url?: unknown } | undefined)?.url); return win(); }),
      update: fn(win), remove: fn(() => undefined),
    }));
    // Popup ouvert dans un onglet : Chrome répond « undefined » dans un vrai popup, Bitwarden s'en sert pour savoir où il est.
    if (tabs) def(tabs, 'getCurrent', fn(() => undefined));
    const runtime = c.runtime as Record<string, unknown>;
    def(runtime, 'getPlatformInfo', fn(() => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })));
    for (const n of ['webNavigation', 'contextMenus', 'notifications', 'privacy', 'sidePanel', 'offscreen', 'idle', 'commands', 'permissions']) def(c, n, ns());
  },
});
