// Complétion de l'invite, comme les commandes de Minecraft : après « ext rm », les extensions qu'on peut retirer ;
// après « set theme », les thèmes possibles. Et recherche par mots-clés : « sidebar width » trouve « set sidebar-width ».
// Pur (aucun accès Electron ni DOM) : testé dans tests/complete.test.ts.

/** Réglages de « set » : description et valeurs proposées (exemples pour les nombres et les textes libres). */
export const SET_KEYS: [string, string, string[]][] = [
  ['theme', 'color theme', ['white', 'green', 'amber']],
  ['size', 'text size', ['s', 'm', 'l', 'xl']],
  ['animations', 'interface animations', ['true', 'false']],
  ['boot', 'startup screen', ['true', 'false']],
  ['search', 'search engine', ['duckduckgo', 'google', 'bing', 'brave']],
  ['suggestions', 'search suggestions while typing', ['true', 'false']],
  ['eco', 'eco mode (less memory)', ['true', 'false']],
  ['spaces', 'cookies shared by every Space', ['true', 'false']],
  ['images', 'images in text mode', ['tint', 'hide', 'normal']],
  ['seal', 'seal of browser prompts', ['VEGA', 'ORION', 'LYRA']],
  ['profile', 'user name in the prompt', []],
  ['lang', 'language for sites and dates', ['fr', 'en', 'es', 'de', 'it']],
  ['sidebar-width', 'sidebar width (px)', ['140', '180', '220', '260']],
  ['sidebar-side', 'sidebar on the left or right', ['left', 'right']],
  ['closed-max', 'number of pages in "closed"', ['0', '3', '5', '10']],
  ['newpage', 'blocks of the new page', ['default', 'none', 'clock', 'clock,date', 'clock,shortcuts']],
  ['unload-spaces', 'sleep the other Spaces\' pages', ['true', 'false']],
  ['newtab', 'where new pages go', ['end', 'next']],
  ['color', 'interface color (background, accent, clock, Spaces…)', []],
  ['css', 'interface CSS variable', ['--bg-2', '--line', '--line-strong']],
  ['text', 'interface text', []],
  ['font', 'interface font', ['default', '"JetBrains Mono"', 'Consolas']],
  ['prompt', 'prompt text ({user} {space})', ['default', '"{user}@{space} $"']],
  ['unload-delay', 'minutes before other Spaces\' pages sleep', ['0', '1', '3', '5', '10']],
  ['idle-sleep', 'sleep pages not seen for N minutes', ['0', '15', '30', '60']],
  ['eco-sleep', 'eco-mode sleep after N minutes', ['3', '5', '10']],
  ['sleep-pinned', 'pinned pages can sleep too', ['true', 'false']],
  ['sleep-never', 'sites never put to sleep', ['none']],
  ['sleep-mark', 'sleeping pages dimmed "zz"', ['true', 'false']],
  ['close-idle', 'close inactive Spaces\' pages after N minutes', ['0', '60', '240', '1440']],
  ['dedupe-on-open', 'address already open: go to that page', ['true', 'false']],
  ['autoplay-mute', 'mute background pages', ['true', 'false']],
  ['restore', 'what opens at startup', ['last', 'home', 'none']],
  ['sound', 'interface sounds (sound mod)', ['true', 'false']],
  ['sound-volume', 'sound volume (0-100)', ['20', '40', '60', '80', '100']],
  ['zoom', 'default zoom of every page (%)', ['90', '100', '110', '125', '150']],
  ['download-dir', 'downloads folder (full path)', ['default']],
  ['download-ask', 'ask where to save each download', ['true', 'false']],
  ['proxy', 'proxy for every page', ['none']],
  ['home', 'home page (home command, restore home)', ['none']],
  ['clear-history-on-exit', 'clear the history when Phosphore closes', ['true', 'false']],
  ['update-check', 'warn at startup if Chromium is out of date', ['true', 'false']],
  ['https-only', 'force https (http pages retried in https)', ['true', 'false']],
  ['privacy', 'less tracking (referrer, WebRTC) — not Tor', ['normal', 'strict']],
  ['safebrowsing', 'warn before phishing / malware sites', ['true', 'false']],
  ['blocklist', 'block ads and trackers', ['true', 'false']],
];

/** Descriptions françaises des réglages : affichage en anglais, mais la recherche comprend aussi le français. */
export const SET_KEYS_FR: Record<string, string> = {
  "theme": "thème de couleurs",
  "size": "taille du texte",
  "animations": "animations de l\\'interface",
  "boot": "écran de démarrage",
  "search": "moteur de recherche",
  "suggestions": "propositions de recherche pendant la frappe",
  "eco": "mode économie (moins de mémoire)",
  "spaces": "cookies communs à tous les Spaces",
  "images": "images en mode texte",
  "seal": "sceau des demandes du navigateur",
  "profile": "nom d\\'utilisateur dans l\\'invite",
  "lang": "langue des sites et des dates",
  "sidebar-width": "largeur de la barre latérale (px)",
  "sidebar-side": "barre latérale à gauche ou à droite",
  "closed-max": "nombre de pages dans « fermés »",
  "newpage": "blocs de la nouvelle page",
  "unload-spaces": "veille des pages des autres Spaces",
  "newtab": "place des nouvelles pages",
  "color": "couleur de l\\'interface (fond, accent, horloge, Spaces…)",
  "css": "variable CSS de l\\'interface",
  "text": "texte de l\\'interface",
  "font": "police de l\\'interface",
  "prompt": "texte de l\\'invite ({user} {space})",
  "unload-delay": "minutes avant la veille des autres Spaces",
  "idle-sleep": "veille des pages non vues depuis N minutes",
  "eco-sleep": "veille en mode éco après N minutes",
  "sleep-pinned": "pages épinglées mises en veille aussi",
  "sleep-never": "sites jamais mis en veille",
  "sleep-mark": "pages en veille grisées « zz »",
  "close-idle": "fermer les pages des Spaces inactifs après N minutes",
  "dedupe-on-open": "adresse déjà ouverte : aller sur cette page",
  "autoplay-mute": "couper le son des pages en arrière-plan",
  "restore": "ce qui s\\'ouvre au démarrage",
  "sound": "sons de l\\'interface (mod de sons)",
  "sound-volume": "volume des sons (0-100)",
  "zoom": "zoom par défaut des pages",
  "download-dir": "dossier des téléchargements",
  "download-ask": "demander où enregistrer les téléchargements",
  "proxy": "proxy des pages",
  "home": "page d'accueil",
  "clear-history-on-exit": "effacer l'historique en quittant",
  "update-check": "prévenir au démarrage si Chromium a du retard",
  "https-only": "forcer https (pages http réessayées en https)",
  "privacy": "moins de traçabilité (referrer, WebRTC) — pas Tor",
  "safebrowsing": "avertir avant les sites d'hameçonnage / malveillants",
  "blocklist": "bloquer pubs et traqueurs",
};

/** État utile à la complétion, fourni par l'interface. */
export interface Ctx {
  spaces: string[];                              // noms des Spaces
  tabs: string[];                                // titres des pages du Space actif, dans l'ordre de « ls »
  exts: { name: string; off: boolean }[];        // extensions, dans l'ordre de la page « ext »
  mods: { name: string; on: boolean }[];
  widgets: { id: string; desc: string; on: boolean }[];
  parts: { id: string; desc: string; hidden: boolean }[];
  aliases: string[]; binds: string[]; shortcuts: string[]; closed: string[]; sleepNever: string[];
  colors: string[]; texts: string[];
  bookmarks?: string[]; folders?: string[]; host?: string; // favoris, dossiers du Space, site affiché
  httpsAllow?: string[];                         // sites gardés en http (https-allow)
  blockAllow?: string[];                         // sites exclus du blocage (blocklist allow)
}

export type Choice = { value: string; desc: string; more?: boolean }; // more : d'autres paramètres suivent
export type Completion = { fill: string; label: string; desc: string; more: boolean };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (list: string[], desc = (t: string) => t) => list.map((t, k) => ({ value: String(k + 1), desc: desc(t) }));
const subs = (...l: [string, string, boolean?][]) => l.map(([value, desc, more]) => ({ value, desc, more }));

/** Paramètres possibles après les mots déjà tapés (args[0] = la commande). null : rien à proposer. */
export function choicesFor(args: string[], c: Ctx): Choice[] | null {
  const [cmd, a1, a2] = args;
  const n = args.length;
  const space = () => c.spaces.map(s => ({ value: s.toLowerCase(), desc: 'Space' }));
  switch (cmd) {
    case 'set': {
      if (n === 1) return SET_KEYS.map(([value, desc]) => ({ value, desc, more: true }));
      if (n === 2 && a1 === 'color') return [...c.colors, 'spaces'].map(value => ({ value, desc: value === 'spaces' ? 'all 6 Space colors' : 'color', more: true }));
      if (n === 3 && a1 === 'color') return subs(['#ffffff', 'white'], ['#000000', 'black'], ['#d77757', 'orange'], ['default', 'original color']);
      if (n === 2 && a1 === 'text') return c.texts.map(value => ({ value, desc: 'interface text', more: true }));
      const k = SET_KEYS.find(([key]) => key === a1);
      return n === 2 && k ? k[2].map(value => ({ value, desc: k[1] })) : null;
    }
    case 'ext': case 'extension': case 'extensions': {
      if (n === 1) return subs(['store', 'search and install', true], ['add', 'extension folder'], ['open', 'open its popup in a tab', true], ['rm', 'remove', true], ['off', 'disable', true], ['on', 're-enable', true], ['update', 'update', true]);
      if (n !== 2) return null;
      const list = c.exts.map((e, k) => ({ ...e, value: String(k + 1) }));
      const pick = a1 === 'on' ? list.filter(e => e.off) : a1 === 'off' ? list.filter(e => !e.off) : a1 === 'rm' || a1 === 'update' || a1 === 'open' ? list : null;
      return pick?.map(e => ({ value: e.value, desc: e.name + (e.off ? ' (disabled)' : '') })) ?? null;
    }
    case 'mod': case 'mods': {
      if (n === 1) return subs(['ls', 'list'], ['new', 'create', true], ['import', 'import a mod', true], ['on', 'enable', true], ['off', 'disable', true], ['edit', 'edit', true], ['rm', 'delete', true], ['reload', 'reapply'], ['folder', 'open the folder']);
      if (n !== 2) return null;
      const pick = a1 === 'on' ? c.mods.filter(m => !m.on) : a1 === 'off' ? c.mods.filter(m => m.on) : a1 === 'edit' || a1 === 'rm' ? c.mods : null;
      return pick?.map(m => ({ value: m.name, desc: m.on ? 'enabled' : 'disabled' })) ?? null;
    }
    case 'sidebar': case 'side': {
      if (n === 1) return subs(['add', 'add a button', true], ['rm', 'remove a button', true], ['move', 'move a button', true], ['order', 'full order', true], ['ls', 'list'], ['on', 'show'], ['off', 'hide']);
      if (n === 2) {
        const pick = a1 === 'add' ? c.widgets.filter(w => !w.on) : a1 === 'rm' || a1 === 'move' ? c.widgets.filter(w => w.on) : null;
        return pick?.map(w => ({ value: w.id, desc: w.desc, more: a1 === 'move' })) ?? null;
      }
      return n === 3 && a1 === 'move' ? c.widgets.filter(w => w.on).map((_, k) => ({ value: String(k + 1), desc: 'position ' + (k + 1) })) : null;
    }
    case 'ui': {
      if (n === 1) return subs(['hide', 'hide an element', true], ['show', 'show again', true], ['ls', 'list'], ['reset', 'show everything']);
      const pick = n === 2 ? (a1 === 'hide' ? c.parts.filter(p => !p.hidden) : a1 === 'show' ? c.parts.filter(p => p.hidden) : null) : null;
      return pick?.map(p => ({ value: p.id, desc: p.desc })) ?? null;
    }
    case 'cd': case 'rmspace': return n === 1 ? space() : null;
    case 'tab':
      if (n === 1) return subs(['move', 'move a page to a place', true], ['up', 'one place up'], ['down', 'one place down'], ['first', 'to the top'], ['last', 'to the bottom'], ['rename', 'your own name for the page', true], ['new', 'new page'], ['close', 'close the page'], ['next', 'next page'], ['prev', 'previous page']);
      if (n === 2 && a1 === 'move') return num(c.tabs).map(x => ({ ...x, more: true }));
      return n === 3 && a1 === 'move' ? c.tabs.map((_, k) => ({ value: String(k + 1), desc: 'place ' + (k + 1) })) : null;
    case 'wake': case 'pin': case 'unpin': return n === 1 ? num(c.tabs) : null;
    case 'r': case 'reload': return n === 1 ? subs(['all', 'reload every page of the Space']) : null;
    case 'fold': return n === 1 ? (c.folders ?? []).map(value => ({ value, desc: 'folder' })) : null;
    case 'bm': case 'bookmark': case 'bookmarks':
      if (n === 1) return subs(['add', 'bookmark the shown page'], ['rm', 'remove a bookmark', true], ['open', 'open a bookmark', true]);
      return n === 2 && (a1 === 'rm' || a1 === 'open') ? num(c.bookmarks ?? []) : null;
    case 'perm':
      if (n === 1) return subs(['allow', 'give a right to a site', true], ['deny', 'take a right back', true], ['ls', 'rights given']);
      if (n === 2 && (a1 === 'allow' || a1 === 'deny')) return c.host ? [{ value: c.host, desc: 'shown site', more: true }] : null;
      return n === 3 && (a1 === 'allow' || a1 === 'deny') ? ['camera', 'microphone', 'notifications', 'geolocation', 'clipboard', 'storage', 'midi'].map(value => ({ value, desc: 'right' })) : null;
    case 'session': return n === 1 ? subs(['save', "save the Space's pages", true], ['load', 'reopen a session', true], ['ls', 'saved sessions'], ['rm', 'delete a session', true]) : null;
    case 'clip': return n === 1 ? subs(['title', 'copy the page title'], ['md', 'copy a markdown link']) : null;
    case 'space':
      if (n === 1) return [...space(), ...subs(['new', 'create a Space', true], ['rename', 'rename the current Space', true], ['move', 'move the current Space', true], ['sleep', 'sleep its pages'], ['clear', 'close its pages'], ['fold', 'fold it in the sidebar'], ['unfold', 'unfold it'], ['color', 'current Space color', true], ['delete', 'delete the current Space'])];
      if (n === 2 && (a1 === 'fold' || a1 === 'unfold')) return subs(['all', 'every Space']);
      if (n === 2 && a1 === 'move') return c.spaces.map((s, k) => ({ value: String(k + 1), desc: 'place ' + (k + 1) + ' (now ' + s.toLowerCase() + ')' }));
      return n === 2 && a1 === 'color' ? subs(['#ffffff', 'white'], ['#000000', 'black'], ['default', 'original color']) : null;
    case 'mv': case 'move':
      if (n === 1) return [...num(c.tabs), { value: 'all', desc: 'every page of the Space', more: true }, ...space()].map(x => /^\d+$/.test(x.value) ? { ...x, more: true } : x);
      return n === 2 && (a1 === 'all' || /^\d+$/.test(a1)) ? space() : null;
    case 'sel': case 'go': case 'page': return n === 1 ? num(c.tabs) : null;
    case 'rm': case 'close': case 'fermer': return n === 1 ? [...num(c.tabs), { value: '-others', desc: 'close the other pages' }] : null;
    case 'reopen': case 'undo': return n === 1 ? num(c.closed) : null;
    case 'alias': case 'bind':
      if (n === 1) return subs(['rm', 'remove', true], ['ls', 'list']);
      return n === 2 && a1 === 'rm' ? (cmd === 'alias' ? c.aliases : c.binds).map(value => ({ value, desc: cmd })) : null;
    case 'unalias': return n === 1 ? c.aliases.map(value => ({ value, desc: 'alias' })) : null;
    case 'unbind': return n === 1 ? c.binds.map(value => ({ value, desc: 'shortcut' })) : null;
    case 'shortcut': case 'shortcuts':
      if (n === 1) return subs(['add', 'add a site', true], ['rm', 'remove', true], ['ls', 'list']);
      return n === 2 && a1 === 'rm' ? num(c.shortcuts) : null;
    case 'sleep':
      if (n === 1) return [...subs(['all', 'sleep the other pages'], ['tab', 'sleep the shown page'], ['never', 'sites never put to sleep', true]), ...num(c.tabs)];
      if (n === 2 && a1 === 'never') return subs(['add', 'add a site', true], ['rm', 'remove a site', true], ['ls', 'list']);
      return n === 3 && a1 === 'never' && a2 === 'rm' ? c.sleepNever.map(value => ({ value, desc: 'site' })) : null;
    case 'view': case 'mode': return n === 1 ? subs(['text', 'page as text'], ['web', 'real page']) : null;
    case 'zoom': return n === 1 ? ['50', '75', '90', '100', '110', '125', '150', '200', '+', '-'].map(value => ({ value, desc: 'zoom' })) : null;
    case 'speed': return n === 1 ? ['0.5', '0.75', '1', '1.25', '1.5', '2'].map(value => ({ value, desc: 'speed ×' + value })) : null;
    case 'history': return n === 1 ? subs(['clear', 'clear everything'], ['rm', 'delete entries', true]) : null;
    case 'mute': return n === 1 ? [...subs(['all-but-current', 'mute every other page']), ...num(c.tabs)] : null;
    case 'settings': return n === 1 ? subs(['export', 'export the configuration'], ['reset', 'everything back to default']) : null;
    case 'import':
      if (n === 1) return subs(['cookies', 'another browser\'s logins', true], ['passwords', 'CSV password file']);
      return n === 2 && a1 === 'cookies' ? ['chrome', 'edge', 'brave', 'opera', 'operagx', 'vivaldi'].map(value => ({ value, desc: 'source browser' })) : null;
    case 'pass': return n === 1 ? subs(['ls', 'list'], ['copy', 'copy a password', true], ['user', 'copy a username', true], ['forget', 'empty the vault']) : null;
    case 'cookies': return n === 1 ? subs(['import', 'pick a cookie file from another browser'], ['clear', "this site's cookies"], ['clear-all', 'every cookie (asks first)']) : null;
    case 'cache': return n === 1 ? subs(['clear', 'clear']) : null;
    case 'eco': return n === 1 ? subs(['on', 'on'], ['off', 'off']) : null;
    case 'https-allow':
      if (n === 1) return subs(['add', 'keep a site on http', true], ['rm', 'remove', true], ['ls', 'list']);
      return n === 2 && a1 === 'rm' ? (c.httpsAllow ?? []).map(value => ({ value, desc: 'site' })) : null;
    case 'blocklist':
      if (n === 1) return subs(['allow', 'stop blocking a site', true], ['rm', 'block it again', true], ['ls', 'list']);
      return n === 2 && a1 === 'rm' ? (c.blockAllow ?? []).map(value => ({ value, desc: 'site' })) : null;
  }
  return null;
}

/** Propositions pour le dernier mot tapé (ou le suivant si la ligne finit par une espace). */
export function complete(input: string, c: Ctx): Completion[] {
  const toks = input.trimStart().split(/\s+/).filter(Boolean);
  const ends = /\s$/.test(input);
  if (!toks.length || (toks.length === 1 && !ends)) return []; // le nom de la commande : géré par la liste des commandes
  const done = ends ? toks : toks.slice(0, -1);
  const part = fold(ends ? '' : toks[toks.length - 1]);
  const list = choicesFor(done.map(t => t.toLowerCase()), c);
  if (!list) return [];
  return list.filter(x => fold(x.value).startsWith(part) && fold(x.value) !== part).slice(0, 12)
    .map(x => ({ fill: [...done, x.value].join(' ') + (x.more ? ' ' : ''), label: x.value, desc: x.desc, more: !!x.more }));
}

/**
 * Recherche par mots-clés dans les commandes et les réglages : chaque mot tapé doit se trouver dans la commande ou sa description
 * (sans accents, « - » compté comme une espace). « sidebar width » → « set sidebar-width » ; « largeur barre » aussi.
 */
export function searchCommands(query: string, commands: [string, string, string?][]): [string, string][] {
  const words = fold(query).split(/[\s-]+/).filter(w => w.length >= 2);
  if (!words.length) return [];
  // [commande, description anglaise affichée, description française cherchée aussi]
  const all: [string, string, string?][] = [...commands, ...SET_KEYS.map(([k, d]): [string, string, string] => [`set ${k} `, d, SET_KEYS_FR[k] ?? ''])];
  const seen = new Set<string>();
  const hit = (hay: string, w: string) => hay.includes(w) || (SYNONYMS[w] ?? []).some(s => hay.includes(s));
  const found = all.filter(([c, d, f]) => {
    const hay = fold(`${c} ${d} ${f ?? ''}`).replace(/-/g, ' ');
    if (seen.has(c.trim()) || !words.every(w => hit(hay, w))) return false;
    seen.add(c.trim());
    return true;
  });
  // Les commandes dont le nom contient les mots passent avant celles qui ne les ont que dans leur description.
  const inName = ([c]: [string, string, string?]) => words.filter(w => hit(fold(c).replace(/-/g, ' '), w)).length;
  return found.sort((a, b) => inName(b) - inName(a)).map(([c, d]): [string, string] => [c, d]);
}

/** Mots équivalents pour la recherche (les descriptions disent « page », on tape souvent « onglet »). */
const SYNONYMS: Record<string, string[]> = {
  onglet: ['page', 'tab'], onglets: ['page', 'tab'], tab: ['page', 'onglet'], page: ['onglet', 'tab'],
  son: ['mute', 'audio'], audio: ['son', 'mute'], largeur: ['width'], width: ['largeur'], couleur: ['color'], color: ['couleur'],
  supprimer: ['rm', 'retirer', 'effacer'], effacer: ['rm', 'clear', 'supprimer'], fermer: ['close', 'rm'], close: ['fermer'],
  extension: ['ext'], extensions: ['ext'], veille: ['sleep'], sleep: ['veille'], dormir: ['sleep', 'veille'],
  historique: ['history'], history: ['historique'], cacher: ['hide', 'masquer'], masquer: ['hide'], hide: ['masquer'],
  police: ['font'], font: ['police'], texte: ['text'], barre: ['sidebar', 'bar'], demarrage: ['restore', 'boot'],
};
