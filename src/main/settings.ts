import type { ColorName, NewPagePart, Part, Settings, TextKey, Widget } from '../shared/types.js';

// Mêmes listes que WIDGETS, NEWPAGE, COLORS et DEFAULT_PROMPT (shared/types.ts) ; recopiées car ce fichier ne charge que des types (vérifié par les tests).
export const WIDGET_IDS: Widget[] = ['history', 'settings', 'help', 'perf', 'eco', 'closed', 'new', 'clock', 'ext', 'guide', 'bm'];
export const NEWPAGE_IDS: NewPagePart[] = ['clock', 'date', 'shortcuts', 'recent', 'hint'];
export const COLOR_IDS: ColorName[] = ['bg', 'fg', 'strong', 'accent', 'yellow', 'green', 'red', 'cyan', 'gray', 'sel', 'side', 'tabbar', 'clock', 'private',
  'space1', 'space2', 'space3', 'space4', 'space5', 'space6'];
const PROMPT = 'PS C:\\Users\\{user}\\{space}> ';
// Même liste que TAB_KEYS (shared/types.ts), vérifiée par les tests.
// Mêmes listes que MORE_KEYS et PERMS (shared/types.ts), vérifiées par les tests.
export const MORE_KEY_IDS = ['zoom', 'download-dir', 'download-ask', 'proxy', 'home', 'clear-history-on-exit'];
export const PERM_ID_LIST = ['camera', 'microphone', 'notifications', 'geolocation', 'clipboard', 'storage', 'midi'];
const PROXY = /^((https?|socks[45]|socks5h):\/\/)?[a-z0-9.-]{1,253}:\d{1,5}$/i;
const WIN_DIR = /^[a-zA-Z]:\\[^<>:"|?*\n\r]{0,240}$/;
/** Adresse http(s) d'au plus 2048 caractères, ou null. */
const webUrl = (u: string) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && u.length <= 2048 ? x.href : null; } catch { return null; } };
// Même liste que SOUND_KEYS (shared/types.ts), vérifiée par les tests.
export const SOUND_KEY_IDS = ['sound', 'sound-volume'];
export const TAB_KEY_IDS = ['unload-delay', 'idle-sleep', 'eco-sleep', 'sleep-pinned', 'sleep-never', 'sleep-mark', 'close-idle', 'dedupe-on-open', 'autoplay-mute', 'restore'];
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** Domaine nettoyé (https://www.youtube.com/x → youtube.com) ou null. */
export function cleanDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return DOMAIN.test(d) && d.length <= 253 ? d : null;
}
export const PART_IDS: Part[] = ['tabbar', 'chip', 'newbtn', 'menu', 'badge', 'winbtns', 'addr', 'status', 'hint', 'prompt', 'tree', 'counts', 'flags', 'empty'];
export const TEXT_IDS: TextKey[] = ['brand', 'closed', 'history', 'settings', 'help', 'perf', 'new', 'eco', 'empty', 'newtab-title', 'placeholder', 'hint', 'newpage-hint', 'open-verb', 'ext', 'guide', 'bm', 'private-badge', 'boot-title'];
// Variable CSS libre : nom simple, valeur sans rien qui puisse sortir de la déclaration ni charger une ressource.
const CSS_VAR = /^--[a-z0-9-]{1,40}$/;
const CSS_VAL = /^[^;{}<>\\]{1,200}$/;
const cssOk = (v: string) => CSS_VAL.test(v) && !/url\s*\(|expression|@import|\/\*/i.test(v);

const SEALS = ['ORION', 'VEGA', 'LYRA', 'ALTAIR', 'RIGEL', 'DENEB', 'CASTOR', 'SIRIUS'];

export function defaults(): Settings {
  return {
    theme: 'white', size: 'M', reduceMotion: false, boot: true,
    seal: SEALS[Math.floor(Math.random() * SEALS.length)], profile: 'invite', search: 'duckduckgo', suggest: true,
    images: 'tint', eco: false, sidebar: ['closed'], sideHidden: false,
    textHosts: [], extensions: [], extOff: [], mods: [], sharedCookies: false,
    lang: 'fr', sideWidth: 180, closedMax: 3, newpage: [...NEWPAGE_IDS], unloadSpaces: true, newTabEnd: true,
    shortcuts: ['https://www.youtube.com/', 'https://www.twitch.tv/'], aliases: {}, binds: {}, colors: {}, font: '', prompt: PROMPT,
    css: {}, texts: {}, hidden: [], sideRight: false,
    // Valeurs par défaut = comportement d'avant ces réglages (veille auto à 30 min, 5 en éco, épinglés compris).
    unloadDelay: 0, idleSleep: 30, ecoSleep: 5, sleepPinned: true, sleepNever: [], sleepMark: true, closeIdle: 0,
    dedupeOnOpen: false, autoplayMute: false, restore: 'last',
    sound: true, soundVolume: 40,
    zoom: 100, downloadDir: '', downloadAsk: true, proxy: '', home: '', clearHistoryOnExit: false, updateCheck: true, httpsOnly: true, httpsAllow: [], privacy: 'normal', safeBrowsing: true, blockAds: false, blockAllow: [], bookmarks: [], permissions: {},
  };
}

// Réglages en anglais : true / false (on/off et oui/non restent acceptés).
const YES = ['true', 'on', 'yes', '1', 'oui', 'o'];
const NO = ['false', 'off', 'no', '0', 'non', 'n'];
const bool = (v: string) => YES.includes(v) ? true : NO.includes(v) ? false : undefined;
const NAME = /^[A-ZÀ-Ý0-9-]{2,12}$/;
const int = (v: string, min: number, max: number) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Valide `set <clé> <valeur>`. Renvoie le réglage modifié ou un message d'erreur. */
export function applySetting(s: Settings, key: string, raw: string): Settings | string {
  const v = raw.trim().toLowerCase();
  const flag = (k: keyof Settings, usage: string, invert = false) => { const b = bool(v); return b === undefined ? usage : { ...s, [k]: invert ? !b : b }; };
  switch (key) {
    case 'theme': case 'thème': {
      const t = ({ ambre: 'amber', amber: 'amber', vert: 'green', green: 'green', blanc: 'white', white: 'white' } as const)[v as 'ambre'];
      return t ? { ...s, theme: t } : 'set theme white|green|amber';
    }
    case 'boot': case 'demarrage': return flag('boot', 'set boot true|false');
    case 'animations': return flag('reduceMotion', 'set animations true|false', true);
    case 'size': case 'taille': {
      const t = v.toUpperCase();
      return t === 'S' || t === 'M' || t === 'L' || t === 'XL' ? { ...s, size: t } : 'set size s|m|l|xl';
    }
    case 'search': case 'recherche':
      return v === 'duckduckgo' || v === 'google' || v === 'bing' || v === 'brave' ? { ...s, search: v } : 'set search google|duckduckgo|bing|brave';
    case 'suggestions': case 'suggest': return flag('suggest', 'set suggestions true|false');
    case 'eco': {
      const b = v === 'toggle' ? !s.eco : bool(v);
      return b === undefined ? 'set eco true|false' : { ...s, eco: b };
    }
    case 'spaces': return flag('sharedCookies', 'set spaces true|false (cookies communs à tous les Spaces)');
    case 'images': {
      const t = ({ teinte: 'tint', tint: 'tint', masquer: 'hide', hide: 'hide', normal: 'normal', origine: 'normal' } as const)[v as 'tint'];
      return t ? { ...s, images: t } : 'set images tint|hide|normal';
    }
    case 'seal': case 'sceau': {
      const t = raw.trim().toUpperCase();
      return NAME.test(t) ? { ...s, seal: t } : 'set seal <2-12 letters or digits>';
    }
    case 'profile': case 'profil': {
      const t = raw.trim(); // nom d'utilisateur affiché dans l'invite : la casse est gardée (ex. virrrr)
      return /^[A-Za-zÀ-ÿ0-9_-]{2,20}$/.test(t) ? { ...s, profile: t } : 'set profile <2-20 letters, digits, - or _>';
    }
    case 'lang': case 'langue': {
      const t = raw.trim();
      return /^[a-z]{2}(-[A-Z]{2})?$/.test(t) ? { ...s, lang: t } : 'set lang fr|en|es|de|it… (ou en-US)';
    }
    case 'sidebar-width': case 'sidebar-largeur': {
      const n = int(v, 110, 480);
      return n === undefined ? 'set sidebar-width <110-480>' : { ...s, sideWidth: n };
    }
    case 'closed-max': case 'fermes': {
      const n = int(v, 0, 25);
      return n === undefined ? 'set closed-max <0-25>' : { ...s, closedMax: n };
    }
    case 'newpage': case 'nouvelle-page': {
      if (v === 'default' || v === 'defaut') return { ...s, newpage: [...NEWPAGE_IDS] };
      if (v === 'none' || v === 'vide') return { ...s, newpage: [] };
      const parts = v.split(/[\s,]+/).filter(Boolean);
      return parts.length && parts.every(p => NEWPAGE_IDS.includes(p as NewPagePart))
        ? { ...s, newpage: [...new Set(parts as NewPagePart[])] } : `set newpage ${NEWPAGE_IDS.join(',')} · set newpage none · set newpage default`;
    }
    case 'unload-spaces': return flag('unloadSpaces', 'set unload-spaces true|false (veille des autres Spaces)');
    case 'newtab': return v === 'end' || v === 'fin' ? { ...s, newTabEnd: true } : v === 'next' || v === 'suivant' ? { ...s, newTabEnd: false } : 'set newtab end|next';
    case 'color': case 'couleur': {
      const [name, val = ''] = v.split(/\s+/);
      // « spaces » : les six couleurs de Space d'un coup.
      const names = name === 'spaces' ? COLOR_IDS.filter(c => c.startsWith('space')) : [name as ColorName];
      if (!names.every(n => COLOR_IDS.includes(n))) return `set color <${COLOR_IDS.join('|')}|spaces> <#rrggbb|default>`;
      const colors = { ...s.colors };
      for (const n of names) {
        if (val === 'default' || val === 'defaut') delete colors[n];
        else if (HEX.test(val)) colors[n] = val;
        else return `set color ${name} #rrggbb (ou default)`;
      }
      return { ...s, colors };
    }
    case 'css': {
      // set css --nom valeur : n'importe quelle variable CSS de l'interface (voir src/ui/style.css)
      const m = /^(\S+)\s+(.+)$/.exec(raw.trim());
      if (!m || !CSS_VAR.test(m[1])) return 'set css --<variable> <valeur> · set css --<variable> default (ex. set css --bg-2 #202020)';
      // Largeur de la barre : un seul réglage (sinon la poignée ne ferait plus rien).
      if (m[1] === '--side-w') return 'largeur de la barre latérale : set sidebar-width <110-480> (ou tirer son bord)';
      const css = { ...s.css };
      if (m[2].trim().toLowerCase() === 'default') delete css[m[1]];
      else if (cssOk(m[2].trim())) css[m[1]] = m[2].trim();
      else return 'set css : valeur refusée (pas de ; { } < > url())';
      return Object.keys(css).length > 200 ? 'set css : 200 variables au plus' : { ...s, css };
    }
    case 'text': case 'texte': {
      const m = /^(\S+)\s+(.+)$/.exec(raw.trim());
      if (!m || !TEXT_IDS.includes(m[1] as TextKey)) return `set text <${TEXT_IDS.join('|')}> <texte|default>`;
      const texts = { ...s.texts };
      const val = m[2].replace(/^["']|["']$/g, '');
      if (val.toLowerCase() === 'default') delete texts[m[1] as TextKey];
      else if (val.length <= 200 && !/[\n\r]/.test(val)) texts[m[1] as TextKey] = val;
      else return 'set text : 200 caractères au plus, une ligne';
      return { ...s, texts };
    }
    case 'unload-delay': { const n = int(v, 0, 120); return n === undefined ? 'set unload-delay <0-120> (minutes, 0 = tout de suite)' : { ...s, unloadDelay: n }; }
    case 'idle-sleep': { const n = int(v, 0, 1440); return n === undefined ? 'set idle-sleep <0-1440> (minutes, 0 = jamais)' : { ...s, idleSleep: n }; }
    case 'eco-sleep': { const n = int(v, 1, 1440); return n === undefined ? 'set eco-sleep <1-1440> (minutes, en mode éco)' : { ...s, ecoSleep: n }; }
    case 'close-idle': { const n = int(v, 0, 10080); return n === undefined ? 'set close-idle <0-10080> (minutes, 0 = jamais)' : { ...s, closeIdle: n }; }
    case 'sleep-pinned': return flag('sleepPinned', 'set sleep-pinned true|false');
    case 'sleep-mark': return flag('sleepMark', 'set sleep-mark true|false');
    case 'dedupe-on-open': return flag('dedupeOnOpen', 'set dedupe-on-open true|false');
    case 'autoplay-mute': return flag('autoplayMute', 'set autoplay-mute true|false');
    case 'zoom': { const n = int(v.replace('%', ''), 25, 500); return n === undefined ? 'set zoom <25-500> (zoom par défaut des pages, en %)' : { ...s, zoom: n }; }
    case 'download-ask': return flag('downloadAsk', 'set download-ask true|false (demander où enregistrer)');
    case 'clear-history-on-exit': return flag('clearHistoryOnExit', 'set clear-history-on-exit true|false');
    case 'update-check': return flag('updateCheck', 'set update-check true|false (prévenir si Chromium a du retard)');
    case 'https-only': return flag('httpsOnly', 'set https-only true|false (forcer https ; https-allow <site> pour une exception)');
    case 'privacy': case 'confidentialite':
      return v === 'strict' ? { ...s, privacy: 'strict' } : v === 'normal' ? { ...s, privacy: 'normal' } : 'set privacy strict|normal (strict : moins de traçabilité ; ce n\'est PAS Tor)';
    case 'safebrowsing': return flag('safeBrowsing', 'set safebrowsing true|false (avertir avant un site d\'hameçonnage)');
    case 'blocklist': return flag('blockAds', 'set blocklist true|false (bloquer pubs et traqueurs ; blocklist allow <site> pour une exception)');
    case 'download-dir': {
      const t = raw.trim().replace(/^["']|["']$/g, '');
      if (t.toLowerCase() === 'default') return { ...s, downloadDir: '' };
      return WIN_DIR.test(t) && !t.includes('..') ? { ...s, downloadDir: t } : 'set download-dir C:\\dossier\\complet · set download-dir default';
    }
    case 'proxy': {
      if (v === 'none' || v === 'off' || v === 'aucun') return { ...s, proxy: '' };
      return PROXY.test(raw.trim()) ? { ...s, proxy: raw.trim() } : 'set proxy hôte:port · set proxy socks5://hôte:port · set proxy none';
    }
    case 'home': case 'accueil': {
      if (v === 'none' || v === 'default') return { ...s, home: '' };
      const t = raw.trim();
      // Une adresse http(s) ou un nom de site ; tout autre protocole (file:, javascript:…) est refusé.
      const u = /^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t) ? null : webUrl(/^https?:\/\//i.test(t) ? t : 'https://' + t);
      return u ? { ...s, home: u } : 'set home <adresse> · set home none (nouvelle page)';
    }
    case 'sound': case 'son': return flag('sound', 'set sound true|false (sons de l\'interface)');
    case 'sound-volume': { const n = int(v, 0, 100); return n === undefined ? 'set sound-volume <0-100>' : { ...s, soundVolume: n }; }
    case 'restore': return v === 'last' || v === 'home' || v === 'none' ? { ...s, restore: v } : 'set restore last|home|none';
    case 'sleep-never': {
      if (v === 'none' || v === 'aucun') return { ...s, sleepNever: [] };
      const list = v.split(/[\s,]+/).filter(Boolean).map(cleanDomain);
      return list.length && list.length <= 200 && list.every(Boolean) ? { ...s, sleepNever: [...new Set(list as string[])] } : 'set sleep-never <site,site> (ex. discord.com,deezer.com) · set sleep-never none';
    }
    case 'sidebar-side': return v === 'right' || v === 'droite' ? { ...s, sideRight: true } : v === 'left' || v === 'gauche' ? { ...s, sideRight: false } : 'set sidebar-side left|right';
    case 'font': case 'police': {
      const t = raw.trim().replace(/^["']|["']$/g, '');
      if (t.toLowerCase() === 'default') return { ...s, font: '' };
      return /^[A-Za-z0-9 _-]{1,60}$/.test(t) ? { ...s, font: t } : 'set font <nom de police> · set font default';
    }
    case 'prompt': case 'invite': {
      const t = raw.replace(/^["']|["']$/g, '');
      if (t.trim().toLowerCase() === 'default') return { ...s, prompt: PROMPT };
      return t.length <= 60 && !/[\n\r]/.test(t) ? { ...s, prompt: t.endsWith(' ') ? t : t + ' ' } : 'set prompt "<texte, {user} {space}>" · set prompt default';
    }
  }
  return 'set : zoom download-dir download-ask proxy home clear-history-on-exit sound sound-volume unload-delay idle-sleep eco-sleep sleep-pinned sleep-never sleep-mark close-idle dedupe-on-open autoplay-mute restore · theme size animations boot search suggestions eco spaces images seal profile lang sidebar-width sidebar-side closed-max newpage unload-spaces newtab color css text font prompt';
}

const WORD = /^[a-z0-9_-]{1,30}$/;
const KEY = /^((ctrl|alt|shift)\+){0,3}([a-z0-9]|f\d{1,2}|arrow(up|down|left|right)|home|end|pageup|pagedown|insert|delete|escape|enter|space)$/;
/** Combinaison de touches normalisée (ctrl+alt+shift+touche) ou null si invalide. */
export function normKey(raw: string): string | null {
  const parts = raw.toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
  const mods = ['ctrl', 'alt', 'shift'].filter(m => parts.includes(m));
  const key = parts.filter(p => !mods.includes(p));
  const k = key.length === 1 ? [...mods, key[0]].join('+') : '';
  // Sans Ctrl ni Alt, une touche seule casserait la frappe : seules F1-F24 sont acceptées.
  if (!mods.includes('ctrl') && !mods.includes('alt') && !/^f\d{1,2}$/.test(key[0] ?? '')) return null;
  return KEY.test(k) ? k : null;
}

/** Nettoie un fichier settings.json lu sur le disque. */
export function sanitize(raw: unknown): Settings {
  const s = defaults();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  let out = s;
  const str = (k: string) => typeof r[k] === 'string' ? r[k] as string : undefined;
  const pairs: [string, string | undefined][] = [['theme', str('theme')], ['size', str('size')], ['search', str('search')], ['seal', str('seal')], ['profile', str('profile')],
    ['images', str('images')], ['lang', str('lang')], ['font', str('font') || undefined], ['prompt', str('prompt')],
    ['sidebar-width', r.sideWidth === undefined ? undefined : String(r.sideWidth)], ['closed-max', r.closedMax === undefined ? undefined : String(r.closedMax)],
    ['newpage', Array.isArray(r.newpage) ? (r.newpage.length ? r.newpage.join(',') : 'none') : undefined],
    ['restore', str('restore')], ['privacy', str('privacy')], ['download-dir', str('downloadDir') || undefined], ['proxy', str('proxy') || undefined], ['home', str('home') || undefined], ['sleep-never', Array.isArray(r.sleepNever) ? (r.sleepNever.length ? r.sleepNever.filter(x => typeof x === 'string').join(',') : 'none') : undefined],
    ...(['unloadDelay', 'idleSleep', 'ecoSleep', 'closeIdle', 'soundVolume', 'zoom'] as const).map(k => [k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), typeof r[k] === 'number' ? String(r[k]) : undefined] as [string, string | undefined])];
  for (const [k, v] of pairs) if (v !== undefined) { const n = applySetting(out, k, v); if (typeof n !== 'string') out = n; }
  const hosts = (v: unknown) => Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && /^[a-z0-9.-]{1,253}$/.test(h)).slice(0, 1000) : undefined;
  out.textHosts = hosts(r.textHosts) ?? out.textHosts;
  // Dossiers d'extensions choisis par l'utilisateur (chemins absolus) et mods CSS activés (noms simples).
  if (Array.isArray(r.extensions)) out.extensions = r.extensions.filter((p): p is string => typeof p === 'string' && p.length < 1000 && /^[a-zA-Z]:\\/.test(p)).slice(0, 50);
  if (Array.isArray(r.extOff)) out.extOff = r.extOff.filter((p): p is string => typeof p === 'string' && out.extensions.includes(p));
  if (Array.isArray(r.mods)) out.mods = r.mods.filter((m): m is string => typeof m === 'string' && /^[a-z0-9_-]{1,40}$/.test(m)).slice(0, 100);
  if (Array.isArray(r.sidebar)) out.sidebar = [...new Set(r.sidebar.filter((w): w is Widget => typeof w === 'string' && WIDGET_IDS.includes(w as Widget)))];
  // Favoris : nom court + adresse http(s) ; droits par site : seulement ceux de la liste PERMS.
  if (Array.isArray(r.bookmarks)) out.bookmarks = r.bookmarks.flatMap(b => {
    const o = b as { name?: unknown; url?: unknown };
    const url = typeof o?.url === 'string' ? webUrl(o.url) : null;
    return url ? [{ name: typeof o.name === 'string' ? o.name.slice(0, 80) : '', url }] : [];
  }).slice(0, 1000);
  if (r.permissions && typeof r.permissions === 'object') for (const [site, list] of Object.entries(r.permissions)) {
    const d = cleanDomain(site);
    const ok = Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string' && PERM_ID_LIST.includes(p)) : [];
    if (d && ok.length) out.permissions[d] = [...new Set(ok)];
  }
  if (Array.isArray(r.shortcuts)) out.shortcuts = r.shortcuts.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u) && u.length <= 2048).slice(0, 9);
  const dict = (v: unknown, key: (k: string) => string | null) => {
    const o: Record<string, string> = {};
    if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) { const n = key(k); if (n && typeof c === 'string' && c.length <= 500) o[n] = c; }
    return Object.fromEntries(Object.entries(o).slice(0, 200));
  };
  out.aliases = dict(r.aliases, k => WORD.test(k) ? k : null);
  out.binds = dict(r.binds, normKey);
  for (const [key, field] of [['color', r.colors], ['css', r.css], ['text', r.texts]] as const) {
    if (field && typeof field === 'object') for (const [k, c] of Object.entries(field)) {
      if (typeof c !== 'string') continue;
      const n = applySetting(out, key, `${k} ${c}`);
      if (typeof n !== 'string') out = n;
    }
  }
  if (Array.isArray(r.hidden)) out.hidden = [...new Set(r.hidden.filter((p): p is Part => typeof p === 'string' && PART_IDS.includes(p as Part)))];
  const domains = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(x => typeof x === 'string' ? cleanDomain(x) : null).filter((x): x is string => !!x))].slice(0, 500) : undefined;
  out.httpsAllow = domains(r.httpsAllow) ?? out.httpsAllow;
  out.blockAllow = domains(r.blockAllow) ?? out.blockAllow;
  for (const k of ['boot', 'reduceMotion', 'suggest', 'eco', 'sideHidden', 'sharedCookies', 'unloadSpaces', 'newTabEnd', 'sideRight', 'sleepPinned', 'sleepMark', 'dedupeOnOpen', 'autoplayMute', 'sound', 'downloadAsk', 'clearHistoryOnExit', 'updateCheck', 'httpsOnly', 'safeBrowsing', 'blockAds'] as const) if (typeof r[k] === 'boolean') out = { ...out, [k]: r[k] };
  return out;
}

export const isAliasName = (n: string) => WORD.test(n);

/** Réglages → fichier de commandes (settings export) : « source » de ce fichier redonne la même configuration. */
export function toCommands(s: Settings): string[] {
  const q = (t: string) => `"${t}"`;
  const out = ['# Configuration Phosphore : source <ce fichier> pour la réappliquer. Une commande par ligne, # = commentaire.',
    `set theme ${s.theme}`, `set size ${s.size.toLowerCase()}`, `set animations ${!s.reduceMotion}`, `set boot ${s.boot}`, `set search ${s.search}`,
    `set suggestions ${s.suggest}`, `set eco ${s.eco}`, `set spaces ${s.sharedCookies}`, `set images ${s.images}`, `set seal ${s.seal}`, `set profile ${s.profile}`,
    `set lang ${s.lang}`, `set sidebar-width ${s.sideWidth}`, `set sidebar-side ${s.sideRight ? 'right' : 'left'}`, `set closed-max ${s.closedMax}`,
    `set newpage ${s.newpage.join(',') || 'none'}`, `set unload-spaces ${s.unloadSpaces}`, `set newtab ${s.newTabEnd ? 'end' : 'next'}`,
    `set font ${s.font ? q(s.font) : 'default'}`, `set prompt ${q(s.prompt)}`,
    `set unload-delay ${s.unloadDelay}`, `set idle-sleep ${s.idleSleep}`, `set eco-sleep ${s.ecoSleep}`, `set sleep-pinned ${s.sleepPinned}`,
    `set sleep-never ${s.sleepNever.join(',') || 'none'}`, `set sleep-mark ${s.sleepMark}`, `set close-idle ${s.closeIdle}`,
    `set dedupe-on-open ${s.dedupeOnOpen}`, `set autoplay-mute ${s.autoplayMute}`, `set restore ${s.restore}`, `set sound ${s.sound}`, `set sound-volume ${s.soundVolume}`,
    `set zoom ${s.zoom}`, `set download-dir ${s.downloadDir ? q(s.downloadDir) : 'default'}`, `set download-ask ${s.downloadAsk}`,
    `set proxy ${s.proxy || 'none'}`, `set home ${s.home || 'none'}`, `set clear-history-on-exit ${s.clearHistoryOnExit}`, `set update-check ${s.updateCheck}`, `set https-only ${s.httpsOnly}`, `set privacy ${s.privacy}`, `set safebrowsing ${s.safeBrowsing}`, `set blocklist ${s.blockAds}`,
    ...s.httpsAllow.map(d => `https-allow add ${d}`),
    ...s.blockAllow.map(d => `blocklist allow ${d}`),
    ...s.bookmarks.map(b => `bm add ${b.url}${b.name ? ' ' + b.name : ''}`),
    ...Object.entries(s.permissions).flatMap(([site, l]) => l.map(p => `perm allow ${site} ${p}`)),
    ...Object.entries(s.colors).map(([k, v]) => `set color ${k} ${v}`),
    ...Object.entries(s.css).map(([k, v]) => `set css ${k} ${v}`),
    ...Object.entries(s.texts).map(([k, v]) => `set text ${k} ${q(v)}`),
    ...s.hidden.map(p => `ui hide ${p}`),
    `sidebar order ${s.sidebar.join(',') || 'none'}`, `sidebar ${s.sideHidden ? 'off' : 'on'}`,
    ...s.shortcuts.map(u => `shortcut add ${u}`),
    ...Object.entries(s.aliases).map(([k, v]) => `alias ${k} ${v}`),
    ...Object.entries(s.binds).map(([k, v]) => `bind ${k} ${v}`),
    ...s.mods.map(m => `mod on ${m}`)];
  // Extensions : seulement en commentaire (dossiers propres à ce PC ; ext store <id> pour les réinstaller ailleurs).
  out.push(...s.extensions.map(d => `# extension : ${d}${s.extOff.includes(d) ? ' (désactivée)' : ''}`));
  return out;
}

/** Droits Electron demandés → nos noms (perm allow <site> <nom>). « media » : caméra et/ou micro selon la demande. */
export function permNames(permission: string, mediaTypes: string[] = []): string[] {
  if (permission === 'media') return mediaTypes.length ? mediaTypes.map(t => t === 'video' ? 'camera' : 'microphone') : ['camera', 'microphone'];
  if (permission === 'clipboard-read' || permission === 'clipboard-sanitized-write') return ['clipboard'];
  if (permission === 'storage-access' || permission === 'top-level-storage-access' || permission === 'persistent-storage') return ['storage'];
  if (permission === 'midi' || permission === 'midiSysex') return ['midi'];
  if (permission === 'notifications' || permission === 'geolocation') return [permission];
  return [];
}
