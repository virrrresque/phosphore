// Point d'entrée du processus principal.
import { app, BaseWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeTheme, net, protocol, session, shell, WebContentsView, type Input, type Session, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, searchUrl, type Action } from '../shared/command.js';
import { isLocalHost, suspiciousUrl } from '../shared/safeurl.js';
import { BlockLists } from './blocklists.js';
import { autoUpdater } from 'electron-updater';
import { modeOf, PARTS, restoreMode, TEXTS, WIDGETS, type Line, type Part, type PageSnap, type Settings, type UiState, type Widget } from '../shared/types.js';
import { Browser, emptySession, PRIVATE_PARTITION, sanitizeSession } from './browser.js';
import { chromeUserAgent, hardenSession, hardenWebContents } from './security.js';
import { applySetting, cleanDomain, defaults, PERM_ID_LIST, isAliasName, normKey, sanitize, toCommands } from './settings.js';
import { installFromStore, storeId } from './crx.js';
import { parseDetail, parseSearch } from './webstore.js';
import { importSoundMod, loadSoundPack, openSource, soundModNames } from './soundio.js';
import { modName, sampleMod } from './soundmods.js';
import type { SoundEvent } from '../shared/sounds.js';

/** Son d'interface (mod de sons) ; branché une fois l'interface créée. */
let playSound: (ev: SoundEvent) => void = () => {};
import { load, save } from './store.js';
import { SHORTS_CSS, WORLD } from './webstyle.js';
import { spotCss, TEXT_SCRIPT } from './webtext.js';
import { parseCsv } from './csv.js';
import { chromiumBrowsers, installedBrowsers, readChromiumCookies, readCookieFile, type Read } from './cookies.js';
import { available as vaultAvailable, decrypt, encryptRows, merge, type Entry } from './vault.js';

const UI_DIR = path.join(__dirname, '../../ui');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// Une seule instance : deux instances écraseraient le même fichier de session.
if (!app.requestSingleInstanceLock()) app.exit(0);
// Version installée : refuse le port de débogage (sinon un autre programme pourrait piloter le navigateur).
if (app.isPackaged && ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk'].some(s => app.commandLine.hasSwitch(s))) app.exit(1);

// Retire le drapeau « AutomationControlled » (navigator.webdriver) : Phosphore est un vrai navigateur, pas un robot.
// Certains sites (connexion Google) refusent sinon la connexion.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);
Menu.setApplicationMenu(null);
app.on('session-created', s => {
  // Droits accordés par « perm allow » (lus à chaque demande : un changement s'applique tout de suite).
  hardenSession(s, (host, perm) => Object.entries((settings ?? startSettings).permissions).some(([site, l]) => (host === site || host.endsWith('.' + site)) && l.includes(perm)), () => (settings ?? startSettings).privacy === 'strict');
  applyProxy(s);
  // Protections réseau : anti-pub/traqueurs, anti-hameçonnage (listes locales, par domaine), puis https-only.
  s.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    const stt = settings ?? startSettings;
    const main = d.resourceType === 'mainFrame';
    // Rien à faire pour cette requête (cas courant : sous-ressource sans blocage de pub) : on sort tout de suite.
    if (!stt.blockAds && !(main && (stt.safeBrowsing || stt.httpsOnly))) return cb({});
    let h = ''; try { h = new URL(d.url).hostname.replace(/^www\./, ''); } catch { return cb({}); }
    const allowed = stt.blockAllow.includes(h);
    // Pubs / traqueurs : toute requête vers un domaine listé est coupée.
    if (stt.blockAds && !allowed && blockLists?.has('ads', h)) return cb({ cancel: true });
    // Hameçonnage / malveillant : seulement le document principal ; on avertit et on bloque (retour possible avec blocklist allow).
    if (stt.safeBrowsing && main && !allowed && blockLists?.has('safe', h)) {
      notify(`⚠ ${h} est signalé comme site d'hameçonnage ou malveillant : page bloquée. Pour y aller quand même : blocklist allow ${h}`);
      return cb({ cancel: true });
    }
    // https-only : un document http est réessayé en https (localhost / réseau privé et https-allow exemptés).
    if (stt.httpsOnly && main && d.url.startsWith('http:') && !isLocalHost(h) && !stt.httpsAllow.includes(h))
      return cb({ redirectURL: d.url.replace(/^http:/i, 'https:') });
    cb({});
  });
  // Les extensions choisies par l'utilisateur sont chargées dans chaque Space (partition persist:space-…).
  if (s.storagePath?.includes(`${path.sep}Partitions${path.sep}space-`)) setImmediate(() => loadExtensions(s));
  s.on('will-download', (_e, item) => {
    const st = settings ?? startSettings;
    const dir = st.downloadDir || app.getPath('downloads');
    if (!st.downloadAsk) {
      // Enregistré directement dans le dossier choisi, sans écraser un fichier existant.
      const base = item.getFilename().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200) || 'fichier';
      const ext = path.extname(base), stem = base.slice(0, base.length - ext.length);
      let f = path.join(dir, base);
      for (let k = 1; fs.existsSync(f) && k < 1000; k++) f = path.join(dir, `${stem} (${k})${ext}`);
      item.setSavePath(f);
    } else item.setSaveDialogOptions({ defaultPath: path.join(dir, item.getFilename()) });
    item.once('done', (_d, state) => { if (state === 'completed') playSound('download-done'); });
  });
});
/** Proxy de toutes les pages (set proxy) ; sans proxy : celui de Windows, comme avant. */
function applyProxy(s: Session) {
  // socks5h (DNS par le proxy) = socks5 pour Chromium, qui résout déjà les noms via un proxy SOCKS5.
  const p = (settings ?? startSettings).proxy.replace(/^socks5h:/i, 'socks5:');
  void s.setProxy(p ? { proxyRules: p } : { mode: 'system' }).catch(() => {});
}

const loaded = new WeakMap<Session, Set<string>>();
function loadExtensions(s: Session): Promise<unknown> {
  if (!settings) return Promise.resolve();
  const done = loaded.get(s) ?? new Set<string>();
  loaded.set(s, done);
  const jobs: Promise<unknown>[] = [];
  for (const dir of settings.extensions) {
    if (done.has(dir) || settings.extOff.includes(dir)) continue;
    done.add(dir);
    jobs.push(s.extensions.loadExtension(dir, { allowFileAccess: false }).catch(() => { /* dossier déplacé ou extension invalide : signalé par la page ext */ }));
  }
  return Promise.all(jobs);
}
// Partitions réellement utilisées par les pages : avec « set spaces true », c'est celle de perso pour tous les Spaces,
// même si le Space perso a été supprimé ou renommé.
const spaceSessions = () => [...new Set(browser.s.spaces.map(sp => settings.sharedCookies ? 'persist:space-perso' : 'persist:space-' + sp.id))].map(p => session.fromPartition(p));

// Mods : fichiers CSS dans <données>/mods. Première ligne facultative : /* @match youtube.com, twitch.tv */
// « @match phosphore » : le mod habille l'interface de Phosphore elle-même (barre latérale, onglets, invite…).
const MODS_DIR = () => path.join(app.getPath('userData'), 'mods');
const modFile = (name: string) => path.join(MODS_DIR(), name + '.css');
const modMatch = (css: string) => /^\s*\/\*\s*@match\s+([^*]+)\*\//.exec(css)?.[1].split(',').map(h => h.trim().toLowerCase()).filter(Boolean) ?? null;
function modCss(name: string, host: string, ui = false): string | null {
  try {
    const css = fs.readFileSync(modFile(name), 'utf8').slice(0, 200_000);
    const m = modMatch(css);
    if (ui ? !m?.includes('phosphore') : m && !m.some(h => host === h || host.endsWith('.' + h))) return null;
    return css;
  } catch { return null; }
}
const AUTORUN = () => path.join(app.getPath('userData'), 'autorun.txt');
const EXT_DIR = () => path.join(app.getPath('userData'), 'extensions');
const ICON = path.join(UI_DIR, 'icon.png');
// Mode économie : moins de processus de rendu (Chromium ne l'accepte qu'au démarrage).
const startSettings = sanitize(load('settings'));
if (startSettings.eco) app.commandLine.appendSwitch('renderer-process-limit', '4');
// Confidentialité « strict » : pas de pré-résolution DNS ni de préchargement réseau prédictif (moins de fuites vers des sites non ouverts).
if (startSettings.privacy === 'strict') app.commandLine.appendSwitch('dns-prefetch-disable');
// Langue demandée aux sites (en-tête Accept-Language, navigator.language).
app.commandLine.appendSwitch('lang', startSettings.lang);

let browser: Browser;
let settings: Settings;
let blockLists: BlockLists | undefined;        // listes anti-hameçonnage / anti-pub (assignées au démarrage)
let notify: (text: string) => void = () => {}; // vers l'interface (défini une fois celle-ci prête)

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'; // mode sombre : les sites qui en ont un l'utilisent (Google, YouTube…)
  hardenSession(session.defaultSession);
  const suggestSession = session.fromPartition('phos-suggest'); // en mémoire, sans cookies des Spaces
  // L'interface est servie depuis le dossier de l'appli, jamais depuis le web ni file://.
  protocol.handle('app', async req => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(UI_DIR, decodeURIComponent(u.pathname)));
    if (u.host !== 'ui' || !file.startsWith(UI_DIR + path.sep)) return new Response('', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'content-security-policy': CSP },
    });
  });

  settings = sanitize(load('settings'));
  save('settings', settings); // garde le sceau tiré au sort au premier lancement
  // Listes de blocage (hameçonnage, pubs) : chargées du disque, rafraîchies au démarrage si activées.
  blockLists = new BlockLists(app.getPath('userData'), url => suggestSession.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }));
  blockLists.load('safe');
  blockLists.load('ads');
  // set restore : dernière session (par défaut), une nouvelle page, ou rien. Les pages privées ne sont jamais sauvegardées.
  const sess = load('session') === undefined ? emptySession() : restoreMode(sanitizeSession(load('session')), settings.restore, 'home-' + Date.now().toString(36), settings.home);

  // ── Historique : sur ce PC uniquement (history.json), jamais envoyé ailleurs ──
  type Visit = { url: string; title: string; t: number };
  const rawHist = load('history');
  let history: Visit[] = (Array.isArray(rawHist) ? rawHist : []).filter((v): v is Visit =>
    !!v && typeof v.url === 'string' && /^https?:/.test(v.url) && v.url.length <= 4096 && typeof v.title === 'string' && typeof v.t === 'number').slice(-5000);
  let histTimer: NodeJS.Timeout | undefined;
  const saveHistory = () => { clearTimeout(histTimer); histTimer = setTimeout(() => save('history', history), 1000); };

  // ── Coffre de mots de passe : chaque mot de passe chiffré (DPAPI), sur ce PC uniquement ──
  const rawVault = load('passwords');
  let vault: Entry[] = (Array.isArray(rawVault) ? rawVault : []).filter((e): e is Entry =>
    !!e && typeof e.host === 'string' && typeof e.user === 'string' && typeof e.enc === 'string' && typeof e.url === 'string').slice(0, 10000);
  let clipTimer: NodeJS.Timeout | undefined;
  // Copie d'un secret : effacé du presse-papiers après 30 s (seulement si c'est encore lui).
  const copySecret = (text: string, label: string) => {
    clipboard.writeText(text);
    clearTimeout(clipTimer);
    clipTimer = setTimeout(() => void Promise.resolve(clipboard.readText()).then(cur => { if (cur === text) clipboard.clear(); }), 30_000);
    msg(`${label} copié · effacé du presse-papiers dans 30 s`);
  };
  let histShown: Visit[] = []; // liste affichée : « history rm 3 » vise la 3e ligne
  function sendHistory(q = '') {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    histShown = history.filter(v => words.every(w => (v.url + ' ' + v.title).toLowerCase().includes(w))).slice(-300).reverse();
    send('history', { q, list: histShown });
  }
  let histQuery = '';
  function removeHistory(drop: Set<Visit>) {
    const before = history.length;
    history = history.filter(v => !drop.has(v));
    save('history', history);
    sendHistory(histQuery);
    msg(`${before - history.length} entrée(s) effacée(s) de l'historique`);
  }

  // ── Performances : mémoire et processeur de chaque page (app.getAppMetrics) ──
  function sendPerf() {
    const metrics = app.getAppMetrics();
    const byPid = new Map(metrics.map(m => [m.pid, m]));
    const mb = (kb: number) => Math.round(kb / 1024);
    // Mémoire privée (comme le Gestionnaire des tâches) : le « working set » compte aussi les pages partagées entre processus, plusieurs fois.
    const mem = (m: Electron.ProcessMetric) => m.memory.privateBytes ?? m.memory.workingSetSize;
    const used = new Set<number>();
    const tabs = browser.s.items.flatMap(i => {
      if (i.kind !== 'tab') return [];
      const wc = browser.webContentsOf(i.id);
      const m = wc && !wc.isDestroyed() ? byPid.get(wc.getOSProcessId()) : undefined;
      if (m) used.add(m.pid);
      const space = browser.s.spaces.find(s => s.id === i.spaceId)?.name.toLowerCase() ?? '';
      const z = browser.slept.get(i.id);
      return [{ id: i.id, title: i.url ? i.title || i.url : 'nouvelle page', space, mb: m ? mb(mem(m)) : 0, cpu: m ? Math.round(m.cpu.percentCPUUsage) : 0, asleep: !wc,
        sleptMin: !wc && z ? Math.floor((Date.now() - z.at) / 60_000) : -1, freed: !wc && z ? z.mb : 0, timer: browser.unloadPending(i.id) }];
    });
    const uiPid = ui.webContents.getOSProcessId();
    const other = metrics.filter(m => !used.has(m.pid)).map(m => ({ type: m.pid === uiPid ? 'Interface Phosphore' : m.type === 'Browser' ? 'Principal' : m.type, mb: mb(mem(m)), cpu: Math.round(m.cpu.percentCPUUsage) }));
    const total = metrics.reduce((a, m) => a + mem(m), 0);
    send('perf', { freed: tabs.reduce((n, t) => n + t.freed, 0), total: mb(total), cpu: Math.round(metrics.reduce((a, m) => a + m.cpu.percentCPUUsage, 0)), sysTotal: Math.round(os.totalmem() / 2 ** 20), sysFree: Math.round(os.freemem() / 2 ** 20), eco: settings.eco, tabs, other });
  }

  // Veille et fermeture automatiques : set idle-sleep / eco-sleep / sleep-pinned / sleep-never / close-idle.
  setInterval(() => browser.sweepNow({ idleMin: settings.idleSleep, ecoMin: settings.ecoSleep, eco: settings.eco, sleepPinned: settings.sleepPinned, never: settings.sleepNever, closeIdleMin: settings.closeIdle }), 60_000);

  const win = new BaseWindow({ width: 1280, height: 800, minWidth: 720, minHeight: 420, title: 'Phosphore', backgroundColor: '#0c0c0c', titleBarStyle: 'hidden', show: false,
    ...(fs.existsSync(ICON) ? { icon: ICON } : {}) });
  const ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/ui.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  ui.setBackgroundColor('#00000000'); // transparent : le site se voit à travers quand l'interface passe au-dessus
  win.contentView.addChildView(ui);
  const fit = () => { const b = win.getContentBounds(); ui.setBounds({ x: 0, y: 0, width: b.width, height: b.height }); };
  fit();
  win.on('resize', fit);

  let saveTimer: NodeJS.Timeout | undefined;
  // Les pages privées ne sont jamais écrites sur le disque.
  const persist = () => save('session', { ...browser.s, items: browser.s.items.filter(i => i.kind !== 'tab' || !i.private) });
  browser = new Browser(win, ui, sess, {
    changed() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 500);
      pushState();
    },
    input: onInput,
    visited(tabId, url, title) {
      seen.delete(tabId);
      if (!/^https?:/.test(url) || browser.tab(tabId)?.private) return;
      // Avertissement (ne bloque pas) : adresse qui imite peut-être un autre site.
      const warn = suspiciousUrl(url);
      if (warn) msg('⚠ ' + warn + ' · vérifiez l\'adresse avant de vous connecter');
      if (history[history.length - 1]?.url !== url) history.push({ url, title, t: Date.now() });
      if (history.length > 5000) history = history.slice(-5000);
      saveHistory();
    },
    titled(url, title) {
      const last = [...history].reverse().find(v => v.url === url);
      if (last && last.title !== title) { last.title = title; saveHistory(); }
    },
    ready: restyle,
    mode: url => modeOf(url, settings.textHosts),
    // Cookies communs : la partition de « perso » (déjà connectée) sert à tous les Spaces.
    partition: id => settings.sharedCookies ? 'persist:space-perso' : 'persist:space-' + id,
    unloadSpaces: () => settings.unloadSpaces,
    unloadDelay: () => settings.unloadDelay,
    sleepNever: () => settings.sleepNever,
    newTabEnd: () => settings.newTabEnd,
    dedupeOnOpen: () => settings.dedupeOnOpen,
    autoplayMute: () => settings.autoplayMute,
    sound: ev => playSound(ev),
    zoom: () => settings.zoom,
    privateClosed() {
      // Plus aucune page privée : cookies, stockage, cache et identifiants en mémoire effacés.
      const s = session.fromPartition(PRIVATE_PARTITION);
      void Promise.all([s.clearStorageData(), s.clearCache(), s.clearAuthCache(), s.clearHostResolverCache()]).catch(() => {});
    },
  });

  hardenWebContents({
    isUi: wc => wc === ui.webContents,
    openTab: (url, background, from) => {
      const t = browser.tab(browser.tabIdOf(from));
      browser.newTab(url, { background, spaceId: t?.spaceId, private: t?.private }); // un lien d'une page privée reste privé
    },
  });

  ui.webContents.on('before-input-event', (e, input) => onInput(ui.webContents, input, () => e.preventDefault()));
  // Boutons « précédent / suivant » de la souris (WM_APPCOMMAND, reçu par la fenêtre) : agit sur l'onglet affiché.
  win.on('app-command', (_e, command) => { if (command === 'browser-backward') runTab('back'); else if (command === 'browser-forward') runTab('forward'); });
  ui.webContents.loadURL('app://ui/index.html');
  // Extensions chargées AVANT de restaurer les pages : sinon leurs scripts n'agissent qu'après un rechargement.
  ui.webContents.once('did-finish-load', () => { win.show(); void Promise.all(spaceSessions().map(loadExtensions)).finally(() => browser.show()); });
  ui.webContents.on('did-finish-load', () => void restyleUi());

  win.on('close', () => {
    clearTimeout(saveTimer);
    persist();
    if (settings.clearHistoryOnExit) { history = []; clearTimeout(histTimer); save('history', history); } // set clear-history-on-exit
  });
  win.on('closed', () => app.quit());
  // Liens ouverts depuis Windows (navigateur par défaut) : une adresse http(s) en argument = un nouvel onglet.
  const openArgs = (argv: string[]) => { for (const u of argv.filter(a => /^https?:\/\//i.test(a) && a.length <= 4096)) browser.newTab(u); };
  app.on('second-instance', (_e, argv) => { if (win.isMinimized()) win.restore(); win.focus(); openArgs(argv); });
  ui.webContents.once('did-finish-load', () => setTimeout(() => openArgs(process.argv.slice(1)), 300));

  // ── Scripts et styles injectés dans les sites (monde isolé : invisibles pour le site) ──
  // Mode texte : conversion en lignes + mise en vedette des médias. Mode web : la page intacte (sauf Shorts masqués).
  const cssKeys = new WeakMap<WebContents, string[]>();
  async function restyle(wc: WebContents) {
    if (wc.isDestroyed()) return;
    // Confidentialité « strict » : WebRTC n'expose que l'IP publique (pas l'IP locale du réseau).
    try { wc.setWebRTCIPHandlingPolicy(settings.privacy === 'strict' ? 'default_public_interface_only' : 'default'); } catch { /* vue fermée */ }
    const url = wc.getURL();
    let host = '';
    try { host = new URL(url).hostname; } catch { /* page vide */ }
    const old = cssKeys.get(wc) ?? [];
    cssKeys.delete(wc);
    try {
      for (const k of old) await wc.removeInsertedCSS(k);
      const keys = [await wc.insertCSS(spotCss(settings), { cssOrigin: 'user' })];
      if (/(^|\.)youtube\.com$/.test(host)) keys.push(await wc.insertCSS(SHORTS_CSS, { cssOrigin: 'user' }));
      if (host) for (const name of settings.mods) { const css = modCss(name, host); if (css) keys.push(await wc.insertCSS(css, { cssOrigin: 'user' })); }
      cssKeys.set(wc, keys);
      await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: TEXT_SCRIPT }]);
      // Mot de passe sur une page http : il partirait en clair sur le réseau.
      // shortcut: vérifié une fois au dom-ready, un formulaire ajouté plus tard n'est pas vu ; passer par un MutationObserver si besoin.
      if (url.startsWith('http:') && host && !isLocalHost(host) && await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `!!document.querySelector('input[type=password]')` }]))
        msg(`⚠ ${host} : formulaire de mot de passe sur une page http non chiffrée, ne tapez pas de mot de passe ici`);
    } catch { /* page fermée ou en cours de navigation : dom-ready relancera */ }
  }

  // ── Mode texte : on interroge la page active, elle ne peut rien envoyer d'elle-même ──
  const seen = new Map<string, number>(); // dernière version envoyée à l'interface, par onglet
  let polling = false;
  const isolated = (wc: WebContents, code: string, gesture = false) =>
    wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `window.__phos ? (${code}) : null` }], gesture);
  setInterval(async () => {
    const tab = browser.active();
    const wc = tab && browser.webContentsOf(tab.id);
    if (polling || !tab || !wc || wc.isDestroyed() || !browser.textMode()) return;
    polling = true;
    try {
      const r = await isolated(wc, `__phos.snap(${seen.get(tab.id) ?? -1})`);
      if (r && typeof r === 'object') {
        const snap = clampSnap(tab.id, r);
        if (snap.lines) seen.set(tab.id, snap.v);
        send('snap', snap);
      }
    } catch { /* page en cours de chargement */ }
    polling = false;
  }, 350);

  /** Les lignes viennent du contenu du site : types et tailles vérifiés avant de les passer à l'interface. */
  function clampSnap(tabId: string, r: Record<string, unknown>): PageSnap {
    const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
    const int = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 ? v as number : 0;
    const m = r.media as Record<string, unknown> | null;
    const media = m && typeof m === 'object' ? {
      r: int(m.r), kind: m.kind === 'video' ? 'video' as const : 'img' as const,
      t: Number(m.t) || 0, d: Number(m.d) || 0, paused: m.paused === true, muted: m.muted === true,
    } : null;
    const snap: PageSnap = { tabId, v: int(r.v), media };
    if (Array.isArray(r.lines)) {
      snap.title = str(r.title, 300);
      snap.lines = r.lines.slice(0, 6000).flatMap((l): Line[] => Array.isArray(l) && Array.isArray(l[1])
        ? [[str(l[0], 8), l[1].slice(0, 400).flatMap(s => Array.isArray(s) ? [[str(s[0], 4000), int(s[1]), str(s[2], 1)] as Line[1][0]] : [])]]
        : []);
    }
    return snap;
  }
  const restyleAll = () => browser.allWebContents().forEach(restyle);
  // Mods « @match phosphore » : CSS ajouté à l'interface (insertCSS passe outre la CSP, aucun script).
  let uiCss: string[] = [];
  async function restyleUi() {
    try {
      for (const k of uiCss) await ui.webContents.removeInsertedCSS(k);
      uiCss = [];
      for (const name of settings.mods) { const css = modCss(name, '', true); if (css) uiCss.push(await ui.webContents.insertCSS(css)); }
    } catch { /* interface en cours de chargement */ }
  }
  const restyleEverything = () => { restyleAll(); void restyleUi(); sendMods(); };
  /** Fichiers de mods présents, pour la complétion de « mod on|off|edit|rm ». */
  function sendMods() {
    let files: string[] = [];
    try { files = fs.readdirSync(MODS_DIR()).filter(f => /^[a-z0-9_-]{1,40}\.css$/.test(f)).map(f => f.slice(0, -4)); } catch { /* pas encore de dossier */ }
    send('mods', [...files, ...soundModNames(MODS_DIR())].map(name => ({ name })));
  }
  /**
   * Mod de sons actif : validé et lu par le principal, envoyé à l'interface en octets (jamais un chemin ni une URL).
   * report : les problèmes du mod sont affichés (activation, mod reload).
   */
  function sendSounds(report = false) {
    const active = settings.mods.find(m => soundModNames(MODS_DIR()).includes(m));
    if (!active) return send('sounds', null);
    try {
      const { pack, errors } = loadSoundPack(MODS_DIR(), active);
      send('sounds', pack);
      if (report && errors.length) msg(`Mod de sons « ${active} » : ` + errors.join(' · '));
    } catch (e) { send('sounds', null); msg(`Mod de sons « ${active} » illisible : ${(e as Error).message}`); }
  }
  // Événements vers l'interface : un nom de la liste fermée, rien d'autre. Coupé par « set sound false » et par le mode éco.
  playSound = ev => { if (settings.sound && !settings.eco) send('sound', ev); };

  function send(event: string, data?: unknown) { if (!ui.webContents.isDestroyed()) ui.webContents.send('to-ui', event, data); }
  function pushState() {
    const st: UiState = { session: browser.s, live: browser.liveState(), settings, closedCount: browser.closed.length,
      closed: browser.closed.slice(-25).reverse().map(t => ({ id: t.id, title: t.title, url: t.url, spaceId: t.spaceId })), internal: browser.internal, memMo: Math.round(os.totalmem() / 2 ** 20) };
    send('state', st);
  }
  const msg = (text: string) => send('msg', text);
  notify = msg; // les protections réseau (dans session-created) peuvent prévenir l'interface
  // Tableau : l'interface l'affiche en vraies colonnes (largeurs en caractères), alignées même avec du chinois ou des emoji.
  const table = (t: { head: string[]; widths: number[]; rows: string[][]; foot?: string }) => send('table', t);
  // 'addr' = barre d'adresse en haut, 'cmd' = invite de commandes en bas (avec un texte déjà tapé, ex. « find »).
  const focusPrompt = (which: 'addr' | 'cmd' = 'addr', text = '') => { ui.webContents.focus(); send('focus-prompt', { which, text }); };
  // En mode texte, le clavier reste dans l'invite : la vraie page est en coulisse.
  const focusContent = () => browser.textMode() ? focusPrompt('cmd') : browser.focusPage();

  // ── Raccourcis clavier (captés aussi quand le focus est dans un site) ──
  function onInput(wc: WebContents, i: Input, prevent: () => void) {
    if (i.type !== 'keyDown') return;
    const ctrl = i.control && !i.alt && !i.meta;
    const key = i.key.toLowerCase();
    const tabId = browser.s.active[browser.s.activeSpace];
    const act = (fn: () => void) => { prevent(); fn(); };
    // Raccourcis de l'utilisateur (bind …) : prioritaires sur ceux de Phosphore.
    const combo = normKey([i.control && 'ctrl', i.alt && 'alt', i.shift && 'shift', key === ' ' ? 'space' : key].filter(Boolean).join('+'));
    const bound = combo && settings.binds[combo];
    if (bound) return act(() => runInput(bound));
    if (ctrl && !i.shift && key === 't') return act(() => { browser.newTab(); focusPrompt(); });
    if (ctrl && !i.shift && key === 'w') return act(() => tabId && browser.close(tabId));
    if (ctrl && i.shift && key === 't') return act(() => browser.restoreClosed());
    if ((ctrl && key === 'l') || key === 'f6') return act(() => focusPrompt('addr'));
    if (ctrl && key === 'k') return act(() => focusPrompt('cmd'));
    if (ctrl && !i.shift && key === 'f') return act(() => focusPrompt('cmd', 'find '));
    if (ctrl && key === 'tab') return act(() => browser.cycle(i.shift ? -1 : 1));
    if (ctrl && !i.shift && /^Digit[1-9]$/.test(i.code)) return act(() => {
      const sp = browser.s.spaces[Number(i.code.slice(5)) - 1];
      if (sp) browser.switchSpace(sp.id);
    });
    if (i.alt && !i.control && /^(Digit|Numpad)[1-9]$/.test(i.code)) return act(() => openShortcut(Number(i.code.slice(-1))));
    if (wc === ui.webContents) return;
    // Raccourcis propres aux sites.
    if ((ctrl && key === 'r') || key === 'f5') return act(() => runTab('reload'));
    if (i.alt && key === 'arrowleft') return act(() => runTab('back'));
    if (i.alt && key === 'arrowright') return act(() => runTab('forward'));
    if (key === 'f12') return act(() => wc.toggleDevTools());
    if (ctrl && (key === '=' || key === '+')) return act(() => wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5)));
    if (ctrl && key === '-') return act(() => wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5)));
    if (ctrl && key === '0') return act(() => wc.setZoomLevel(0));
  }

  /** Raccourcis de la nouvelle page : pages épinglées du Space, puis sites ajoutés (shortcut add). Même ordre que l'interface. */
  function openShortcut(n: number) {
    const pinned = browser.tabsInOrder().filter(t => t.pinned);
    const all = [...pinned.map(t => ({ tab: t, url: t.url })), ...settings.shortcuts.map(url => ({ tab: undefined, url }))];
    const s = all[n - 1];
    if (!s) return msg(`Alt+${n} : aucun raccourci · shortcut add <site> pour en ajouter`);
    if (s.tab) return browser.activate(s.tab.id);
    const cur = browser.active();
    browser.navigate(s.url, !!cur?.url); // la nouvelle page vide est réutilisée
    focusContent();
  }

  /** Une ligne tapée : « a ; b » enchaîne des commandes ; un alias est remplacé (un seul niveau, il peut lui-même contenir « ; »). */
  function runInput(text: string) {
    const parts = text.split(/\s;\s/);
    if (parts.length > 1) { parts.slice(0, 50).forEach(runInput); return; }
    const [w, ...rest] = text.trim().split(/\s+/);
    const alias = settings.aliases[w?.toLowerCase() ?? ''];
    // Alias avec {q} (texte encodé pour une adresse) ou {} (texte tel quel) : les mots tapés y sont mis ; sinon ajoutés à la fin.
    const expanded = !alias ? text : /\{q\}|\{\}/.test(alias)
      ? alias.replaceAll('{q}', encodeURIComponent(rest.join(' '))).replaceAll('{}', rest.join(' ')) : [alias, ...rest].join(' ');
    for (const p of expanded.split(/\s;\s/).slice(0, 50)) {
      const a = parse(p, settings.search);
      if (a) run(a);
    }
  }

  /** Vidéo principale de la page (la plus grande), dans le monde isolé : le site ne voit pas ce code. */
  const VIDEO = `[...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]`;
  const pageJs = (wc: WebContents, code: string) => wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], true);

  const findSpace = (arg: string) => {
    const n = Number(arg);
    const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return Number.isInteger(n) && n >= 1 ? browser.s.spaces[n - 1] : browser.s.spaces.find(x => norm(x.name).startsWith(norm(arg)));
  };

  /**
   * Page du Chrome Web Store, dans la langue choisie. fetch de Node (pas une session Chromium) : aucun cookie envoyé,
   * et Google sert la page directement au lieu de sa page de consentement.
   */
  async function cws(url: string): Promise<string> {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}hl=${settings.lang}`, { headers: { 'accept-language': settings.lang, 'user-agent': chromeUserAgent() }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Chrome Web Store : réponse ${r.status}`);
    const html = (await r.text()).slice(0, 3_000_000);
    if (/<base href="https:\/\/consent\.google/.test(html)) throw new Error('Google affiche sa page de consentement : réessayez plus tard, ou ouvrez start chromewebstore.google.com');
    return html;
  }

  /**
   * Vérifie si le Chromium/Electron embarqué a du retard (comparé à la dernière version stable d'Electron sur npm).
   * HTTPS depuis le principal, aucune donnée personnelle envoyée. silent : ne parle que s'il y a du retard.
   */
  async function checkUpdate(silent: boolean) {
    const cur = process.versions.electron, chrome = process.versions.chrome;
    try {
      const r = await suggestSession.fetch('https://registry.npmjs.org/electron/latest', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error('réponse ' + r.status);
      const latest = String((await r.json() as { version?: string }).version ?? '');
      save('update', { at: Date.now(), latest });
      const behind = Number(latest.split('.')[0]) - Number(cur.split('.')[0]);
      if (behind > 0) msg(`⚠ Mise à jour : Electron ${cur} (Chrome ${chrome}) · ${behind} version majeure(s) de retard sur ${latest}. Dans le dossier du projet : npm run update-electron puis npm run release (voir CLAUDE.md).`);
      else if (!silent) msg(`À jour : Electron ${cur} (Chrome ${chrome}) = dernière version stable ${latest}.`);
    } catch (e) { if (!silent) msg('update : vérification impossible · ' + (e as Error).message); }
  }

  // Mise à jour de Phosphore lui-même depuis GitHub Releases (publiée par npm run release) : téléchargée en fond, installée à la fermeture.
  // electron-updater vérifie le SHA-512 annoncé par latest.yml ; pas de signature de code (pas de certificat).
  autoUpdater.logger = null;
  let downloaded = '';
  autoUpdater.on('update-downloaded', i => { downloaded = i.version; msg(`Phosphore ${i.version} téléchargé : installé à la fermeture · update install pour redémarrer maintenant`); });
  async function checkAppUpdate(silent: boolean) {
    if (!app.isPackaged) { if (!silent) msg('update : version de développement (npm start recompile déjà), pas de mise à jour automatique.'); return; }
    try {
      const r = await autoUpdater.checkForUpdates();
      if (!silent) msg(downloaded ? `Phosphore ${downloaded} prêt · update install pour redémarrer` : r?.isUpdateAvailable ? `Phosphore ${r.updateInfo.version} disponible : téléchargement…` : `Phosphore ${app.getVersion()} est à jour.`);
    } catch (e) { if (!silent) msg('update : GitHub injoignable · ' + (e as Error).message); }
  }

  /** Écrit des cookies lus ailleurs dans la partition du Space actif (ou de tous si « set spaces true »), puis les efface de la mémoire. */
  async function injectCookies(res: Read, label: string) {
    const ses = session.fromPartition(settings.sharedCookies ? 'persist:space-perso' : 'persist:space-' + browser.s.activeSpace);
    let ok = 0, fail = 0;
    for (const c of res.cookies) { try { await ses.cookies.set(c); ok++; } catch { fail++; } c.value = ''; }
    await ses.cookies.flushStore();
    // v20 = Chrome/Edge récents : chiffrement lié à l'appli, illisible hors du navigateur d'origine.
    const v20 = res.v20 ? ` · ${res.v20} protégés (Chrome/Edge récents) : exportez un cookies.txt avec l'extension « Get cookies.txt LOCALLY » puis cookies import` : '';
    msg(`${ok} cookies importés depuis ${label} · ${res.skipped + fail} ignorés (expirés ou refusés)${v20}. Rechargez les pages (r).`);
  }

  /** Retire une extension de tous les Spaces (elle reste installée sur le disque). */
  function unloadExtension(dir: string) {
    for (const s of spaceSessions()) {
      for (const e of s.extensions.getAllExtensions()) if (path.resolve(e.path) === path.resolve(dir)) s.extensions.removeExtension(e.id);
      loaded.get(s)?.delete(dir);
    }
  }

  /** Liste des extensions pour la page « ext » de l'interface. */
  function sendExts() {
    const all = spaceSessions()[0]?.extensions.getAllExtensions() ?? [];
    send('exts', settings.extensions.map(d => {
      const e = all.find(x => path.resolve(x.path) === path.resolve(d));
      let name = e?.name, version = e?.version, desc = '';
      if (!e) try { const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')); name = m.name; version = m.version; } catch { /* dossier déplacé */ }
      try { desc = String(JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')).description ?? ''); } catch { /* idem */ }
      // Noms traduits (__MSG_x__) : lus dans _locales, en français si possible.
      const msgOf = (v: string | undefined) => {
        const k = /^__MSG_(\w+)__$/.exec(v ?? '')?.[1];
        if (!k) return v;
        for (const loc of ['fr', 'en', 'en_US']) try { const j = JSON.parse(fs.readFileSync(path.join(d, '_locales', loc, 'messages.json'), 'utf8')); const hit = Object.entries(j).find(([kk]) => kk.toLowerCase() === k.toLowerCase()); if (hit) return String((hit[1] as { message?: string }).message ?? v); } catch { /* pas cette langue */ }
        return v;
      };
      return { name: msgOf(name) ?? path.basename(d), version: version ?? '', desc: (msgOf(desc) ?? '').slice(0, 200), dir: d, store: !!storeId(path.basename(d)), loaded: !!e, off: settings.extOff.includes(d) };
    }));
  }

  /** Ajoute un dossier d'extension, chargé dans tous les Spaces. */
  async function addExtension(dir: string) {
    if (settings.extensions.includes(dir)) {
      // Mise à jour (ext store relancé) : rechargée partout.
      for (const s of spaceSessions()) { for (const e of s.extensions.getAllExtensions()) if (path.resolve(e.path) === path.resolve(dir)) s.extensions.removeExtension(e.id); loaded.get(s)?.delete(dir); }
    }
    try {
      const e = await spaceSessions()[0].extensions.loadExtension(dir, { allowFileAccess: false });
      settings = { ...settings, extensions: [...new Set([...settings.extensions, dir])] };
      save('settings', settings);
      spaceSessions().forEach(loadExtensions);
      msg(`Extension ajoutée : ${e.name} ${e.version} (dans tous les Spaces) · rechargez les pages (r)`);
      sendExts();
    } catch (err) { msg('extension refusée · ' + String((err as Error).message).slice(0, 200)); }
  }

  function runTab(op: Extract<Action, { type: 'tab' }>['op']) {
    const tab = browser.active();
    const wc = tab && browser.webContentsOf(tab.id);
    const nav = wc?.navigationHistory;
    switch (op) {
      case 'new': browser.newTab(); return focusPrompt();
      case 'close': return tab && browser.close(tab.id);
      case 'restore': return browser.closed.length ? browser.restoreClosed() : msg('AUCUNE PAGE FERMÉE');
      case 'pin': case 'unpin': return tab && browser.pin(tab.id, op === 'pin');
      case 'next': return browser.cycle(1);
      case 'prev': return browser.cycle(-1);
      case 'sleep-others': return browser.sleepOthers();
      case 'sleep-current': return browser.sleepCurrent() ? msg('Page mise en veille') : msg('sleep tab : il faut une autre page dans ce Space pour y passer');
      case 'back': return nav?.canGoBack() && nav.goBack();
      case 'forward': return nav?.canGoForward() && nav.goForward();
      case 'dup': return tab?.url ? void browser.newTab(tab.url) : msg('RIEN À DUPLIQUER');
      case 'close-others': for (const t of browser.tabsInOrder()) if (t.id !== tab?.id && !t.pinned) browser.close(t.id); return;
      case 'copy': if (tab?.url) { clipboard.writeText(tab.url); return msg('ADRESSE COPIÉE : ' + tab.url); } return msg('AUCUNE ADRESSE');
      case 'print': return wc ? wc.print() : msg('AUCUNE PAGE À IMPRIMER');
      case 'stop': return wc?.stop();
      case 'top': case 'bottom':
        return void wc?.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `scrollTo(0, ${op === 'top' ? 0 : 'document.documentElement.scrollHeight'})` }]).catch(() => {});
      case 'reload': {
        if (!tab) return;
        const l = browser.live.get(tab.id);
        if (l) l.error = null;
        browser.internal = false;
        if (wc) wc.reload();
        browser.show(); // recrée la vue si l'onglet dormait ou avait planté
      }
    }
  }

  let lastFind = '';
  let autorunDone = false;
  function run(a: Action) {
    switch (a.type) {
      case 'navigate': browser.navigate(a.url, a.newTab); return focusContent();
      case 'tab': return runTab(a.op);
      case 'error': return msg(a.message);
      case 'cls': return send('cls');
      case 'close': {
        const t = browser.tabsInOrder()[a.n - 1];
        return t ? browser.close(t.id) : msg(`rm : pas de page n° ${a.n} (ls pour la liste)`);
      }
      case 'pwd': { const t = browser.active(); return msg(t?.url || '(nouvelle page)'); }
      case 'ls': {
        // Sortie façon terminal : numéro (pour sel / rm), titre, site.
        const cur = browser.active()?.id;
        return table({ head: ['', 'N°', 'Titre', 'Site'], widths: [2, 4, 52, 32],
          rows: browser.tabsInOrder().map((t, k) => [t.id === cur ? '>' : '', String(k + 1), (t.private ? '◆ ' : '') + (t.label ?? (t.url ? t.title : 'nouvelle page')), t.url ? new URL(t.url).host : '']) });
      }
      case 'go': {
        const t = browser.tabsInOrder()[a.n - 1];
        return t ? browser.activate(t.id) : msg(`PAS DE PAGE N° ${a.n}`);
      }
      case 'zoom': {
        const wc = browser.active() && browser.webContentsOf(browser.active()!.id);
        if (!wc) return msg('AUCUNE PAGE');
        const z = a.x === 'in' ? wc.getZoomFactor() + 0.1 : a.x === 'out' ? wc.getZoomFactor() - 0.1 : a.x / 100;
        browser.setZoom(browser.active()!.id, Math.min(Math.max(z, 0.25), 5)); // gardé pour cette page, même si la fenêtre change
        return msg(`ZOOM ${Math.round(wc.getZoomFactor() * 100)} % · zoom par défaut de toutes les pages : set zoom <25-500>`);
      }
      case 'find': {
        const wc = browser.active() && browser.webContentsOf(browser.active()!.id);
        if (!wc) return msg('AUCUNE PAGE');
        if (!a.text) { wc.stopFindInPage('clearSelection'); return msg('RECHERCHE EFFACÉE'); }
        wc.once('found-in-page', (_e, r) => msg(r.matches ? `${r.matches} RÉSULTAT(S) POUR « ${a.text} » · retapez la commande pour le suivant` : `AUCUN RÉSULTAT POUR « ${a.text} »`));
        wc.findInPage(a.text, { findNext: lastFind === a.text }); // même texte retapé : résultat suivant
        lastFind = a.text;
        return;
      }
      case 'win':
        if (a.op === 'min') return win.minimize();
        if (a.op === 'max') return win.isMaximized() ? win.unmaximize() : win.maximize();
        if (a.op === 'full') { win.setFullScreen(!win.isFullScreen()); return msg(win.isFullScreen() ? 'Plein écran · fullscreen pour sortir' : 'Plein écran quitté'); }
        if (a.op === 'ontop') { win.setAlwaysOnTop(!win.isAlwaysOnTop()); return msg(win.isAlwaysOnTop() ? 'Phosphore reste au premier plan · ontop pour arrêter' : 'Premier plan désactivé'); }
        return win.close();
      case 'page':
        send('page', a.page);
        if (a.page === 'history') { histQuery = a.q ?? ''; sendHistory(histQuery); }
        if (a.page === 'perf') sendPerf();
        if (a.page === 'ext') sendExts();
        if (a.page === 'tabs') send('find-tab', a.q ?? '');
        if (a.page === 'guide') send('guide-open', a.q ?? '');
        if (a.page === 'bookmarks') send('bm-q', a.q ?? '');
        return;
      case 'ext': {
        if (a.op === 'open') {
          // Popup d'extension (barre d'outils, non gérée par Electron) ouvert dans un onglet : permet d'utiliser Bitwarden, etc.
          const dir = settings.extensions[a.n - 1];
          if (!dir) return msg(`ext open : pas d'extension n° ${a.n} (ext pour la liste)`);
          const e = spaceSessions()[0]?.extensions.getAllExtensions().find(x => path.resolve(x.path) === path.resolve(dir));
          if (!e) return msg(`ext open : extension n° ${a.n} non chargée (ext on ${a.n} d'abord)`);
          const m = e.manifest as { action?: { default_popup?: string }; browser_action?: { default_popup?: string }; page_action?: { default_popup?: string }; options_page?: string; options_ui?: { page?: string } };
          const popup = m.action?.default_popup ?? m.browser_action?.default_popup ?? m.page_action?.default_popup ?? m.options_ui?.page ?? m.options_page ?? '';
          browser.newTab(e.url + popup); // e.url = chrome-extension://<id>/
          return msg(`${e.name} ouvert dans un onglet. Connecte-toi ici ; l'auto-remplissage sur les pages fonctionne à part.`);
        }
        if (a.op === 'rm' || a.op === 'on' || a.op === 'off' || a.op === 'update') {
          const dir = settings.extensions[a.n - 1];
          if (!dir) return msg(`ext ${a.op} : pas d'extension n° ${a.n} (ext pour la liste)`);
          if (a.op === 'update') {
            const id = storeId(path.basename(dir));
            if (!id) return msg('ext update : extension ajoutée à la main (ext add), pas depuis le Store');
            return run({ type: 'ext', op: 'store', n: 0, arg: id });
          }
          unloadExtension(dir);
          if (a.op === 'on') { settings = { ...settings, extOff: settings.extOff.filter(d => d !== dir) }; save('settings', settings); spaceSessions().forEach(loadExtensions); }
          else settings = { ...settings, extensions: a.op === 'rm' ? settings.extensions.filter(d => d !== dir) : settings.extensions, extOff: a.op === 'off' ? [...new Set([...settings.extOff, dir])] : settings.extOff.filter(d => d !== dir) };
          save('settings', settings);
          sendExts();
          return msg(`Extension ${a.op === 'rm' ? 'retirée' : a.op === 'on' ? 'activée' : 'désactivée'} · r pour recharger les pages`);
        }
        if (a.op === 'store') {
          // ext store : téléchargée depuis le Chrome Web Store (clients2.google.com), puis extraite dans <données>/extensions.
          // Sans argument : extension de la page ouverte du Store ; sinon le Store s'ouvre. Un nom : recherche dans le Store.
          const here = browser.active()?.url ?? '';
          const id = storeId(a.arg || (/^https:\/\/chromewebstore\.google\.com\/detail\//.test(here) ? here : ''));
          if (!id) {
            // Menu Store de Phosphore (comme history) : recherche dans le Chrome Web Store, résultats en liste.
            send('page', 'store');
            sendExts();
            if (!a.arg) return send('store', { q: '', list: [] });
            send('store', { q: a.arg, list: [], loading: true });
            cws('https://chromewebstore.google.com/search/' + encodeURIComponent(a.arg.slice(0, 100)))
              .then(html => send('store', { q: a.arg, list: parseSearch(html) }), e => send('store', { q: a.arg, list: [], error: (e as Error).message }));
            return;
          }
          msg('ext store : téléchargement…');
          const major = /Chrome\/(\d+)/.exec(chromeUserAgent())?.[1] ?? '152';
          installFromStore(id, EXT_DIR(), major, url => fetch(url, { signal: AbortSignal.timeout(60_000) })).then(addExtension, e => msg('ext store : ' + (e as Error).message));
          return;
        }
        // ext add : l'utilisateur choisit lui-même le dossier ; rien n'est téléchargé.
        dialog.showOpenDialog(win, { title: 'Dossier de l\'extension (avec manifest.json)', properties: ['openDirectory'] }).then(async r => {
          const dir = r.filePaths[0];
          if (r.canceled || !dir) return;
          if (!fs.existsSync(path.join(dir, 'manifest.json'))) return msg('ext add : pas de manifest.json dans ce dossier');
          if (settings.extensions.includes(dir)) return msg('ext add : déjà installée');
          await addExtension(dir);
        });
        return;
      }
      case 'mod': {
        // Deux sortes de mods : CSS (<nom>.css, cumulables) et sons (<nom>/mod.json + audio, un seul actif). Les sons sont des données, jamais du code.
        fs.mkdirSync(MODS_DIR(), { recursive: true });
        const cssMods = () => fs.readdirSync(MODS_DIR()).filter(f => /^[a-z0-9_-]{1,40}\.css$/.test(f)).map(f => f.slice(0, -4));
        const isSound = (n: string) => soundModNames(MODS_DIR()).includes(n);
        if (a.op === 'folder') return void shell.openPath(MODS_DIR());
        if (a.op === 'reload') { restyleEverything(); sendSounds(true); return msg('Mods réappliqués'); }
        if (a.op === 'ls') {
          const css = cssMods(), snd = soundModNames(MODS_DIR());
          if (!css.length && !snd.length) return msg('Aucun mod. mod new <nom> : mod CSS · mod new sound <nom> : mod de sons · mod import <fichier> : en ajoute un.');
          const target = (f: string) => { try { return modMatch(fs.readFileSync(modFile(f), 'utf8'))?.join(', ') ?? 'tous les sites'; } catch { return '?'; } };
          const sounds = (n: string) => { try { const j = JSON.parse(fs.readFileSync(path.join(MODS_DIR(), n, 'mod.json'), 'utf8')); return Object.keys(j.sounds ?? {}).join(', '); } catch { return '?'; } };
          return table({ head: ['', 'Mod', 'Type', 'S\'applique à'], widths: [4, 28, 7, 60],
            rows: [...css.map(f => [settings.mods.includes(f) ? '[x]' : '[ ]', f, 'css', target(f)]), ...snd.map(n => [settings.mods.includes(n) ? '[x]' : '[ ]', n, 'sons', sounds(n)])],
            foot: 'mod on|off|edit|rm <nom> · mod import <fichier> · mod folder · « @match phosphore » = habille l\'interface · un seul mod de sons actif à la fois' });
        }
        // Activer un mod de sons désactive l'autre (un seul à la fois) ; les mods CSS restent cumulables.
        const enable = (names: string[]) => {
          const sound = names.filter(isSound);
          const keep = sound.length ? settings.mods.filter(m => !isSound(m)) : settings.mods;
          settings = { ...settings, mods: [...new Set([...keep, ...names.filter(n => !isSound(n)), ...sound.slice(-1)])] };
          save('settings', settings);
          restyleEverything();
          sendSounds(true);
        };
        if (a.op === 'import') {
          const add = (files: string[]) => {
            const done: string[] = [];
            for (const f of files) {
              try {
                if (path.extname(f).toLowerCase() === '.css') {
                  // Mod CSS : le nom du mod = nom du fichier.
                  const name = modName(path.basename(f, path.extname(f)));
                  if (!name) throw new Error('nom de fichier inutilisable');
                  if (fs.statSync(f).size > 500_000) throw new Error('fichier trop gros (500 Ko max)');
                  fs.copyFileSync(f, modFile(name));
                  done.push(name);
                  continue;
                }
                // Mod de sons : dossier, .zip, ou mod Opera GX (.crx ou dossier installé).
                const r = importSoundMod(openSource(f), MODS_DIR());
                done.push(r.name);
                msg([`Mod de sons « ${r.name} » importé${r.opera ? ' depuis Opera GX' : ''} : ${r.events} événement(s) avec un son.`,
                  ...(r.ignored.length ? ['Ignoré (pas un son de l\'interface ou sans équivalent) : ' + r.ignored.join(' · ')] : []),
                  ...(r.errors.length ? ['Problèmes : ' + r.errors.join(' · ')] : [])].join('\n'));
              } catch (e) { msg(`mod import : ${path.basename(f)} · ${(e as Error).message}`); }
            }
            if (done.length) enable(done);
          };
          if (a.name) return add([a.name]);
          dialog.showOpenDialog(win, { title: 'Mod à importer (.css, .zip, .crx Opera GX)', filters: [{ name: 'Mods', extensions: ['css', 'zip', 'crx'] }], properties: ['openFile', 'multiSelections'] })
            .then(r => { if (!r.canceled) add(r.filePaths); });
          return;
        }
        if (a.op === 'new-sound') {
          if (fs.existsSync(modFile(a.name))) return msg(`mod new sound : un mod CSS s'appelle déjà « ${a.name} »`);
          const dir = path.join(MODS_DIR(), a.name);
          if (!fs.existsSync(path.join(dir, 'mod.json'))) {
            fs.mkdirSync(dir, { recursive: true });
            const s = sampleMod(a.name);
            for (const [n, b] of s.files) fs.writeFileSync(path.join(dir, n), b);
            fs.writeFileSync(path.join(dir, 'mod.json'), s.json);
          }
          void shell.openPath(dir);
          return msg(`Mod de sons « ${a.name} » créé (bips d'exemple) : remplacez les fichiers ou modifiez mod.json, puis mod on ${a.name} (ou mod reload).`);
        }
        const file = modFile(a.name);
        const dir = path.join(MODS_DIR(), a.name);
        const sound = isSound(a.name);
        if (a.op === 'new') {
          if (sound) return msg(`mod new : « ${a.name} » est déjà un mod de sons`);
          if (!fs.existsSync(file)) fs.writeFileSync(file, `/* @match youtube.com */\n/* Mod « ${a.name} » : écrivez ici du CSS. Retirez la ligne @match pour l'appliquer à tous les sites,\n   ou mettez « @match phosphore » pour habiller l'interface de Phosphore. */\n\n`);
          enable([a.name]);
          void shell.openPath(file);
          return msg(`Mod ${a.name} créé et activé. Enregistrez le fichier puis tapez mod reload.`);
        }
        if (!sound && !fs.existsSync(file)) return msg(`mod : « ${a.name} » introuvable (mod ls)`);
        if (a.op === 'edit') return void shell.openPath(sound ? dir : file);
        if (a.op === 'rm') {
          dialog.showMessageBox(win, { type: 'question', buttons: ['Supprimer', 'Annuler'], defaultId: 1, cancelId: 1, message: `Supprimer le mod « ${a.name} » ?`, detail: sound ? dir : file }).then(r => {
            if (r.response !== 0) return;
            if (sound) fs.rmSync(dir, { recursive: true, force: true }); else fs.rmSync(file, { force: true });
            settings = { ...settings, mods: settings.mods.filter(m => m !== a.name) };
            save('settings', settings);
            restyleEverything();
            sendSounds(true);
            msg(`Mod ${a.name} supprimé`);
          });
          return;
        }
        if (a.op === 'on') enable([a.name]);
        else { settings = { ...settings, mods: settings.mods.filter(m => m !== a.name) }; save('settings', settings); restyleEverything(); sendSounds(true); }
        return msg(`Mod ${a.name} ${a.op === 'on' ? 'activé' : 'désactivé'}${sound && a.op === 'on' ? ' (les autres mods de sons sont désactivés)' : ''}`);
      }
      // ── contrôle complet : onglet n°, ordre, noms, dossiers, fenêtre, favoris, permissions, sessions… ──
      case 'tabn': {
        const t = browser.tabsInOrder()[a.n - 1];
        if (!t) return msg(`pas de page n° ${a.n} (ls pour la liste)`);
        if (a.op === 'sleep') { if (t.id === browser.active()?.id) return msg('la page affichée ne peut pas dormir : sleep tab passe à la suivante puis l\'endort'); browser.sleep(t.id); return msg(`« ${t.title.slice(0, 40)} » en veille`); }
        if (a.op === 'wake') { browser.wake(t.id); return msg(`« ${t.title.slice(0, 40)} » réveillée`); }
        if (a.op === 'pin' || a.op === 'unpin') return browser.pin(t.id, a.op === 'pin');
        const wc = browser.webContentsOf(t.id);
        if (!wc) return msg('page en veille : rien à couper');
        wc.setAudioMuted(!wc.isAudioMuted());
        pushState();
        return msg(`« ${t.title.slice(0, 40)} » : ${wc.isAudioMuted() ? 'son coupé' : 'son remis'}`);
      }
      case 'tabmove': {
        const order = browser.tabsInOrder();
        const t = a.from ? order[a.from - 1] : browser.active();
        if (!t) return msg('tab move : page introuvable (ls pour les numéros)');
        const k = order.indexOf(t) + 1;
        const to = a.to === 'up' ? k - 1 : a.to === 'down' ? k + 1 : a.to === 'first' ? 1 : a.to === 'last' ? order.length : a.to;
        browser.moveTo(t.id, Math.min(Math.max(to, 1), order.length));
        return msg(`« ${t.title.slice(0, 40)} » à la place ${Math.min(Math.max(to, 1), order.length)}`);
      }
      case 'tabrename': {
        const t = browser.active();
        if (!t) return msg('aucune page');
        if (a.name) t.label = a.name; else delete t.label;
        browser.show();
        return msg(a.name ? `Page renommée « ${a.name} » (tab rename seul : nom d'origine)` : 'Nom d\'origine remis');
      }
      case 'closeset': {
        const cur = browser.active();
        if (a.which === 'right') { if (cur) browser.closeRight(cur.id); return; }
        for (const t of browser.tabsInOrder()) if (!t.pinned) browser.close(t.id);
        return msg('Pages du Space fermées (les épinglées restent) · undo pour en rouvrir');
      }
      case 'reload-all': {
        for (const t of browser.tabsInOrder()) browser.webContentsOf(t.id)?.reload();
        return msg('Pages du Space rechargées (celles en veille se chargeront à l\'ouverture)');
      }
      case 'info': {
        const t = browser.active();
        if (!t) return msg('aucune page');
        const wc = browser.webContentsOf(t.id);
        const sp = browser.s.spaces.find(x => x.id === t.spaceId)?.name ?? '';
        return table({ head: ['Page', 'Info'], widths: [14, 90], rows: [
          ['Titre', t.title], ['Nom choisi', t.label ?? '—'], ['Adresse', t.url || '(nouvelle page)'], ['Space', sp.toLowerCase()],
          ['Épinglée', t.pinned ? 'oui' : 'non'], ['Privée', t.private ? 'oui' : 'non'], ['État', wc ? 'active' : 'en veille'],
          ['Zoom', `${Math.round((browser.zooms.get(t.id) ?? settings.zoom / 100) * 100)} %`], ['Son', wc ? (wc.isAudioMuted() ? 'coupé' : wc.isCurrentlyAudible() ? 'joue' : 'silence') : '—'],
          ['N° (ls)', String(browser.tabsInOrder().indexOf(t) + 1)],
        ] });
      }
      case 'open-many': {
        for (const u of a.urls) browser.newTab(u, { background: true });
        return msg(`${a.urls.length} page(s) ouvertes en arrière-plan`);
      }
      case 'tabfold': {
        const t = browser.active();
        if (!t) return msg('aucune page');
        if (!a.name) { const f = browser.folder(t.parent); if (!f) return msg('la page n\'est dans aucun dossier'); browser.move(t.id, f.id, 'after'); return msg('Page sortie du dossier ' + f.name); }
        const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const f = browser.s.items.find(i => i.kind === 'folder' && i.spaceId === t.spaceId && norm(i.name) === norm(a.name))
          ?? browser.s.items.find(i => i.kind === 'folder' && i.spaceId === t.spaceId && norm(i.name).startsWith(norm(a.name)));
        if (!f) return msg(`fold : pas de dossier « ${a.name} » dans ce Space (mkdir ${a.name} pour le créer)`);
        browser.move(t.id, f.id, 'inside');
        return msg(`Page rangée dans ${(f as { name: string }).name}`);
      }
      case 'downloads': {
        const dir = settings.downloadDir || app.getPath('downloads');
        void shell.openPath(dir);
        return msg('Dossier des téléchargements : ' + dir + ' · set download-dir <dossier> · set download-ask false (plus de question)');
      }
      case 'home': {
        if (!settings.home) { browser.newTab(); focusPrompt(); return msg('Pas de page d\'accueil : set home <adresse>'); }
        browser.navigate(settings.home, false);
        return focusContent();
      }
      case 'pastego': {
        // Adresse copiée : ouverte ; autre texte : recherché (comme s'il était tapé en haut).
        void Promise.resolve(clipboard.readText()).then(t => { const text = t.trim().slice(0, 2048); if (!text) return msg('presse-papiers vide'); const a2 = parse(text, settings.search); if (a2?.type === 'navigate') run(a2); else run({ type: 'navigate', url: searchUrl(text, settings.search), newTab: false }); });
        return;
      }
      case 'clip': {
        const t = browser.active();
        if (!t?.url) return msg('aucune adresse');
        const text = a.what === 'title' ? (t.label ?? t.title) : `[${(t.label ?? t.title).replace(/[[\]]/g, '')}](${t.url})`;
        void clipboard.writeText(text);
        return msg((a.what === 'title' ? 'Titre copié : ' : 'Lien markdown copié : ') + text);
      }
      case 'bm': {
        if (a.op === 'add') {
          const t = browser.active();
          const url = a.arg || t?.url || '';
          if (!url) return msg('bm add : aucune page ouverte (ou bm add <adresse> [nom])');
          const name = a.name || (a.arg ? new URL(url).hostname.replace(/^www\./, '') : (t?.label ?? t?.title ?? '')).slice(0, 80);
          settings = { ...settings, bookmarks: [...settings.bookmarks.filter(b => b.url !== url), { name, url }].slice(-1000) };
          save('settings', settings);
          pushState();
          return msg(`Favori ajouté : ${name} · bm pour la liste`);
        }
        const b = settings.bookmarks[Number(a.arg) - 1];
        if (!b) return msg(`bm : pas de favori n° ${a.arg} (bm pour la liste)`);
        if (a.op === 'open') { browser.navigate(b.url, !!browser.active()?.url); return focusContent(); }
        settings = { ...settings, bookmarks: settings.bookmarks.filter(x => x !== b) };
        save('settings', settings);
        pushState();
        return msg('Favori retiré : ' + b.name);
      }
      case 'perm': {
        if (a.op === 'ls') {
          const rows = Object.entries(settings.permissions).map(([site, l]) => [site, l.join(', ')]);
          return rows.length ? table({ head: ['Site', 'Droits accordés'], widths: [34, 70], rows, foot: 'perm deny <site> <droit> pour retirer · tout le reste est refusé' })
            : msg('Aucun droit accordé : tout est refusé (sauf le plein écran). perm allow <site> <camera|microphone|notifications|geolocation|clipboard|storage|midi>');
        }
        const site = cleanDomain(a.site);
        if (!site) return msg('perm : site invalide « ' + a.site + ' » (ex. meet.google.com)');
        if (!PERM_ID_LIST.includes(a.perm)) return msg(`perm : droit inconnu « ${a.perm} » · ${PERM_ID_LIST.join(' ')}`);
        const cur = settings.permissions[site] ?? [];
        const next = a.op === 'allow' ? [...new Set([...cur, a.perm])] : cur.filter(p => p !== a.perm);
        const permissions = { ...settings.permissions };
        if (next.length) permissions[site] = next; else delete permissions[site];
        settings = { ...settings, permissions };
        save('settings', settings);
        return msg(`${site} : ${a.perm} ${a.op === 'allow' ? 'autorisé' : 'refusé'} · r pour recharger la page`);
      }
      case 'session': {
        const dir = path.join(app.getPath('userData'), 'sessions');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, a.name + '.json');
        if (a.op === 'ls') {
          const files = fs.readdirSync(dir).filter(f => /^[a-z0-9_-]{1,40}\.json$/.test(f));
          if (!files.length) return msg('Aucune session. session save <nom> : garde les pages du Space actif');
          return table({ head: ['Session', 'Pages'], widths: [30, 10], rows: files.map(f => { let n = '?'; try { n = String(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).tabs.length); } catch { /* illisible */ } return [f.slice(0, -5), n]; }),
            foot: 'session load <nom> : rouvre ces pages dans un nouveau Space (endormies) · session rm <nom>' });
        }
        if (a.op === 'save') {
          // Pages du Space actif (jamais les pages privées), adresses et titres seulement.
          const tabs = browser.tabsInOrder().filter(t => t.url && !t.private).map(t => ({ url: t.url, title: t.label ?? t.title }));
          fs.writeFileSync(file, JSON.stringify({ name: a.name, tabs }, null, 1));
          return msg(`Session « ${a.name} » enregistrée : ${tabs.length} page(s) · session load ${a.name} pour la rouvrir`);
        }
        if (!fs.existsSync(file)) return msg(`session : « ${a.name} » introuvable (session ls)`);
        if (a.op === 'rm') { fs.rmSync(file); return msg(`Session « ${a.name} » supprimée`); }
        let tabs: { url: string }[] = [];
        try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); tabs = (Array.isArray(j.tabs) ? j.tabs : []).filter((t: { url?: unknown }) => typeof t?.url === 'string' && /^https?:\/\//.test(t.url as string)).slice(0, 200); } catch { return msg('session : fichier illisible'); }
        browser.newSpace(a.name.toUpperCase().slice(0, 24));
        for (const t of tabs) browser.newTab(t.url, { background: true, lazy: true });
        return msg(`Session « ${a.name} » rouverte dans un nouveau Space : ${tabs.length} page(s), chargées à l'ouverture`);
      }
      case 'net-check': {
        // IP publique vue par le web, via la session en mémoire (proxy appliqué) : vérifier qu'un proxy marche bien.
        msg('net-check : interrogation…');
        suggestSession.fetch('https://api.ipify.org?format=json', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
          .then(r => r.ok ? r.json() : Promise.reject(new Error('réponse ' + r.status)))
          .then((j: unknown) => msg(`IP publique vue par le web : ${String((j as { ip?: string }).ip ?? '?').slice(0, 64)} · proxy : ${settings.proxy || '(celui de Windows)'}`),
            (e: Error) => msg('net-check : ' + e.message));
        return;
      }
      case 'update':
        if (a.install) return downloaded ? autoUpdater.quitAndInstall() : msg('update install : aucune mise à jour téléchargée · update pour vérifier');
        void checkUpdate(true); void checkAppUpdate(false); return;
      case 'blocklist-allow': {
        if (a.op === 'ls') return msg(settings.blockAllow.length ? 'Exclus du blocage (pubs/traqueurs/hameçonnage) : ' + settings.blockAllow.join(', ') : 'Aucune exception. blocklist allow example.com · (activer le blocage : set blocklist true)');
        const d = cleanDomain(a.site);
        if (!d) return msg('blocklist : site invalide « ' + a.site + ' »');
        settings = { ...settings, blockAllow: a.op === 'add' ? [...new Set([...settings.blockAllow, d])] : settings.blockAllow.filter(x => x !== d) };
        save('settings', settings);
        return msg(`${d} ${a.op === 'add' ? 'ne sera plus bloqué · r pour recharger' : 'de nouveau soumis au blocage'}`);
      }
      case 'https-allow': {
        if (a.op === 'ls') return msg(settings.httpsAllow.length ? 'Gardés en http (https-only ne les force pas) : ' + settings.httpsAllow.join(', ') : 'Aucun site gardé en http. https-allow add example.com');
        const d = cleanDomain(a.site);
        if (!d) return msg('https-allow : site invalide « ' + a.site + ' »');
        settings = { ...settings, httpsAllow: a.op === 'add' ? [...new Set([...settings.httpsAllow, d])] : settings.httpsAllow.filter(x => x !== d) };
        save('settings', settings);
        return msg(`${d} ${a.op === 'add' ? 'gardé en http · r pour recharger' : 'retiré (forcé en https si https-only)'}`);
      }
      case 'default-browser': {
        // Inscription complète dans le registre (clés que Windows exige pour apparaître dans « Applications par défaut »).
        if (!app.isPackaged) return msg('default-browser : seulement sur la version installée (.exe), pas en développement.');
        const exe = process.execPath;
        if (a.off) {
          for (const k of ['HKCU\\Software\\Classes\\PhosphoreURL', 'HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore']) execFile('reg', ['delete', k, '/f'], () => {});
          execFile('reg', ['delete', 'HKCU\\Software\\RegisteredApplications', '/v', 'Phosphore', '/f'], () => {});
          app.removeAsDefaultProtocolClient('http'); app.removeAsDefaultProtocolClient('https');
          return msg('Phosphore retiré des navigateurs par défaut de Windows.');
        }
        const keys: string[][] = [
          ['HKCU\\Software\\Classes\\PhosphoreURL', '/ve', '/d', 'Phosphore URL'],
          ['HKCU\\Software\\Classes\\PhosphoreURL\\shell\\open\\command', '/ve', '/d', `"${exe}" "%1"`],
          ['HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore', '/ve', '/d', 'Phosphore'],
          ['HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore\\shell\\open\\command', '/ve', '/d', `"${exe}"`],
          ['HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore\\Capabilities', '/v', 'ApplicationName', '/d', 'Phosphore'],
          ['HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore\\Capabilities', '/v', 'ApplicationDescription', '/d', 'Navigateur Phosphore'],
          ['HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore\\Capabilities\\URLAssociations', '/v', 'http', '/d', 'PhosphoreURL'],
          ['HKCU\\Software\\Clients\\StartMenuInternet\\Phosphore\\Capabilities\\URLAssociations', '/v', 'https', '/d', 'PhosphoreURL'],
          ['HKCU\\Software\\RegisteredApplications', '/v', 'Phosphore', '/d', 'Software\\Clients\\StartMenuInternet\\Phosphore\\Capabilities'],
        ];
        for (const k of keys) execFile('reg', ['add', ...k, '/f'], () => {});
        for (const p of ['http', 'https']) app.setAsDefaultProtocolClient(p, exe);
        void shell.openExternal('ms-settings:defaultapps?registeredAppUser=Phosphore');
        return msg('Phosphore inscrit comme navigateur. Dans la fenêtre Windows : choisissez Phosphore pour http et https. · default-browser off pour annuler.');
      }
      case 'cookies-all': {
        const t = browser.active();
        const ses = session.fromPartition(settings.sharedCookies ? 'persist:space-perso' : 'persist:space-' + browser.s.activeSpace);
        dialog.showMessageBox(win, { type: 'warning', buttons: ['Tout effacer', 'Annuler'], defaultId: 1, cancelId: 1,
          message: `Effacer tous les cookies et données de site ${settings.sharedCookies ? 'de tous les Spaces' : 'de ce Space'} ?`,
          detail: 'Vous serez déconnecté de tous les sites (Google, YouTube…). Irréversible.' }).then(r => {
          if (r.response !== 0) return;
          void ses.clearStorageData().then(() => { msg('Cookies et données de site effacés'); if (t) runTab('reload'); });
        });
        return;
      }
      case 'history-clear':
        history = [];
        save('history', history);
        sendHistory();
        return msg('HISTORIQUE EFFACÉ');
      case 'history-rm': {
        if (a.site) {
          const site = a.site.replace(/^www\./, '');
          return removeHistory(new Set(history.filter(v => { try { const h = new URL(v.url).hostname; return h === site || h.endsWith('.' + site); } catch { return false; } })));
        }
        if (!histShown.length) return msg('history rm : ouvrez d\'abord la liste (history) pour voir les numéros');
        return removeHistory(new Set(a.ns.map(n => histShown[n - 1]).filter(Boolean)));
      }
      case 'pip': {
        const wc = browser.active() && browser.webContentsOf(browser.active()!.id);
        if (!wc) return msg('AUCUNE VIDÉO');
        return void pageJs(wc, `(async () => {
          if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'off'; }
          const v = ${VIDEO};
          if (!v) return 'none';
          v.disablePictureInPicture = false;
          await v.requestPictureInPicture();
          return 'on';
        })()`).then(r => msg(r === 'none' ? 'AUCUNE VIDÉO SUR CETTE PAGE' : r === 'off' ? 'PIP FERMÉ' : 'PIP : la vidéo reste visible par-dessus les autres fenêtres · retapez pip pour sortir'),
          e => msg('pip : refusé par la page · ' + String((e as Error).message).slice(0, 120)));
      }
      case 'private': {
        browser.newTab(a.url, { private: true });
        msg('NAVIGATION PRIVÉE : ni historique, ni cookies gardés, ni « fermés » · tout est effacé à la fermeture de la dernière page privée');
        return a.url ? focusContent() : focusPrompt();
      }
      case 'mv': {
        const sp = findSpace(a.space);
        if (!sp) return msg(`mv : Space inconnu « ${a.space} »`);
        if (a.which === 'all') { const n = browser.moveAll(browser.s.activeSpace, sp.id); return msg(`${n} page(s) déplacée(s) vers ${sp.name.toLowerCase()}`); }
        const t = a.which === 'cur' ? browser.active() : browser.tabsInOrder()[a.which - 1];
        if (!t) return msg('mv : page introuvable (ls pour les numéros)');
        browser.moveToSpace(t.id, sp.id);
        return msg(`« ${t.title.slice(0, 40)} » déplacée vers ${sp.name.toLowerCase()}`);
      }
      case 'sort': browser.sort(browser.s.activeSpace, a.by); return msg('Pages triées par ' + (a.by === 'site' ? 'site' : 'titre'));
      case 'reopen': {
        // Même ordre que la liste « fermés » de la barre latérale (la plus récente = 1), limitée par closed-max.
        const list = browser.closed.slice(-25).reverse().slice(0, Math.max(settings.closedMax, 1));
        const t = list[a.n - 1];
        return t ? browser.restoreClosed(t.id) : msg(`reopen : pas de page n° ${a.n} dans « fermés » (${list.length} au plus, set closed-max)`);
      }
      case 'sleep-never': {
        if (a.op === 'ls') return msg(settings.sleepNever.length ? 'Jamais en veille : ' + settings.sleepNever.join(', ') : 'Aucun site. sleep never add discord.com');
        const d = cleanDomain(a.site);
        if (!d) return msg('sleep never : site invalide « ' + a.site + ' » (ex. discord.com)');
        settings = { ...settings, sleepNever: a.op === 'add' ? [...new Set([...settings.sleepNever, d])] : settings.sleepNever.filter(x => x !== d) };
        save('settings', settings);
        return msg(`${d} ${a.op === 'add' ? 'ne sera jamais mis en veille' : 'retiré de la liste'}`);
      }
      case 'dedup': return msg(`${browser.dedup(browser.s.activeSpace)} page(s) en double fermée(s)`);
      case 'tool': {
        const tab = browser.active();
        const wc = tab && browser.webContentsOf(tab.id);
        const url = tab?.url ?? '';
        switch (a.op) {
          case 'restart': app.relaunch(); return win.close();
          case 'cache-clear':
            void Promise.all([...spaceSessions(), session.defaultSession].map(s => s.clearCache())).then(() => msg('Cache vidé'));
            return;
          case 'wake': browser.wakeAll(); return msg('Pages du Space réveillées');
        }
        if (!url) return msg('Aucun site ouvert');
        if (a.op === 'translate') return browser.newTab(`https://translate.google.com/translate?sl=auto&tl=${settings.lang.slice(0, 2)}&u=${encodeURIComponent(url)}`, { private: tab?.private });
        if (a.op === 'archive') return browser.newTab('https://web.archive.org/web/2/' + url, { private: tab?.private });
        if (!wc) return msg('Page en veille : r pour la recharger d\'abord');
        if (a.op === 'devtools') return wc.toggleDevTools();
        const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const base = ((() => { try { return new URL(url).hostname; } catch { return 'page'; } })() + '-' + stamp).replace(/[^a-z0-9._-]/gi, '_');
        if (a.op === 'shot') {
          return void wc.capturePage().then(img => {
            const dir = path.join(app.getPath('pictures'), 'Phosphore');
            fs.mkdirSync(dir, { recursive: true });
            const f = path.join(dir, base + '.png');
            fs.writeFileSync(f, img.toPNG());
            void clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]).catch(() => {});
            msg('Capture copiée dans le presse-papiers et enregistrée : ' + f);
          }, () => msg('capture impossible'));
        }
        if (a.op === 'pdf') {
          return void wc.printToPDF({ printBackground: true }).then(buf => {
            const f = path.join(app.getPath('downloads'), base + '.pdf');
            fs.writeFileSync(f, buf);
            msg('PDF enregistré : ' + f);
          }, () => msg('PDF impossible'));
        }
        // cookies clear : cookies du site ouvert (et de ses sous-domaines) dans la partition de la page.
        const host = new URL(url).hostname.replace(/^www\./, '');
        return void wc.session.cookies.get({}).then(async all => {
          const mine = all.filter(c => { const d = (c.domain ?? '').replace(/^\./, ''); return d === host || d.endsWith('.' + host) || host.endsWith('.' + d); });
          for (const c of mine) await wc.session.cookies.remove(`http${c.secure ? 's' : ''}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`, c.name).catch(() => {});
          msg(`${mine.length} cookie(s) de ${host} effacé(s) · r pour recharger`);
        });
      }
      case 'alias': case 'bind': {
        const dict = a.type === 'alias' ? settings.aliases : settings.binds;
        if (a.op === 'ls') {
          const rows = Object.entries(dict);
          return rows.length ? table({ head: [a.type === 'alias' ? 'Alias' : 'Touches', 'Commande'], widths: [20, 80], rows, foot: `${a.type} rm <${a.type === 'alias' ? 'nom' : 'touches'}> : retirer` })
            : msg(a.type === 'alias' ? 'Aucun alias. alias yt start youtube.com' : 'Aucun raccourci. bind alt+y start youtube.com');
        }
        const key = a.type === 'alias' ? (isAliasName(a.name) && parse(a.name, settings.search)?.type === 'navigate' ? a.name : null) : normKey(a.name);
        if (!key) return msg(a.type === 'alias' ? `alias : nom invalide ou déjà une commande « ${a.name} »` : `bind : touches invalides « ${a.name} » (ex. alt+y, ctrl+shift+k, f2 ; Ctrl ou Alt obligatoire sauf F1-F24)`);
        const next = { ...dict };
        if (a.op === 'rm') delete next[key]; else next[key] = a.cmd;
        settings = { ...settings, [a.type === 'alias' ? 'aliases' : 'binds']: next };
        save('settings', settings);
        return msg(a.op === 'rm' ? `${a.type} ${key} retiré` : `${a.type} ${key} = ${a.cmd}`);
      }
      case 'shortcut': {
        if (a.op === 'ls') return settings.shortcuts.length
          ? table({ head: ['N', 'Site'], widths: [4, 80], rows: settings.shortcuts.map((u, k) => [String(k + 1), u]), foot: 'Alt+1-9 sur la nouvelle page (après les pages épinglées) · shortcut rm <n>' })
          : msg('Aucun raccourci. shortcut add twitch.tv');
        if (a.op === 'add') settings = { ...settings, shortcuts: [...settings.shortcuts.filter(u => u !== a.arg), a.arg].slice(-9) };
        else {
          const u = settings.shortcuts[Number(a.arg) - 1];
          if (!u) return msg(`shortcut rm : pas de raccourci n° ${a.arg} (shortcut ls)`);
          settings = { ...settings, shortcuts: settings.shortcuts.filter(x => x !== u) };
        }
        save('settings', settings);
        msg(a.op === 'add' ? 'Raccourci ajouté : ' + a.arg : 'Raccourci retiré');
        return pushState();
      }
      case 'source': {
        // Fichier de commandes : une commande par ligne, « # » = commentaire. Pratique pour une configuration toute faite.
        const runFile = (f: string) => {
          let text: string;
          try { if (fs.statSync(f).size > 200_000) throw new Error(); text = fs.readFileSync(f, 'utf8'); } catch { return msg('source : fichier illisible ou trop gros · ' + f); }
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//')).slice(0, 500);
          for (const l of lines) if (!/^(source|\.)(\s|$)/i.test(l)) runInput(l); // pas de source dans un source (boucle)
          msg(`source : ${lines.length} commande(s) exécutée(s) depuis ${path.basename(f)}`);
        };
        if (a.file) return runFile(a.file);
        dialog.showOpenDialog(win, { title: 'Fichier de commandes Phosphore', filters: [{ name: 'Commandes', extensions: ['txt', 'phos'] }], properties: ['openFile'] })
          .then(r => { if (!r.canceled && r.filePaths[0]) runFile(r.filePaths[0]); });
        return;
      }
      case 'settings-op': {
        if (a.op === 'autorun') {
          // autorun.txt : commandes exécutées à chaque démarrage (comme un .bashrc).
          if (!fs.existsSync(AUTORUN())) fs.writeFileSync(AUTORUN(), '# Commandes lancées à chaque démarrage de Phosphore, une par ligne (# = commentaire).\n# Exemple :\n# set color clock #ffffff\n# start youtube.com\n');
          void shell.openPath(AUTORUN());
          return msg('autorun.txt ouvert · enregistrez-le : il sera exécuté au prochain démarrage (ou tapez source ' + AUTORUN() + ')');
        }
        if (a.op === 'export') {
          const f = path.join(app.getPath('documents'), 'phosphore-config.txt');
          fs.writeFileSync(f, toCommands(settings).join('\n') + '\n');
          shell.showItemInFolder(f);
          return msg('Configuration exportée : ' + f + ' · source <ce fichier> pour la réappliquer');
        }
        // Réglages par défaut ; les extensions, mods, sites en texte, profil et sceau sont gardés.
        const d = defaults();
        settings = { ...d, extensions: settings.extensions, mods: settings.mods, textHosts: settings.textHosts, profile: settings.profile, seal: settings.seal };
        save('settings', settings);
        restyleEverything();
        msg('Réglages remis par défaut');
        return pushState();
      }
      case 'import-pass': {
        if (!vaultAvailable()) return msg('Coffre indisponible : le chiffrement du système (DPAPI) n\'est pas accessible.');
        dialog.showOpenDialog(win, { title: 'Fichier CSV de mots de passe', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] }).then(async r => {
          const file = r.filePaths[0];
          if (r.canceled || !file) return;
          let text: string;
          try { text = fs.readFileSync(file, 'utf8'); } catch { return msg('import : fichier illisible'); }
          let rows;
          try { rows = parseCsv(text); } catch (e) { return msg('import : ' + (e as Error).message); }
          text = ''; // le contenu en clair ne reste pas en mémoire plus que nécessaire
          if (!rows.length) return msg('import : aucun mot de passe dans ce fichier');
          const before = vault.length;
          vault = merge(vault, encryptRows(rows));
          rows.forEach(r => { r.pass = ''; }); // efface les mots de passe en clair
          save('passwords', vault);
          // Le CSV en clair est supprimé, avec l'accord de l'utilisateur.
          const del = await dialog.showMessageBox(win, { type: 'question', buttons: ['Supprimer le fichier CSV', 'Le garder'], defaultId: 0, cancelId: 1,
            message: `${vault.length - before} mot(s) de passe ajouté(s) au coffre (${vault.length} en tout).`, detail: `Le fichier « ${path.basename(file)} » contient vos mots de passe en clair. Le supprimer maintenant ?` });
          if (del.response === 0) { try { fs.rmSync(file); msg(`${vault.length - before} importés · CSV supprimé`); } catch { msg('importés · CSV non supprimé'); } }
          else msg(`${vault.length - before} importés · pensez à supprimer le CSV`);
        });
        return;
      }
      case 'import-cookie-file': {
        // Fichier de cookies choisi par l'utilisateur : cookies.txt, « Cookies » de Chrome/Edge/Opera, ou cookies.sqlite de Firefox.
        const go = (file: string) => {
          let res;
          try { res = readCookieFile(file); } catch (e) { return msg('cookies import : ' + (e as Error).message); }
          if (!res.cookies.length) return msg(`cookies import : aucun cookie utilisable dans ${path.basename(file)}${res.v20 ? ` (${res.v20} protégés par Chrome/Edge : exportez plutôt un cookies.txt)` : ''}`);
          void injectCookies(res, `${path.basename(file)} (${res.kind})`);
        };
        if (a.file) return go(a.file);
        dialog.showOpenDialog(win, {
          title: 'Fichier de cookies d\'un autre navigateur (fermez-le avant)',
          defaultPath: path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data', 'Default', 'Network'),
          filters: [{ name: 'Cookies (cookies.txt, Cookies, cookies.sqlite)', extensions: ['txt', 'sqlite', '*'] }],
          properties: ['openFile', 'showHiddenFiles'],
        }).then(r => { if (!r.canceled && r.filePaths[0]) go(r.filePaths[0]); });
        return;
      }
      case 'import-cookies': {
        const part = settings.sharedCookies ? 'persist:space-perso' : 'persist:space-' + browser.s.activeSpace;
        const space = browser.s.spaces.find(s => s.id === browser.s.activeSpace)?.name ?? '';
        const installed = installedBrowsers();
        if (!installed.length) return msg('import cookies : aucun navigateur Chromium (Chrome, Edge, Brave, Opera, Vivaldi) trouvé sur ce PC.');
        // Navigateur choisi : par son nom (import cookies chrome) ou, sans nom, par une fenêtre de choix.
        const named = a.browser ? (chromiumBrowsers().find(b => b.id === a.browser || b.label.toLowerCase().includes(a.browser)) ?? null) : null;
        if (a.browser && !named) return msg(`import cookies : navigateur inconnu « ${a.browser} » · ${chromiumBrowsers().map(b => b.id).join(' ')}`);
        const run = (dir: string, label: string) => {
          dialog.showMessageBox(win, { type: 'question', buttons: ['Importer', 'Annuler'], defaultId: 0, cancelId: 1,
            message: `Importer les cookies de ${label} dans ${settings.sharedCookies ? 'tous les Spaces' : 'le Space ' + space} ?`,
            detail: `Fermez complètement ${label} avant (icône près de l'horloge comprise). Vos sessions (Google, YouTube…) seront reprises ici.` }).then(r => {
            if (r.response !== 0) return;
            try { void injectCookies(readChromiumCookies(dir), label); } catch (e) { msg('import cookies : ' + (e as Error).message); }
          });
        };
        if (named) return run(named.dir, named.label);
        // Fenêtre de choix du navigateur source (seulement ceux installés).
        dialog.showMessageBox(win, { type: 'question', buttons: [...installed.map(b => b.label), 'Annuler'], cancelId: installed.length,
          message: 'De quel navigateur reprendre les cookies ?', detail: 'Fermez-le complètement avant l\'import.' }).then(r => {
          const b = installed[r.response];
          if (b) run(b.dir, b.label);
        });
        return;
      }
      case 'pass': {
        if (a.op === 'forget') { vault = []; save('passwords', vault); return msg('Coffre vidé.'); }
        if (a.op === 'ls') {
          if (!vault.length) return msg('Coffre vide. import passwords : charger un fichier CSV exporté d\'un autre navigateur.');
          const words = a.q.toLowerCase().split(/\s+/).filter(Boolean);
          const rows = vault.map((e, i) => ({ e, n: i + 1 })).filter(({ e }) => words.every(w => (e.host + ' ' + e.user).toLowerCase().includes(w)));
          return table({ head: ['N', 'Site', 'Identifiant'], widths: [6, 34, 44], rows: rows.slice(0, 200).map(({ e, n }) => [String(n), e.host, e.user]),
            foot: 'pass copy <n> : copier le mot de passe · pass user <n> : copier l\'identifiant · jamais affiché à l\'écran' });
        }
        const e = vault[a.n - 1];
        if (!e) return msg(`pass : pas d'entrée n° ${a.n} (pass ls)`);
        if (a.op === 'user') return copySecret(e.user, `Identifiant de ${e.host}`);
        try { copySecret(decrypt(e), `Mot de passe de ${e.host}`); } catch { msg('pass : déchiffrement impossible (coffre d\'un autre compte Windows ?)'); }
        return;
      }
      case 'sidebar': {
        if (a.op === 'ls') return table({ head: ['Place', 'Bouton', 'Description'], widths: [7, 12, 40],
          rows: [...settings.sidebar.map((k, n) => [String(n + 1), k, WIDGETS[k]]), ...Object.entries(WIDGETS).filter(([k]) => !settings.sidebar.includes(k as Widget)).map(([k, d]) => ['—', k, d])],
          foot: 'sidebar add|rm <bouton> · sidebar move <bouton> <place> · sidebar order a,b,c · ou glisser les boutons dans la barre' });
        if (a.op === 'on' || a.op === 'off') settings = { ...settings, sideHidden: a.op === 'off' };
        else if (a.op === 'order') {
          // sidebar order clock,closed,history : ordre complet (les boutons absents sont retirés) · none : aucun bouton
          const list = a.arg === 'none' ? [] : [...new Set(a.arg.split(','))];
          const bad = list.find(w => !(w in WIDGETS));
          if (bad) return msg(`sidebar order : bouton inconnu « ${bad} » · sidebar ls`);
          settings = { ...settings, sidebar: list as Widget[] };
        } else if (a.op === 'move') {
          const w = a.arg as Widget;
          if (!(w in WIDGETS)) return msg(`sidebar move : bouton inconnu « ${a.arg} » · sidebar ls`);
          const rest = settings.sidebar.filter(x => x !== w);
          rest.splice(Math.min(Math.max((a.n ?? 1) - 1, 0), rest.length), 0, w);
          settings = { ...settings, sidebar: rest };
        }
        else {
          const w = a.arg as Widget;
          if (!(w in WIDGETS)) return msg(`sidebar : bouton inconnu « ${a.arg} » · sidebar ls pour la liste`);
          settings = { ...settings, sidebar: a.op === 'add' ? [...new Set([...settings.sidebar, w])] : settings.sidebar.filter(x => x !== w) };
          msg(`sidebar : ${w} ${a.op === 'add' ? 'ajouté' : 'retiré'}`);
        }
        save('settings', settings);
        return pushState();
      }
      case 'ui': {
        if (a.op === 'ls') return table({ head: ['Élément', 'État', 'Description'], widths: [10, 9, 44],
          rows: Object.entries(PARTS).map(([k, d]) => [k, settings.hidden.includes(k as Part) ? 'masqué' : 'visible', d]),
          foot: `ui hide|show <élément> · ui reset · textes (set text <clé> <texte>) : ${Object.keys(TEXTS).join(' ')}` });
        if (a.op === 'reset') settings = { ...settings, hidden: [] };
        else {
          if (!(a.part in PARTS)) return msg(`ui : élément inconnu « ${a.part} » · ui ls pour la liste`);
          const others = settings.hidden.filter(p => p !== a.part);
          settings = { ...settings, hidden: a.op === 'hide' ? [...others, a.part as Part] : others };
          if (a.part === 'prompt' && a.op === 'hide') msg('Invite masquée : Ctrl+K la réaffiche le temps de taper · ui show prompt pour la remettre');
        }
        save('settings', settings);
        return pushState();
      }
      case 'view': {
        const tab = browser.active();
        let host = '';
        try { host = new URL(tab?.url ?? '').hostname; } catch { return msg('AUCUN SITE OUVERT'); }
        const textHosts = settings.textHosts.filter(h => h !== host);
        settings = { ...settings, textHosts: a.mode === 'text' ? [...textHosts, host] : textHosts };
        save('settings', settings);
        const wc = browser.webContentsOf(tab!.id);
        if (wc) restyle(wc);
        browser.show();
        return msg(`${host} : MODE ${a.mode === 'web' ? 'WEB (VRAIE PAGE)' : 'TEXTE'}`);
      }
      case 'media': {
        const wc = browser.active() && browser.webContentsOf(browser.active()!.id);
        if (a.op === 'mute-others') {
          let n = 0;
          for (const o of browser.allWebContents()) if (o !== wc && !o.isAudioMuted()) { o.setAudioMuted(true); n++; }
          pushState();
          return msg(`Son coupé sur ${n} autre(s) page(s)`);
        }
        if (!wc) return msg('AUCUNE PAGE');
        if (a.op === 'unmute') { wc.setAudioMuted(false); browser.autoMuted.delete(browser.active()!.id); pushState(); return msg('SON REMIS'); }
        if (a.op === 'close') return isolated(wc, '__phos.spot(0)').catch(() => {});
        if (a.op === 'mute') { wc.setAudioMuted(!wc.isAudioMuted()); return msg(wc.isAudioMuted() ? 'SON COUPÉ' : 'SON REMIS'); }
        if (a.op === 'speed' || a.op === 'loop') {
          const code = a.op === 'speed' ? `(() => { const v = ${VIDEO}; if (!v) return null; v.playbackRate = ${a.x}; return 'VITESSE ×' + v.playbackRate; })()`
            : `(() => { const v = ${VIDEO}; if (!v) return null; v.loop = !v.loop; return v.loop ? 'VIDÉO EN BOUCLE' : 'BOUCLE ARRÊTÉE'; })()`;
          return void pageJs(wc, code).then(r => msg(typeof r === 'string' ? r : 'AUCUNE VIDÉO SUR CETTE PAGE'), () => {});
        }
        return isolated(wc, `__phos.media(${JSON.stringify(a.op)}, ${a.x})`, true).then(ok => { if (!ok) msg('AUCUNE VIDÉO SUR CETTE PAGE'); }, () => {});
      }
      case 'set': {
        const next = applySetting(settings, a.key, a.value);
        if (typeof next === 'string') return msg(next);
        const ecoOn = next.eco && !settings.eco;
        settings = next;
        save('settings', settings);
        restyleAll();
        if (a.key === 'proxy') {
          for (const s of [...spaceSessions(), session.defaultSession, session.fromPartition(PRIVATE_PARTITION)]) applyProxy(s);
          msg(settings.proxy ? 'Proxy : ' + settings.proxy + ' (toutes les pages, r pour recharger)' : 'Proxy retiré (celui de Windows)');
        }
        if (a.key === 'lang' || a.key === 'langue') {
          for (const s of [...spaceSessions(), session.defaultSession]) s.setUserAgent(chromeUserAgent(), settings.lang);
          msg(`Langue ${settings.lang} : demandée aux sites dès maintenant (r pour recharger), complète après restart`);
        }
        if ((a.key === 'safebrowsing' || a.key === 'blocklist')) {
          // Activation : on télécharge la liste tout de suite (puis au plus une fois par jour).
          if (settings.safeBrowsing) void blockLists?.refresh('safe');
          if (settings.blockAds) void blockLists?.refresh('ads');
          msg(a.key === 'blocklist'
            ? (settings.blockAds ? 'Blocage des pubs/traqueurs activé (liste téléchargée en arrière-plan) · r pour recharger' : 'Blocage des pubs désactivé')
            : (settings.safeBrowsing ? 'Protection anti-hameçonnage activée (liste locale, aucune URL envoyée)' : 'Protection anti-hameçonnage désactivée'));
        }
        if (a.key === 'eco') {
          if (ecoOn) browser.sleepOthers();
          msg(settings.eco ? `MODE ÉCO ACTIVÉ : autres pages en veille, veille après ${settings.ecoSleep} min (set eco-sleep) · moins de processus au prochain démarrage` : 'MODE ÉCO DÉSACTIVÉ');
        }
        return pushState();
      }
      case 'space': {
        const s = browser.s;
        const cur = s.spaces.find(x => x.id === s.activeSpace)!;
        const name = a.arg.trim().toUpperCase().slice(0, 24);
        if (a.op === 'new') return browser.newSpace(name);
        if (a.op === 'rename') { cur.name = name; return browser.show(); }
        if (a.op === 'sleep') { for (const t of browser.tabsInOrder()) if (t.id !== browser.active()?.id) browser.sleep(t.id); return msg('Pages du Space en veille (sauf celle affichée)'); }
        if (a.op === 'clear') { for (const t of browser.tabsInOrder()) if (!t.pinned) browser.close(t.id); return msg('Pages du Space fermées (les épinglées restent) · undo pour en rouvrir'); }
        if (a.op === 'fold' || a.op === 'unfold') return send('collapse', { ids: a.arg === 'all' ? s.spaces.map(x => x.id) : [cur.id], on: a.op === 'fold' });
        if (a.op === 'move') { browser.moveSpace(cur.id, Number(a.arg) - 1); return msg(`Space ${cur.name.toLowerCase()} à la place ${Math.min(Number(a.arg), s.spaces.length)}`); }
        if (a.op === 'color') {
          // Couleur du Space actif = set color spaceN (N = sa place, les couleurs tournent par 6).
          const k = (s.spaces.indexOf(cur) % 6) + 1;
          return run({ type: 'set', key: 'color', value: `space${k} ${a.arg}` });
        }
        const n = Number(a.arg);
        const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const target = a.arg && Number.isInteger(n) ? s.spaces[n - 1] : a.arg ? s.spaces.find(x => norm(x.name).startsWith(norm(name))) : cur;
        // rmspace <nom> (ou space delete) : toujours une confirmation, les cookies du Space sont effac\u00e9s.
        if (a.op === 'delete') return target ? send('confirm', { what: 'space-delete', id: target.id, text: `SUPPRIMER LE SPACE ${target.name}, SES PAGES ET SES COOKIES ?` }) : msg('rmspace : Space inconnu \u00ab ' + a.arg + ' \u00bb');
        return target ? browser.switchSpace(target.id) : msg('SPACE INCONNU : ' + name);
      }
      case 'folder': {
        const tab = browser.active();
        const f = browser.folder(tab?.parent);
        if (a.op === 'new') {
          const folder = browser.newFolder(a.arg.trim().slice(0, 40));
          if (tab && !tab.pinned) browser.move(tab.id, folder.id, 'inside');
          return;
        }
        if (!f) return msg('LA PAGE ACTIVE N\'EST DANS AUCUN DOSSIER');
        if (a.op === 'rename') { f.name = a.arg.trim().slice(0, 40); return browser.show(); }
        return browser.deleteFolder(f.id);
      }
    }
  }

  /** Menus clic droit (onglet, Space, dossier). La cible et l'opération sont vérifiées ici. */
  function ctx(x: Record<string, unknown>) {
    if (!isId(x.id) || typeof x.op !== 'string') return;
    const name = typeof x.arg === 'string' ? x.arg.trim().slice(0, 40) : '';
    if (x.kind === 'tab') {
      const tab = browser.tab(x.id);
      if (!tab) return;
      const wc = browser.webContentsOf(tab.id);
      switch (x.op) {
        case 'new-right': browser.activate(tab.id); browser.newTab('', { next: true, private: tab.private }); return focusPrompt();
        case 'reload': browser.activate(tab.id); return runTab('reload');
        case 'dup': browser.activate(tab.id); return runTab('dup');
        case 'pin': case 'unpin': return browser.pin(tab.id, x.op === 'pin');
        case 'mute': if (wc) { wc.setAudioMuted(!wc.isAudioMuted()); pushState(); } return;
        case 'copy': if (tab.url) { clipboard.writeText(tab.url); msg('ADRESSE COPIÉE : ' + tab.url); } return;
        case 'sleep': return browser.sleep(tab.id);
        case 'close': return browser.close(tab.id);
        case 'close-others': for (const t of browser.tabsInOrder(tab.spaceId)) if (t.id !== tab.id && !t.pinned) browser.close(t.id); return;
        case 'close-right': return browser.closeRight(tab.id);
        case 'move': if (isId(x.arg)) browser.moveToSpace(tab.id, x.arg); return;
      }
    } else if (x.kind === 'space') {
      const sp = browser.s.spaces.find(s => s.id === x.id);
      if (!sp) return;
      const tabs = () => browser.tabsInOrder(sp.id);
      switch (x.op) {
        case 'open': return browser.switchSpace(sp.id);
        case 'new-tab': browser.switchSpace(sp.id); browser.newTab(); return focusPrompt();
        case 'rename': if (name) { sp.name = name.toUpperCase(); browser.show(); } return;
        case 'new': if (name) browser.newSpace(name.toUpperCase()); return;
        case 'sleep': for (const t of tabs()) if (t.id !== browser.active()?.id) browser.sleep(t.id); return;
        case 'close-all': for (const t of tabs()) if (!t.pinned) browser.close(t.id); return;
        case 'move-all': if (isId(x.arg)) { const n = browser.moveAll(sp.id, x.arg); msg(`${n} page(s) déplacée(s)`); } return;
        case 'delete': return send('confirm', { what: 'space-delete', id: sp.id, text: `SUPPRIMER LE SPACE ${sp.name}, SES PAGES ET SES COOKIES ?` });
      }
    } else if (x.kind === 'folder') {
      const f = browser.folder(x.id);
      if (!f) return;
      switch (x.op) {
        case 'rename': if (name) { f.name = name; browser.show(); } return;
        case 'delete': return browser.deleteFolder(f.id);
        case 'toggle': return browser.toggleFolder(f.id);
        case 'new-tab': browser.switchSpace(f.spaceId); browser.newTab('', { parent: f.id }); return focusPrompt();
      }
    }
  }

  // ── IPC : un seul canal, chaque message est vérifié (expéditeur puis contenu) ──
  const ID = /^[a-z0-9-]{1,40}$/;
  const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e5;

  ipcMain.on('ui', (e, m: unknown) => {
    if (e.sender !== ui.webContents || !e.senderFrame?.url.startsWith('app://ui/')) return;
    if (!m || typeof m !== 'object') return;
    const x = m as Record<string, unknown>;
    switch (x.t) {
      case 'ready':
        pushState();
        sendExts(); sendMods(); // listes pour la complétion de l'invite
        if (!autorunDone) { sendSounds(); playSound('boot'); }
        // Premier affichage : autorun.txt (s'il existe) est exécuté une fois.
        if (!autorunDone && fs.existsSync(AUTORUN())) run({ type: 'source', file: AUTORUN() });
        // Vérification de mise à jour au démarrage, au plus une fois par jour, silencieuse sauf si Chromium a du retard.
        if (!autorunDone && settings.updateCheck) {
          const last = load('update') as { at?: number } | undefined;
          if (!last?.at || Date.now() - last.at > 864e5) setTimeout(() => void checkUpdate(true), 4000);
          setTimeout(() => void checkAppUpdate(true), 5000);
        }
        // Rafraîchit les listes de blocage activées (au plus une fois par jour, en silence).
        if (!autorunDone) {
          if (settings.safeBrowsing) setTimeout(() => void blockLists?.refresh('safe'), 6000);
          if (settings.blockAds) setTimeout(() => void blockLists?.refresh('ads'), 8000);
        }
        autorunDone = true;
        return;
      case 'run':
        if (typeof x.input === 'string' && x.input.length <= 4096) {
          playSound(parse(x.input.split(/\s;\s/)[0], settings.search)?.type === 'error' ? 'cmd-error' : 'cmd-ok');
          runInput(x.input);
        }
        return;
      case 'history-rm': {
        // Entrées choisies dans la page history (Ctrl+clic puis Suppr), désignées par leur heure de visite.
        if (!Array.isArray(x.ts) || x.ts.length > 5000) return;
        const ts = new Set(x.ts.filter((v): v is number => typeof v === 'number'));
        return removeHistory(new Set(history.filter(v => ts.has(v.t))));
      }
      case 'activate': if (isId(x.id)) browser.activate(x.id); return focusContent();
      case 'close': if (isId(x.id)) browser.close(x.id); return;
      case 'reopen': if (isId(x.id)) browser.restoreClosed(x.id); return;
      case 'perf': return sendPerf();
      case 'ctx': return ctx(x);
      case 'toggle-folder': if (isId(x.id)) browser.toggleFolder(x.id); return;
      case 'space': if (isId(x.id)) browser.switchSpace(x.id); return;
      case 'space-move': if (isId(x.id) && Number.isInteger(x.index) && (x.index as number) >= 0 && (x.index as number) < 100) browser.moveSpace(x.id, x.index as number); return;
      case 'move':
        if (isId(x.id) && (x.target === null || isId(x.target)) && (x.where === 'before' || x.where === 'after' || x.where === 'inside')) browser.move(x.id, x.target, x.where);
        return;
      case 'layout': {
        const rect = (v: unknown) => {
          const o = v as Record<string, unknown> | null;
          return o && num(o.x) && num(o.y) && num(o.width) && num(o.height)
            ? { x: Math.round(o.x as number), y: Math.round(o.y as number), width: Math.round(o.width as number), height: Math.round(o.height as number) } : null;
        };
        const page = rect(x.page), media = rect(x.media);
        if (page && media) browser.setBounds(page, media);
        return;
      }
      case 'panel': if (typeof x.on === 'boolean') browser.setPanel(x.on); return;
      case 'act': case 'spot': case 'more': case 'type': {
        const tab = browser.active();
        const wc = tab && browser.webContentsOf(tab.id);
        const r = x.r;
        if (!wc || (x.t !== 'more' && !(Number.isInteger(r) && (r as number) >= (x.t === 'spot' ? 0 : 1)))) return;
        if (x.t === 'more') return void isolated(wc, '__phos.more()').catch(() => {});
        if (x.t === 'spot') return void isolated(wc, `__phos.spot(${r})`).catch(() => {});
        if (x.t === 'act') {
          // userGesture = true : le clic compte comme un vrai geste (ouverture de lien, lecture vidéo…).
          return void isolated(wc, `__phos.act(${r})`, true).then(res => {
            if (res === 'input' || res === 'password') send('input', { r, password: res === 'password' });
            else if (res === 'gone') msg('ÉLÉMENT DISPARU : LA PAGE A CHANGÉ');
          }, () => {});
        }
        // Saisie : le texte est tapé dans le vrai champ du site, comme au clavier.
        if (typeof x.text !== 'string' || x.text.length > 10000) return;
        const text = x.text;
        return void isolated(wc, `__phos.focus(${r})`).then(async ok => {
          if (!ok) return msg('CHAMP INTROUVABLE');
          await wc.insertText(text);
          if (x.submit === true) for (const type of ['keyDown', 'char', 'keyUp'] as const) wc.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Return' });
        }, () => {});
      }
      case 'overlay': if (typeof x.on === 'boolean') browser.setOverlay(x.on); return;
      case 'internal': if (typeof x.on === 'boolean') { browser.internal = x.on; browser.show(); } return;
      case 'focus-page': return browser.focusPage();
      case 'store-detail': {
        // Fiche d'une extension (clic dans le menu Store) : description, utilisateurs, version.
        const id = typeof x.id === 'string' && /^[a-p]{32}$/.test(x.id) ? x.id : null;
        if (!id) return;
        cws('https://chromewebstore.google.com/detail/' + id).then(html => send('store-detail', parseDetail(id, html)), e => send('store-detail', { id, error: (e as Error).message }));
        return;
      }
      case 'suggest': {
        // Propositions de recherche (réglage « suggestions », désactivable), du moteur choisi. Session en mémoire : aucun cookie envoyé.
        const q = x.q;
        if (!settings.suggest || typeof q !== 'string' || !q.trim() || q.length > 200) return;
        // DuckDuckGo (/ac/ ?type=list) et Google partagent le format [texte, [propositions]].
        const ddg = settings.search === 'duckduckgo';
        const url = ddg ? `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list` : `https://suggestqueries.google.com/complete/search?client=firefox&hl=fr&q=${encodeURIComponent(q)}`;
        suggestSession.fetch(url, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .then((j: unknown) => {
            const raw = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
            const list = raw.filter((v): v is string => typeof v === 'string').slice(0, 6).map(v => v.slice(0, 200));
            send('suggest', { q, list });
          }, () => {});
        return;
      }
      case 'confirm':
        if (x.what === 'space-delete' && isId(x.id) && x.yes === true) {
          const partition = browser.deleteSpace(x.id);
          if (!partition) return msg('IMPOSSIBLE : IL FAUT GARDER AU MOINS UN SPACE');
          if (!settings.sharedCookies) session.fromPartition(partition).clearStorageData().catch(() => msg('COOKIES DU SPACE NON EFFACÉS'));
        }
        return;
      case 'win':
        if (x.op === 'min') win.minimize();
        else if (x.op === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (x.op === 'close') win.close();
        return;
    }
  });
});

app.on('window-all-closed', () => app.quit());
