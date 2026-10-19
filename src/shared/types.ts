// Types partagés entre le processus principal et l'interface.

export interface Space { id: string; name: string }

export interface TabItem {
  kind: 'tab';
  id: string;
  spaceId: string;
  parent: string | null; // id du dossier, ou null à la racine
  url: string;           // '' = nouvelle page
  title: string;
  pinned: boolean;
  private?: boolean;     // navigation privée : jamais sauvegardé, cookies en mémoire, effacés à la fermeture
  label?: string;        // nom choisi par l'utilisateur (tab rename), affiché à la place du titre
}

export interface FolderItem {
  kind: 'folder';
  id: string;
  spaceId: string;
  parent: string | null;
  name: string;
  open: boolean;
}

export type Item = TabItem | FolderItem;

export interface Session {
  spaces: Space[];
  activeSpace: string;
  items: Item[];                         // l'ordre du tableau = l'ordre affiché
  active: Record<string, string | null>; // onglet actif par Space
}

/** Boutons que « sidebar add » peut ajouter à la barre latérale. */
export const WIDGETS = {
  history: 'historique', settings: 'paramètres', help: 'aide (man)', perf: 'performances (top)',
  eco: 'mode économie (on/off)', closed: 'pages fermées', new: 'nouvelle page', clock: 'horloge', ext: 'extensions', guide: 'guide de personnalisation', bm: 'favoris',
} as const;
export type Widget = keyof typeof WIDGETS;

/** Blocs de la nouvelle page, dans l'ordre (set newpage clock,shortcuts · set newpage none). */
export const NEWPAGE = ['clock', 'date', 'shortcuts', 'recent', 'hint'] as const;
export type NewPagePart = typeof NEWPAGE[number];

/** Couleurs modifiables (set color <nom> #rrggbb) et la variable CSS de l'interface qu'elles remplacent. */
export const COLORS = {
  bg: '--bg', fg: '--fg', strong: '--fg-strong', accent: '--c-cy', yellow: '--c-y', green: '--c-g', red: '--c-r',
  cyan: '--c-bc', gray: '--c-gray', sel: '--c-sel', side: '--side', tabbar: '--strip', clock: '--c-clock', private: '--c-priv',
  space1: '--sp1', space2: '--sp2', space3: '--sp3', space4: '--sp4', space5: '--sp5', space6: '--sp6',
} as const;
export type ColorName = keyof typeof COLORS;

export const DEFAULT_PROMPT = 'PS C:\\Users\\{user}\\{space}> ';

/** Éléments de l'interface masquables (ui hide <nom>). */
export const PARTS = {
  tabbar: "barre d'onglets", chip: 'pastille du Space', newbtn: 'bouton +', menu: 'bouton menu ˅', badge: 'badge TLS / PHOSPHORE', winbtns: 'boutons de fenêtre',
  addr: "barre d'adresse", status: "ligne d'état sous l'adresse", hint: "aide à droite de l'invite", prompt: 'invite du bas',
  tree: 'branches ├ └ de la barre latérale', counts: 'nombres de pages des Spaces', flags: 'marques zz * … des pages', empty: 'lignes (vide)',
} as const;
export type Part = keyof typeof PARTS;

/** Textes de l'interface modifiables (set text <clé> <texte>), avec leur valeur par défaut. */
export const TEXTS = {
  brand: 'PHOSPHORE', closed: 'fermés', history: 'historique', settings: 'paramètres', help: 'aide', perf: 'performances', new: 'nouvelle page',
  eco: 'mode éco', empty: '(vide)', 'newtab-title': 'nouvelle page', placeholder: 'rechercher sur {engine} ou taper une adresse', hint: 'man = aide',
  'newpage-hint': 'Alt+1-9 : ouvrir un raccourci  ·  shortcut add <site>  ·  recherche en haut, commande en bas (man)  ·  set newpage … pour changer cette page',
  'open-verb': 'open ', ext: 'extensions', guide: 'guide', bm: 'favoris', 'private-badge': '◆ PAGE PRIVÉE', 'boot-title': 'Phosphore 0.1',
} as const;
export type TextKey = keyof typeof TEXTS;

export interface Settings {
  theme: 'amber' | 'green' | 'white';
  size: 'S' | 'M' | 'L' | 'XL';
  reduceMotion: boolean;
  boot: boolean;
  seal: string;
  profile: string;
  search: 'duckduckgo' | 'google' | 'bing' | 'brave';
  suggest: boolean;
  eco: boolean;                       // mode économie : veille rapide des onglets, moins de processus
  sidebar: Widget[];                  // boutons ajoutés à la barre latérale (sidebar add …)
  sideHidden: boolean;                // barre latérale masquée (sidebar off)
  extensions: string[];               // dossiers d'extensions Chrome décompressées (ext add)
  extOff: string[];                   // extensions installées mais désactivées (ext off)
  mods: string[];
  sharedCookies: boolean;             // un seul jeu de cookies pour tous les Spaces (set spaces true)
  images: 'tint' | 'hide' | 'normal'; // images des sites : teintées, masquées ou d'origine
  textHosts: string[];                // sites convertis en texte (commande « view text ») ; les autres : vraie page, intacte
  lang: string;                       // langue demandée aux sites et format des dates (set lang en)
  sideWidth: number;                  // largeur de la barre latérale en px (poignée ou set sidebar-width)
  closedMax: number;                  // pages affichées dans « fermés »
  newpage: NewPagePart[];             // blocs de la nouvelle page
  unloadSpaces: boolean;              // changer de Space met en veille les pages des autres Spaces
  newTabEnd: boolean;                 // nouvelle page à la fin (sinon juste après la page courante)
  shortcuts: string[];                // raccourcis de la nouvelle page (Alt+1-9), après les pages épinglées
  aliases: Record<string, string>;    // alias yt = start youtube.com
  binds: Record<string, string>;      // bind alt+y = start youtube.com
  colors: Partial<Record<ColorName, string>>;
  font: string;                       // police de l'interface ('' = Cascadia Mono)
  prompt: string;                     // modèle de l'invite : {user} {space}
  css: Record<string, string>;        // n'importe quelle variable CSS de l'interface (set css --bg-2 #202020)
  texts: Partial<Record<TextKey, string>>;
  hidden: Part[];                     // éléments masqués (ui hide …)
  sideRight: boolean;                 // barre latérale à droite (set sidebar-side right)
  // Veille et fermeture automatiques des onglets
  unloadDelay: number;                // minutes hors du Space actif avant la veille (0 = tout de suite)
  idleSleep: number;                  // veille d'un onglet non affiché depuis N minutes (0 = jamais)
  ecoSleep: number;                   // même chose en mode éco
  sleepPinned: boolean;               // les onglets épinglés peuvent être mis en veille automatiquement
  sleepNever: string[];               // sites jamais mis en veille ni fermés automatiquement
  sleepMark: boolean;                 // onglets en veille grisés et marqués « zz » dans la barre latérale
  closeIdle: number;                  // ferme les onglets des Spaces inactifs non vus depuis N minutes (0 = jamais)
  dedupeOnOpen: boolean;              // ouvrir une adresse déjà ouverte dans le Space : on va sur l'onglet existant
  autoplayMute: boolean;              // son coupé automatiquement pour les onglets en arrière-plan
  restore: 'last' | 'home' | 'none';  // au démarrage : dernière session, une nouvelle page, ou rien
  sound: boolean;                     // sons de l'interface (mod de sons actif) ; false coupe tout
  soundVolume: number;                // 0-100
  zoom: number;                       // zoom par défaut des pages, en % (25-500)
  downloadDir: string;                // dossier des téléchargements ('' = Téléchargements de Windows)
  downloadAsk: boolean;               // demander où enregistrer chaque fichier
  proxy: string;                      // proxy de toutes les pages ('' = aucun) : hôte:port, http://, socks5://
  home: string;                       // page d'accueil (commande home, set restore home) ; '' = nouvelle page
  clearHistoryOnExit: boolean;        // historique effacé à la fermeture
  updateCheck: boolean;               // au démarrage (au plus 1×/jour) : prévenir si Electron/Chromium a du retard
  httpsOnly: boolean;                 // forcer https:// (les pages http sont réessayées en https) ; localhost exempté
  httpsAllow: string[];               // sites gardés en http malgré https-only (https-allow <site>)
  privacy: 'strict' | 'normal';       // strict : referrer entre sites réduit à l'origine, WebRTC ne fuit pas l'IP locale, pas de pré-chargement DNS
  safeBrowsing: boolean;              // avertir avant un site d'hameçonnage / malveillant (liste locale, par nom de domaine)
  blockAds: boolean;                  // bloquer pubs et traqueurs (liste locale)
  blockAllow: string[];              // sites exemptés du blocage (blocklist allow <site>)
  bookmarks: { name: string; url: string }[];
  permissions: Record<string, string[]>; // site → droits accordés (perm allow) : camera microphone notifications…
}

/** Droits qu'un site peut recevoir avec « perm allow ». */
export const PERMS = ['camera', 'microphone', 'notifications', 'geolocation', 'clipboard', 'storage', 'midi'] as const;
/** Clés « set » ajoutées avec les commandes de contrôle complet (settings export, tests). */
export const MORE_KEYS = ['zoom', 'download-dir', 'download-ask', 'proxy', 'home', 'clear-history-on-exit'] as const;

/** Clés « set » des sons (settings export, tests). */
export const SOUND_KEYS = ['sound', 'sound-volume'] as const;

/** Clés « set » des réglages de veille et d'onglets (settings export, tests). */
export const TAB_KEYS = ['unload-delay', 'idle-sleep', 'eco-sleep', 'sleep-pinned', 'sleep-never', 'sleep-mark', 'close-idle', 'dedupe-on-open', 'autoplay-mute', 'restore'] as const;

/** Segment de texte : [texte, ref (0 = texte simple), type l=lien b=bouton i=champ p=mot de passe c=case v=vidéo m=image] */
export type Seg = [string, number, string?];
export type Line = [string, Seg[]];
export interface MediaState { r: number; kind: 'video' | 'img'; t?: number; d?: number; paused?: boolean; muted?: boolean }
/** Page convertie en texte, envoyée à l'interface. */
export interface PageSnap { tabId: string; v: number; title?: string; lines?: Line[]; media: MediaState | null }

/** État d'exécution d'un onglet (non sauvegardé). */
export interface TabLive { asleep: boolean; loading: boolean; error: string | null; audible?: boolean; muted?: boolean }

export interface UiState {
  session: Session;
  closed: { id: string; title: string; url: string; spaceId: string }[]; // dernières pages fermées, la plus récente d'abord
  live: Record<string, TabLive>;
  settings: Settings;
  closedCount: number;
  internal: boolean;   // l'interface affiche une page interne (aide, réglages) à la place du site
  memMo: number;
}

/** Mode d'affichage d'une adresse : texte (terminal) par défaut, web pour les sites listés. */
export function modeOf(url: string, textHosts: string[]): 'text' | 'web' {
  try { return textHosts.includes(new URL(url).hostname) ? 'text' : 'web'; } catch { return 'web'; }
}

/**
 * Session au démarrage selon « set restore » : last = telle quelle ; home = une nouvelle page ; none = aucune page.
 * Les pages épinglées et les dossiers sont toujours gardés (ce sont des favoris, les perdre serait définitif).
 */
export function restoreMode(s: Session, mode: 'last' | 'home' | 'none', homeId: string, homeUrl = ''): Session {
  if (mode === 'last') return s;
  const items: Item[] = s.items.filter(i => i.kind === 'folder' || i.pinned);
  const active: Session['active'] = Object.fromEntries(s.spaces.map(sp => [sp.id, null]));
  if (mode === 'home') {
    // home : la page d'accueil (set home), sinon une nouvelle page
    items.push({ kind: 'tab', id: homeId, spaceId: s.activeSpace, parent: null, url: homeUrl, title: homeUrl ? new URL(homeUrl).hostname : 'nouvelle-page', pinned: false });
    active[s.activeSpace] = homeId;
  }
  return { ...s, items, active };
}

/** Lignes de la barre latérale dans l'ordre d'affichage : épinglés d'abord, puis l'arbre. */
export function tree(items: Item[], spaceId: string, includeClosed = true): { item: Item; depth: number }[] {
  const mine = items.filter(i => i.spaceId === spaceId);
  const out: { item: Item; depth: number }[] = [];
  for (const i of mine) if (i.kind === 'tab' && i.pinned && i.parent === null) out.push({ item: i, depth: 0 });
  const walk = (parent: string | null, depth: number) => {
    for (const i of mine) {
      if (i.parent !== parent || (i.kind === 'tab' && i.pinned && parent === null)) continue;
      out.push({ item: i, depth });
      if (i.kind === 'folder' && (i.open || includeClosed)) walk(i.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
