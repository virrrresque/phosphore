// Preload des service workers d'extension et des pages d'extension ouvertes par « ext open » (jamais des sites) :
// Electron n'a pas chrome.webNavigation, contextMenus, notifications, windows… Bitwarden lit chrome.webNavigation.onCommitted
// au démarrage, son service worker plante et son popup reste vide. On ajoute ces API absentes en version inerte
// (écouteurs ignorés, appels résolus sans effet), sauf chrome.windows qui ouvre un onglet Phosphore.
import { contextBridge, ipcRenderer } from 'electron';

// Pont vers Phosphore, seulement dans une extension : onglet du site affiché (tabs.query active), fermer l'onglet (window.close).
// L'adresse est lue dans le monde de la page : le monde isolé d'un service worker n'a pas de « location ».
const here = String(contextBridge.executeInMainWorld({ func: () => String((globalThis as { location?: { href?: string } }).location?.href ?? '') }));
if (here.startsWith('chrome-extension://'))
  contextBridge.exposeInMainWorld('__phosExt', {
    activeTab: () => ipcRenderer.invoke('ext-active-tab') as Promise<number | null>,
    close: () => ipcRenderer.send('ext-close'),
  });

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
    const bridge = (globalThis as { __phosExt?: { activeTab(): Promise<number | null>; close(): void } }).__phosExt;
    // Page d'extension dans un onglet : window.close (bouton retour/fermer de Bitwarden) ferme l'onglet, comme un popup.
    const isPage = typeof (globalThis as { document?: unknown }).document === 'object';
    if (isPage && bridge) (globalThis as { close?: () => void }).close = () => bridge.close();
    def(c, 'windows', ns({
      WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2,
      get: fn(win), getCurrent: fn(win), getLastFocused: fn(win), getAll: fn(() => [win()]),
      create: fn((o?: unknown) => { open((o as { url?: unknown } | undefined)?.url); return win(); }),
      update: fn(win), remove: fn(() => { if (isPage) bridge?.close(); }),
    }));
    // Popup ouvert dans un onglet : Chrome répond « undefined » dans un vrai popup, Bitwarden s'en sert pour savoir où il est.
    if (tabs) def(tabs, 'getCurrent', fn(() => undefined));
    // tabs.query({ active: true }) : Electron ne sait pas quel onglet est affiché (réponse vide). Phosphore donne le dernier
    // site affiché, celui que le popup de Chrome verrait derrière lui (Bitwarden : identifiants proposés pour ce site).
    const query = tabs?.query as ((q: object) => Promise<{ id?: number }[]>) | undefined;
    if (query && bridge) try {
      const real = query.bind(tabs);
      const wants = (q: Record<string, unknown>) => !!(q.active || q.currentWindow || q.lastFocusedWindow || q.highlighted);
      Object.defineProperty(tabs, 'query', { configurable: true, value: (q: Record<string, unknown> = {}, cb?: Cb) => {
        const p = (async () => {
          if (!wants(q)) return real(q);
          const id = await bridge.activeTab().catch(() => null);
          if (id == null) return real(q);
          const { active: _a, currentWindow: _c, lastFocusedWindow: _l, highlighted: _h, windowId: _w, ...rest } = q;
          return (await real(rest)).filter(t => t.id === id).map(t => ({ ...t, active: true, highlighted: true, windowId: 1 }));
        })();
        if (typeof cb === 'function') void p.then(cb, () => cb([]));
        return p;
      } });
    } catch { /* API figée */ }
    const runtime = c.runtime as Record<string, unknown>;
    def(runtime, 'getPlatformInfo', fn(() => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })));
    for (const n of ['webNavigation', 'contextMenus', 'notifications', 'privacy', 'sidePanel', 'offscreen', 'idle', 'commands', 'permissions']) def(c, n, ns());
  },
});
