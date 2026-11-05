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
    openTab: (url: string, active: boolean) => ipcRenderer.invoke('ext-open-tab', String(url).slice(0, 4096), !!active) as Promise<object | null>,
    // Événements d'onglets fabriqués par Phosphore (service worker seulement).
    onTabEvent: (cb: (type: string, args: unknown[]) => void) => { ipcRenderer.on('ext-tab-event', (_e, type: string, args: unknown[]) => cb(type, args)); },
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
      const b = (globalThis as { __phosExt?: { openTab(url: string, active: boolean): Promise<unknown> } }).__phosExt;
      if (b) void b.openTab(url, true).catch(() => {});
      else if (g.open) g.open(url, '_blank');
    };
    const bridge = (globalThis as { __phosExt?: { activeTab(): Promise<number | null>; close(): void; openTab(url: string, active: boolean): Promise<object | null>; onTabEvent(cb: (type: string, args: unknown[]) => void): void } }).__phosExt;
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
    // tabs.create : absent d'Electron. Ouvre un onglet Phosphore (site, ou page de cette extension).
    if (tabs && bridge) def(tabs, 'create', (o?: { url?: string; active?: boolean }, cb?: Cb) => {
      const p = o?.url ? bridge.openTab(o.url, o.active !== false).catch(() => null) : Promise.resolve(null);
      if (typeof cb === 'function') void p.then(cb);
      return p;
    });
    // tabs.query({ active: true }) : Electron ne sait pas quel onglet est affiché (réponse vide). Phosphore donne le dernier
    // site affiché, celui que le popup de Chrome verrait derrière lui (Bitwarden : identifiants proposés pour ce site).
    const query = tabs?.query as ((q: object) => Promise<{ id?: number }[]>) | undefined;
    let shown: number | null = null; // dernier onglet affiché poussé par Phosphore (événement « activated »), si la demande échoue
    if (query && bridge) try {
      const real = query.bind(tabs);
      const wants = (q: Record<string, unknown>) => !!(q.active || q.currentWindow || q.lastFocusedWindow || q.highlighted);
      Object.defineProperty(tabs, 'query', { configurable: true, value: (q: Record<string, unknown> = {}, cb?: Cb) => {
        const p = (async () => {
          if (!wants(q)) return real(q);
          // Sans réponse en 300 ms (worker pas encore branché), l'onglet poussé par Phosphore sert : une demande sans réponse bloquerait l'extension.
          const asked = await Promise.race([bridge.activeTab().catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 300))]);
          const id = asked ?? shown;
          if (id == null) return real(q);
          const { active: _a, currentWindow: _c, lastFocusedWindow: _l, highlighted: _h, windowId: _w, ...rest } = q;
          return (await real(rest)).filter(t => t.id === id).map(t => ({ ...t, active: true, highlighted: true, windowId: 1 }));
        })();
        if (typeof cb === 'function') void p.then(cb, () => cb([]));
        return p;
      } });
    } catch { /* API figée */ }
    // tabs.onActivated / onUpdated / onRemoved : Electron ne les déclenche jamais ; Phosphore les envoie au service worker.
    if (!isPage && tabs && bridge) {
      const evs: Record<string, Set<(...a: unknown[]) => void>> = {};
      for (const [type, name] of [['activated', 'onActivated'], ['updated', 'onUpdated'], ['removed', 'onRemoved']]) {
        const ls = evs[type] = new Set();
        try {
          Object.defineProperty(tabs, name, { configurable: true, value: {
            addListener: (f: (...a: unknown[]) => void) => { ls.add(f); }, removeListener: (f: (...a: unknown[]) => void) => { ls.delete(f); },
            hasListener: (f: (...a: unknown[]) => void) => ls.has(f), hasListeners: () => ls.size > 0,
          } });
        } catch { /* API figée */ }
      }
      bridge.onTabEvent((type, args) => {
        if (type === 'activated') shown = (args[0] as { tabId?: number } | undefined)?.tabId ?? shown;
        evs[type]?.forEach(f => { try { f(...args); } catch (e) { console.error(e); } });
      });
    }
    const runtime = c.runtime as Record<string, unknown>;
    // runtime.onInstalled : Electron ne l'envoie jamais. Envoyé une fois (« install »), au premier démarrage du service worker
    // dans Phosphore, mémorisé dans le stockage de l'extension. Bitwarden y active son menu dans les champs.
    const storage = (c.storage as { local?: { get(k: string): Promise<Record<string, unknown>>; set(v: object): Promise<void> } } | undefined)?.local;
    if (!isPage && bridge && storage) {
      const ls = new Set<(d: object) => void>();
      try {
        Object.defineProperty(runtime, 'onInstalled', { configurable: true, value: {
          addListener: (f: (d: object) => void) => { ls.add(f); }, removeListener: (f: (d: object) => void) => { ls.delete(f); },
          hasListener: (f: (d: object) => void) => ls.has(f), hasListeners: () => ls.size > 0,
        } });
        const KEY = '__phosphore_installed';
        void storage.get(KEY).then(async v => {
          if (v?.[KEY]) return;
          await storage.set({ [KEY]: true });
          for (let i = 0; i < 100 && !ls.size; i++) await new Promise(r => setTimeout(r, 100)); // écouteurs posés par le script de l'extension
          ls.forEach(f => { try { f({ reason: 'install' }); } catch (e) { console.error(e); } });
        }).catch(() => {});
      } catch { /* API figée */ }
    }
    def(runtime, 'getPlatformInfo', fn(() => ({ os: 'win', arch: 'x86-64', nacl_arch: 'x86-64' })));
    // « Gestionnaire de mots de passe par défaut » (Bitwarden) : Chrome demande la permission privacy puis coupe son propre
    // gestionnaire. Phosphore n'en a pas : la permission est accordée et le réglage dit toujours « géré par cette extension ».
    const own = (q?: unknown) => { const p = q as { permissions?: string[]; origins?: string[] } | undefined; return !p?.origins?.length && (p?.permissions ?? []).every(x => x === 'privacy'); };
    const perms = c.permissions as Record<string, unknown> | undefined;
    const wrap = (k: 'contains' | 'request') => {
      const real = typeof perms?.[k] === 'function' ? (perms[k] as (q: unknown) => Promise<boolean>).bind(perms) : null;
      return (q?: unknown, cb?: Cb) => {
        const p = own(q) ? Promise.resolve(true) : real ? real(q).catch(() => false) : Promise.resolve(false);
        if (typeof cb === 'function') void p.then(cb);
        return p;
      };
    };
    if (perms) for (const k of ['contains', 'request'] as const) try { Object.defineProperty(perms, k, { configurable: true, value: wrap(k) }); } catch { /* API figée */ }
    else def(c, 'permissions', ns({ contains: wrap('contains'), request: wrap('request') }));
    const setting = () => ({ get: fn(() => ({ value: false, levelOfControl: 'controlled_by_this_extension' })), set: fn(() => undefined), clear: fn(() => undefined), onChange: event() });
    def(c, 'privacy', ns({ services: ns({ passwordSavingEnabled: setting(), autofillAddressEnabled: setting(), autofillCreditCardEnabled: setting(), autofillEnabled: setting() }) }));
    for (const n of ['webNavigation', 'contextMenus', 'notifications', 'sidePanel', 'offscreen', 'idle', 'commands']) def(c, n, ns());
  },
});
