// Preload des service workers d'extension (pas des sites) : Electron n'a pas chrome.webNavigation, contextMenus,
// notifications… Bitwarden lit chrome.webNavigation.onCommitted au démarrage, son service worker plante et son popup
// reste vide. On ajoute ces API absentes en version inerte (écouteurs ignorés, appels résolus sans effet).
import { contextBridge } from 'electron';

contextBridge.executeInMainWorld({
  func: () => {
    const c = (globalThis as { chrome?: Record<string, unknown> & { runtime?: { id?: string } } }).chrome;
    if (!c?.runtime?.id) return; // service worker d'un site : rien à faire
    const event = () => ({ addListener() {}, removeListener() {}, hasListener: () => false, hasListeners: () => false });
    const call = (...a: unknown[]) => { (a.find(x => typeof x === 'function') as (() => void) | undefined)?.(); return Promise.resolve(); };
    const ns = () => new Proxy({} as Record<string, unknown>, {
      get: (t, k) => typeof k === 'symbol' || k === 'then' ? undefined : (t[k] ??= k.startsWith('on') ? event() : call),
    });
    // Popup ouvert dans un onglet : Chrome répond « undefined » dans un vrai popup, Bitwarden s'en sert pour savoir où il est.
    const tabs = c.tabs as Record<string, unknown> | undefined;
    if (tabs && !tabs.getCurrent) try { Object.defineProperty(tabs, 'getCurrent', { value: (cb?: (t?: unknown) => void) => { cb?.(); return Promise.resolve(undefined); }, configurable: true }); } catch { /* API figée */ }
    for (const n of ['webNavigation', 'contextMenus', 'notifications', 'privacy', 'sidePanel', 'offscreen', 'idle', 'windows', 'commands', 'permissions'])
      if (!c[n]) try { Object.defineProperty(c, n, { value: ns(), configurable: true }); } catch { /* API figée : tant pis */ }
  },
});
