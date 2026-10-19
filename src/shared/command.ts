// Analyse de ce qui est tapé dans l'invite. Pur (aucun accès Electron) : testé dans tests/.

export type Engine = 'duckduckgo' | 'google' | 'bing' | 'brave';

export type TabOp = 'new' | 'close' | 'pin' | 'unpin' | 'restore' | 'next' | 'prev'
  | 'reload' | 'back' | 'forward' | 'sleep-others' | 'sleep-current' | 'dup' | 'close-others' | 'copy' | 'print' | 'top' | 'bottom' | 'stop';

export type Action =
  | { type: 'navigate'; url: string; newTab: boolean }
  | { type: 'tab'; op: TabOp }
  | { type: 'space'; op: 'go' | 'new' | 'rename' | 'delete' | 'color' | 'move' | 'sleep' | 'clear' | 'fold' | 'unfold'; arg: string }
  | { type: 'folder'; op: 'new' | 'rename' | 'delete'; arg: string }
  | { type: 'set'; key: string; value: string }
  | { type: 'page'; page: 'settings' | 'history' | 'help' | 'perf' | 'ext' | 'tabs' | 'guide' | 'bookmarks'; q?: string }
  | { type: 'history-clear' }
  | { type: 'ext'; op: 'add' | 'rm' | 'store' | 'on' | 'off' | 'update' | 'open'; n: number; arg?: string }
  | { type: 'mod'; op: 'ls' | 'new' | 'on' | 'off' | 'edit' | 'folder' | 'import' | 'rm' | 'reload' | 'new-sound'; name: string }
  | { type: 'pip' }
  | { type: 'mv'; which: 'cur' | 'all' | number; space: string }
  | { type: 'sort'; by: 'title' | 'site' }
  | { type: 'dedup' }
  | { type: 'reopen'; n: number }
  | { type: 'sleep-never'; op: 'add' | 'rm' | 'ls'; site: string }
  | { type: 'private'; url: string }
  | { type: 'history-rm'; ns: number[]; site: string }
  | { type: 'tool'; op: 'translate' | 'archive' | 'devtools' | 'cookies-clear' | 'cache-clear' | 'restart' | 'shot' | 'pdf' | 'wake' }
  | { type: 'alias' | 'bind'; op: 'set' | 'rm' | 'ls'; name: string; cmd: string }
  | { type: 'shortcut'; op: 'add' | 'rm' | 'ls'; arg: string }
  | { type: 'source'; file: string }
  | { type: 'settings-op'; op: 'reset' | 'export' | 'autorun' }
  | { type: 'sidebar'; op: 'add' | 'rm' | 'ls' | 'on' | 'off' | 'order' | 'move'; arg: string; n?: number }
  | { type: 'ui'; op: 'hide' | 'show' | 'ls' | 'reset'; part: string }
  | { type: 'view'; mode: 'text' | 'web' }
  | { type: 'media'; op: 'play' | 'pause' | 'toggle' | 'mute' | 'seek' | 'fwd' | 'full' | 'close' | 'speed' | 'loop' | 'unmute' | 'mute-others'; x: number }
  | { type: 'go'; n: number }
  | { type: 'zoom'; x: number | 'in' | 'out' }
  | { type: 'find'; text: string }
  | { type: 'win'; op: 'min' | 'max' | 'exit' | 'full' | 'ontop' }
  | { type: 'tabn'; op: 'sleep' | 'wake' | 'pin' | 'unpin' | 'mute'; n: number }  // action sur la page n° (ls)
  | { type: 'tabmove'; from: number; to: number | 'up' | 'down' | 'first' | 'last' } // from 0 = page affichée
  | { type: 'tabrename'; name: string }                                              // '' = nom d'origine
  | { type: 'closeset'; which: 'right' | 'all' }
  | { type: 'reload-all' }
  | { type: 'info' }
  | { type: 'open-many'; urls: string[] }
  | { type: 'tabfold'; name: string }                                                // '' = sortir du dossier
  | { type: 'downloads' }
  | { type: 'bm'; op: 'add' | 'rm' | 'open'; arg: string; name: string }
  | { type: 'clip'; what: 'title' | 'md' }
  | { type: 'pastego' }
  | { type: 'perm'; op: 'allow' | 'deny' | 'ls'; site: string; perm: string }
  | { type: 'home' }
  | { type: 'session'; op: 'save' | 'load' | 'ls' | 'rm'; name: string }
  | { type: 'cookies-all' }
  | { type: 'default-browser'; off: boolean }
  | { type: 'net-check' }
  | { type: 'update'; install: boolean }
  | { type: 'https-allow'; op: 'add' | 'rm' | 'ls'; site: string }
  | { type: 'blocklist-allow'; op: 'add' | 'rm' | 'ls'; site: string }
  | { type: 'cls' }
  | { type: 'close'; n: number }
  | { type: 'ls' }
  | { type: 'pwd' }
  | { type: 'import-pass' }
  | { type: 'import-cookies'; browser: string }
  | { type: 'import-cookie-file'; file: string }                                   // '' = fenêtre de choix
  | { type: 'pass'; op: 'ls' | 'copy' | 'user' | 'forget'; n: number; q: string }
  | { type: 'error'; message: string };

/**
 * Commandes proposées pendant la frappe dans l'invite du bas (complétion), avec des noms de vrai shell
 * (PowerShell / Unix). Un espace final = argument attendu. Les anciens noms (close, find…) marchent toujours.
 * [commande, description affichée (anglais), mots-clés français pour la recherche]
 */
export const COMMANDS: [string, string, string][] = [
  ["start ", "open a site in a new page (start youtube.com); several: start a.com b.com", "ouvrir un site dans une nouvelle page (start youtube.com)"],
  ["start", "new blank page", "nouvelle page vide"],
  ["ls", "list the Space's pages (with their number)", "lister les pages du Space (avec leur numéro)"],
  ["pwd", "show the page address", "afficher l'adresse de la page"],
  ["rm", "close the page", "fermer la page"],
  ["rm ", "close page n° (rm 3)", "fermer la page n° (rm 3)"],
  ["rm -others", "close the other pages", "fermer les autres pages"],
  ["cp", "duplicate the page", "dupliquer la page"],
  ["undo", "reopen the last closed page", "rouvrir la dernière page fermée"],
  ["sel ", "go to page n° (sel 2)", "aller à la page n° (sel 2)"],
  ["cd ..", "previous page (history)", "page précédente (historique)"],
  ["cd +", "next page (history)", "page suivante (historique)"],
  ["cd ", "switch Space (cd games)", "changer de Space (cd jeux)"],
  ["grep ", "find a word in the page (grep price)", "chercher un mot dans la page (grep prix)"],
  ["curl ", "search the web (curl weather london)", "rechercher sur le web (curl météo lyon)"],
  ["r", "reload the page", "recharger la page"],
  ["kill", "stop loading", "arrêter le chargement"],
  ["head", "top of the page", "haut de la page"],
  ["tail", "bottom of the page", "bas de la page"],
  ["top", "performance: memory and CPU per page", "performances : mémoire et processeur par page"],
  ["eco", "eco mode on/off (less memory)", "mode économie on/off (moins de mémoire)"],
  ["sidebar add ", "add a sidebar button (sidebar add history)", "ajouter un bouton à gauche (sidebar add history)"],
  ["sidebar rm ", "remove a sidebar button", "retirer un bouton"],
  ["sidebar ls", "available sidebar buttons", "boutons disponibles"],
  ["sidebar move ", "move a sidebar button (sidebar move history 1)", "changer la place d'un bouton (sidebar move history 1)"],
  ["sidebar order ", "sidebar button order (sidebar order clock,closed,history)", "ordre des boutons (sidebar order clock,closed,history)"],
  ["sidebar off", "hide the sidebar", "masquer la barre latérale"],
  ["sidebar on", "show the sidebar", "afficher la barre latérale"],
  ["history ", "search the history (history weather)", "chercher dans l'historique (history météo)"],
  ["history clear", "clear the history", "effacer l'historique"],
  ["clip", "copy the page address", "copier l'adresse de la page"],
  ["mute", "mute / unmute the page", "couper / remettre le son"],
  ["lp", "print", "imprimer"],
  ["zoom ", "zoom 150 · zoom + · zoom - · zoom 100", "zoom 150 · zoom + · zoom - · zoom 100"],
  ["pin", "pin the page", "épingler la page"],
  ["unpin", "unpin the page", "désépingler"],
  ["mkdir ", "new folder, moves the page into it (mkdir Courses)", "nouveau dossier, y range la page (mkdir Cours)"],
  ["ren ", "rename the page's folder", "renommer le dossier de la page"],
  ["rmdir", "delete the page's folder", "supprimer le dossier de la page"],
  ["md -space ", "create a Space (md -space Work)", "créer un Space (md -space Travail)"],
  ["rmspace ", "delete a Space (rmspace games)", "supprimer un Space (rmspace jeux)"],
  ["import passwords", "import a CSV password file (exported from another browser) — no built-in manager: Bitwarden (ext store, then ext open) or KeePassXC","importer un fichier CSV de mots de passe (exporté d'un autre navigateur)"],
  ["import cookies", "take over another browser's logins (Chrome, Edge, Brave, Opera…) · close it first", "reprendre les connexions d'un autre navigateur (Chrome, Edge, Brave, Opera…) · le fermer avant"],
  ["cookies import", "pick a cookie file from another browser: cookies.txt, Chrome/Edge \"Cookies\", Firefox cookies.sqlite", "choisir un fichier de cookies d'un autre navigateur (cookies.txt, Chrome, Firefox), se reconnecter à YouTube"],
  ["pass ls", "passwords in the vault (pass ls google)", "mots de passe du coffre (pass ls google)"],
  ["pass copy ", "copy a password (cleared after 30 s)", "copier un mot de passe (effacé après 30 s)"],
  ["pass user ", "copy a username", "copier un identifiant"],
  ["pass forget", "empty the vault", "vider le coffre"],
  ["ext", "Extensions page: installed, enable / disable, install", "page Extensions : installées, activer / désactiver, installer"],
  ["ext store", "open the Store menu; on an extension's Web Store page: install it", "ouvrir le Chrome Web Store ; sur la page d'une extension : l'installer"],
  ["ext store ", "search the Store, or install from a Chrome Web Store link or id", "installer depuis le Chrome Web Store (lien ou identifiant)"],
  ["ext add", "add a Chrome extension (unpacked folder)", "ajouter une extension Chrome (dossier décompressé)"],
  ["ext open ", "open an extension's popup in a tab (ext open 1) — e.g. Bitwarden", "ouvrir le popup d'une extension dans un onglet (ext open 1), ex. Bitwarden"],
  ["ext rm ", "remove an extension (ext rm 1)", "retirer une extension (ext rm 1)"],
  ["ext off ", "disable an extension (ext off 1)", "désactiver une extension (ext off 1)"],
  ["ext on ", "re-enable an extension", "réactiver une extension"],
  ["ext update ", "update from the Store", "mettre à jour depuis le Store"],
  ["mod new ", "create a CSS mod (mod new youtube-dark)", "créer un mod CSS (mod new youtube-sombre)"],
  ["mod new sound ", "create a sample sound mod (mod new sound test)", "créer un mod de sons d'exemple (mod new sound test)"],
  ["mod import", "import a mod: .css, folder, .zip or Opera GX .crx mod", "importer un mod : .css, dossier, .zip ou mod Opera GX .crx"],
  ["mod ls", "mods (css and sounds)", "mods (css et sons)"],
  ["set sound ", "interface sounds true|false", "sons de l'interface true|false"],
  ["set sound-volume ", "sound volume 0-100", "volume des sons 0-100"],
  ["mod on ", "enable a mod", "activer un mod"],
  ["mod off ", "disable a mod", "désactiver un mod"],
  ["mod rm ", "delete a mod", "supprimer un mod"],
  ["mod reload", "reapply the mods", "réappliquer les mods"],
  ["sleep", "put the other pages to sleep (= sleep all)", "mettre en veille les autres pages (= sleep all)"],
  ["sleep tab", "put the shown page to sleep (moves to the next one)", "mettre en veille la page affichée (passe à la suivante)"],
  ["wake", "wake every page of the Space", "réveiller toutes les pages du Space"],
  ["sleep never add ", "site never put to sleep (sleep never add discord.com)", "site jamais mis en veille (sleep never add discord.com)"],
  ["sleep never rm ", "remove a site from the list", "retirer un site de la liste"],
  ["sleep never ls", "sites never put to sleep", "sites jamais mis en veille"],
  ["reopen ", "reopen page n° from \"closed\" (reopen 2)", "rouvrir la page n° de « fermés » (reopen 2)"],
  ["find-tab ", "find a page in every Space (find-tab weather)", "chercher une page dans tous les Spaces (find-tab météo)"],
  ["unmute", "unmute the page", "remettre le son de la page"],
  ["mute all-but-current", "mute every page except the shown one", "couper le son de toutes les pages sauf celle affichée"],
  ["space move ", "move the current Space to a place (space move 1 = top), or drag its header", "déplacer le Space, ordre des Spaces, changer la place"],
  ["space color ", "color of the current Space (space color #ffffff)", "couleur du Space actif (space color #ffffff)"],
  ["set unload-delay ", "minutes before other Spaces' pages sleep (0 = right away)", "minutes avant la veille des autres Spaces (0 = tout de suite)"],
  ["set idle-sleep ", "sleep pages not seen for N min (0 = never)", "veille des pages non vues depuis N min (0 = jamais)"],
  ["set eco-sleep ", "same, in eco mode", "même chose en mode éco"],
  ["set sleep-pinned ", "pinned pages can sleep too (true|false)", "pages épinglées mises en veille aussi (true|false)"],
  ["set sleep-never ", "sites never put to sleep (discord.com,deezer.com · none)", "sites jamais en veille (discord.com,deezer.com · none)"],
  ["set sleep-mark ", "sleeping pages dimmed \"zz\" (true|false)", "pages en veille grisées « zz » (true|false)"],
  ["set close-idle ", "close inactive Spaces' pages not seen for N min (0 = never)", "fermer les pages des Spaces inactifs non vues depuis N min (0 = jamais)"],
  ["set dedupe-on-open ", "address already open: go to that page (true|false)", "adresse déjà ouverte : aller sur cette page (true|false)"],
  ["set autoplay-mute ", "mute pages playing in the background (true|false)", "couper le son des pages en arrière-plan (true|false)"],
  ["set restore ", "at startup: last (session) · home (new page) · none (nothing)", "au démarrage : last (session) · home (nouvelle page) · none (rien)"],
  ["pip", "video picture-in-picture, type again to exit", "vidéo en incrustation (Picture-in-Picture), retaper pour sortir"],
  ["speed ", "video speed (speed 1.5)", "vitesse de la vidéo (speed 1.5)"],
  ["loop", "video loop on/off", "vidéo en boucle on/off"],
  ["mv ", "move the page to a Space (mv games · mv 3 games · mv all games)", "déplacer la page vers un Space (mv jeux · mv 3 jeux · mv all jeux)"],
  ["sort", "sort pages by site (sort title: by title)", "trier les pages par site (sort title : par titre)"],
  ["dedup", "close duplicate pages (= dedupe)", "fermer les pages en double (= dedupe)"],
  ["private", "private browsing: nothing is kept (private youtube.com)", "navigation privée : rien n'est gardé (private youtube.com)"],
  ["history rm ", "delete entries (history rm 3 5-8 · history rm youtube.com)", "effacer des entrées (history rm 3 5-8 · history rm youtube.com)"],
  ["translate", "translate the page", "traduire la page"],
  ["archive", "archived version of the page (web.archive.org)", "version archivée de la page (web.archive.org)"],
  ["screenshot", "page screenshot (Pictures + clipboard)", "capture de la page (Images + presse-papiers)"],
  ["pdf", "save the page as PDF", "enregistrer la page en PDF"],
  ["cookies clear", "clear the open site's cookies", "effacer les cookies du site ouvert"],
  ["cache clear", "clear the cache", "vider le cache"],
  ["devtools", "developer tools", "outils de développement"],
  ["restart", "restart Phosphore", "redémarrer Phosphore"],
  ["shortcut add ", "new-page shortcut, Alt+1-9 (shortcut add twitch.tv)", "raccourci de la nouvelle page, Alt+1-9 (shortcut add twitch.tv)"],
  ["shortcut ls", "shortcuts", "raccourcis"],
  ["shortcut rm ", "remove a shortcut", "retirer un raccourci"],
  ["alias ", "create a command (alias yt start youtube.com)", "créer une commande (alias yt start youtube.com)"],
  ["bind ", "keyboard shortcut (bind alt+y start youtube.com)", "raccourci clavier (bind alt+y start youtube.com)"],
  ["source ", "run a command file (source C:\\path\\config.txt)", "exécuter un fichier de commandes (source C:\\chemin\\config.txt)"],
  ["reset settings", "every setting back to default", "tous les réglages par défaut"],
  ["autorun", "commands run at every startup (opens autorun.txt)", "commandes lancées à chaque démarrage (ouvre autorun.txt)"],
  ["settings export", "the whole configuration as a command file", "toute la configuration en fichier de commandes"],
  ["ui hide ", "hide an element (ui hide tabbar)", "masquer un élément (ui hide tabbar)"],
  ["ui show ", "show an element again", "réafficher un élément"],
  ["ui ls", "hideable elements and editable texts", "éléments masquables et textes modifiables"],
  ["set css ", "any CSS variable (set css --bg-2 #202020)", "n'importe quelle variable CSS (set css --bg-2 #202020)"],
  ["set text ", "change an interface text (set text closed recent)", "changer un texte de l'interface (set text closed récents)"],
  ["set color ", "color (set color spaces #ffffff · set color clock #ffffff)", "couleur (set color spaces #ffffff · set color clock #ffffff)"],
  ["set sidebar-side ", "sidebar on the left or right", "barre latérale à gauche ou à droite"],
  ["set ", "change a setting (set theme green)", "changer un réglage (set theme vert)"],
  ["settings", "settings", "paramètres"],
  ["history", "history", "historique"],
  ["guide", "customization guide: click a section to see everything you can change", "guide de personnalisation, tout ce qu'on peut changer, aide"],
  ["tab move ", "move a page to a place: tab move 1 (shown page) · tab move 5 1", "déplacer un onglet, ordre des pages, changer la place"],
  ["tab up", "move the shown page up one place (also tab down, tab first, tab last)", "monter descendre onglet ordre"],
  ["tab rename ", "give the shown page your own name (tab rename alone: original name)", "renommer un onglet, nom de page"],
  ["rm -right", "close the pages after the shown one", "fermer les pages à droite"],
  ["rm -all", "close every page of the Space (pinned ones stay)", "fermer toutes les pages du space"],
  ["sleep ", "put page n° to sleep (sleep 3)", "mettre en veille la page numéro"],
  ["wake ", "wake page n° (wake 3)", "réveiller la page numéro"],
  ["pin ", "pin page n° (pin 3 · unpin 3)", "épingler la page numéro"],
  ["mute ", "mute / unmute page n° (mute 3)", "couper le son de la page numéro"],
  ["r all", "reload every page of the Space", "recharger toutes les pages"],
  ["info", "details of the shown page: address, Space, zoom, sound…", "informations sur la page"],
  ["fold ", "put the shown page in a folder (fold Courses) · unfold: take it out", "ranger la page dans un dossier, sortir du dossier"],
  ["space sleep", "put every page of the current Space to sleep", "endormir le space"],
  ["space clear", "close every page of the current Space (pinned ones stay)", "vider le space, fermer tout"],
  ["space fold", "fold the current Space in the sidebar (space fold all · space unfold all)", "replier déplier les spaces dans la barre"],
  ["fullscreen", "window full screen on/off", "plein écran de la fenêtre"],
  ["ontop", "keep Phosphore above other windows on/off", "toujours au premier plan"],
  ["set zoom ", "default zoom of every page in % (set zoom 110)", "zoom par défaut"],
  ["downloads", "open the downloads folder", "dossier des téléchargements"],
  ["set download-dir ", "downloads folder (set download-dir C:UsersmeDownloads · default)", "dossier de téléchargement"],
  ["set download-ask ", "ask where to save each file (true|false)", "demander où enregistrer les téléchargements"],
  ["bm", "bookmarks page: filter by typing at the top, click to open", "favoris, marque-pages"],
  ["bm add", "bookmark the shown page (bm add [name] · bm add <address> [name])", "ajouter aux favoris"],
  ["bm rm ", "remove bookmark n° (bm open <n> opens it)", "retirer un favori"],
  ["clip title", "copy the page title (clip md: markdown link)", "copier le titre, lien markdown"],
  ["pastego", "open the address in the clipboard (or search its text)", "coller et aller, ouvrir le presse-papiers"],
  ["perm allow ", "let a site use: camera microphone notifications geolocation clipboard storage midi", "autoriser caméra micro notifications position site permission"],
  ["perm deny ", "take a right back from a site", "refuser retirer une permission"],
  ["perm ls", "rights given to sites (everything else is refused)", "permissions des sites"],
  ["set proxy ", "proxy for every page (host:port · socks5://host:port · none)", "proxy"],
  ["set home ", "home page (set home youtube.com · none = new page)", "page d'accueil"],
  ["home", "open the home page", "aller à la page d'accueil"],
  ["set clear-history-on-exit ", "clear the history when Phosphore closes (true|false)", "effacer l'historique en quittant"],
  ["session save ", "save the Space's pages under a name (session save work)", "enregistrer une session, groupe d'onglets"],
  ["session load ", "reopen a saved session in a new Space (pages load when opened)", "rouvrir une session"],
  ["session ls", "saved sessions (session rm <name> deletes one)", "liste des sessions"],
  ["cookies clear-all", "clear every cookie and site data (asks first)", "effacer tous les cookies, se déconnecter de tout"],
  ["default-browser", "make Phosphore the default browser (then confirm in Windows settings)", "navigateur par défaut"],
  ["net-check", "show the public IP seen by the web (check the proxy works)", "voir l'IP publique vue par le web, vérifier le proxy"],
  ["https-allow add ", "keep a site on http despite https-only (https-allow add example.com)", "garder un site en http malgré https-only"],
  ["https-allow ls", "sites kept on http", "sites gardés en http"],
  ["blocklist allow ", "stop blocking a site (blocklist allow example.com)", "ne plus bloquer un site (pub/traqueurs)"],
  ["blocklist ls", "sites excluded from blocking", "sites exclus du blocage"],
  ["update", "check for a new Phosphore version (downloaded, installed on close) and whether Chromium is up to date", "vérifier si Chromium/Electron est à jour, mise à jour"],
  ["update install", "restart now to install the downloaded Phosphore version", "installer la mise à jour maintenant, redémarrer"],
  ["man", "every command", "toutes les commandes"],
  ["cls", "clear the screen", "effacer l'écran"],
  ["exit", "quit Phosphore", "quitter Phosphore"],
];

const ENGINES: Record<Engine, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
};

export function searchUrl(q: string, engine: Engine): string {
  return ENGINES[engine] + encodeURIComponent(q.trim());
}

/** Renvoie une URL http(s) si le texte en est une, sinon null. */
export function toUrl(input: string): string | null {
  const s = input.trim();
  if (!s || /\s/.test(s)) return null;
  let candidate: string;
  if (/^https?:\/\//i.test(s)) candidate = s;
  else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return null; // autre protocole (file:, javascript:…) : jamais une URL
  else if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(s)) candidate = 'http://' + s;
  else if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s.split(/[?#]/)[0]) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/.test(s)) candidate = 'https://' + s;
  else return null;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

const TAB_OPS: Record<string, TabOp> = {
  new: 'new', nouvelle: 'new', close: 'close', fermer: 'close', pin: 'pin', epingler: 'pin',
  unpin: 'unpin', reopen: 'restore', rouvrir: 'restore', next: 'next', suivante: 'next',
  prev: 'prev', precedente: 'prev', reload: 'reload', back: 'back', retour: 'back', forward: 'forward',
  dup: 'dup', duplicate: 'dup',
};

// Commandes d'un seul mot (alias français compris).
const WORDS: Record<string, Action> = {
  close: { type: 'tab', op: 'close' }, fermer: { type: 'tab', op: 'close' },
  new: { type: 'tab', op: 'new' }, nouveau: { type: 'tab', op: 'new' }, nouvelle: { type: 'tab', op: 'new' },
  reopen: { type: 'tab', op: 'restore' }, rouvrir: { type: 'tab', op: 'restore' },
  dup: { type: 'tab', op: 'dup' }, dupliquer: { type: 'tab', op: 'dup' },
  next: { type: 'tab', op: 'next' }, prev: { type: 'tab', op: 'prev' },
  pin: { type: 'tab', op: 'pin' }, epingler: { type: 'tab', op: 'pin' }, unpin: { type: 'tab', op: 'unpin' },
  stop: { type: 'tab', op: 'stop' }, copy: { type: 'tab', op: 'copy' }, copier: { type: 'tab', op: 'copy' },
  print: { type: 'tab', op: 'print' }, imprimer: { type: 'tab', op: 'print' },
  haut: { type: 'tab', op: 'top' }, bottom: { type: 'tab', op: 'bottom' }, bas: { type: 'tab', op: 'bottom' },
  top: { type: 'page', page: 'perf' }, perf: { type: 'page', page: 'perf' }, taskmgr: { type: 'page', page: 'perf' },
  eco: { type: 'set', key: 'eco', value: 'toggle' },
  cls: { type: 'cls' }, clear: { type: 'cls' }, retry: { type: 'tab', op: 'reload' },
  start: { type: 'tab', op: 'new' }, ls: { type: 'ls' }, dir: { type: 'ls' }, ps: { type: 'ls' }, pwd: { type: 'pwd' },
  rm: { type: 'tab', op: 'close' }, kill: { type: 'tab', op: 'stop' }, cp: { type: 'tab', op: 'dup' }, undo: { type: 'tab', op: 'restore' },
  clip: { type: 'tab', op: 'copy' }, lp: { type: 'tab', op: 'print' }, head: { type: 'tab', op: 'top' }, tail: { type: 'tab', op: 'bottom' },
  rmdir: { type: 'folder', op: 'delete', arg: '' }, sleep: { type: 'tab', op: 'sleep-others' },
  man: { type: 'page', page: 'help' }, 'get-help': { type: 'page', page: 'help' }, grep: { type: 'find', text: '' },
  min: { type: 'win', op: 'min' }, max: { type: 'win', op: 'max' }, exit: { type: 'win', op: 'exit' }, quit: { type: 'win', op: 'exit' }, quitter: { type: 'win', op: 'exit' },
};

export function parse(raw: string, engine: Engine): Action | null {
  const input = raw.trim();
  if (!input) return null;
  const [head, ...rest] = input.split(/\s+/);
  const word = head.toLowerCase();
  const arg = rest.join(' ');
  const sub = (rest[0] ?? '').toLowerCase();
  const subArg = rest.slice(1).join(' ');

  if (!rest.length && WORDS[word]) return WORDS[word];
  if (!rest.length && ['open', 'o', 'curl', 'search', 's', '?', 'ren', 'rename', 'md', 'mkdir', 'cd'].includes(word))
    return { type: 'error', message: COMMANDS.find(([c]) => c.trim() === word)?.[1] ?? `${word} : argument manquant` };
  switch (word) {
    case 'close': case 'fermer': case 'rm': {
      if (['others', 'autres', '-others', '-o'].includes(sub)) return { type: 'tab', op: 'close-others' };
      if (sub === '-right' || sub === 'right' || sub === 'droite') return { type: 'closeset', which: 'right' };
      if (sub === '-all' || sub === 'all' || sub === 'tout') return { type: 'closeset', which: 'all' };
      const n = Number(sub);
      return /^\d+$/.test(sub) && n >= 1 && rest.length === 1 ? { type: 'close', n } : { type: 'error', message: 'rm · rm 3 · rm -others · rm -right · rm -all' };
    }
    case 'start': case 'open': case 'o': {
      // start a.com b.com c.com : plusieurs sites d'un coup (seulement si chaque mot est une adresse)
      if (rest.length > 1) {
        const urls = rest.map(w => toUrl(w));
        if (urls.every(Boolean)) return { type: 'open-many', urls: (urls as string[]).slice(0, 30) };
      }
      const url = toUrl(arg) ?? (/^[a-z0-9-]+$/i.test(arg) ? toUrl(arg + '.com') : null) ?? searchUrl(arg, engine);
      return { type: 'navigate', url, newTab: true };
    }
    case 'curl': case 'search': case 's': case '?':
      return { type: 'navigate', url: searchUrl(arg, engine), newTab: false };
    case 'ren': case 'rename': return { type: 'folder', op: 'rename', arg };
    case 'md':
      if (sub === '-space' && subArg) return { type: 'space', op: 'new', arg: subArg };
      return { type: 'folder', op: 'new', arg };
    case 'sel': case 'go': case 'tab': case 'page': {
      const n = Number(sub);
      if (/^\d+$/.test(sub) && n >= 1 && rest.length === 1) return { type: 'go', n };
      if (word !== 'tab') return { type: 'error', message: 'sel <numéro de page> (ex. sel 2) · ls pour les numéros' };
      // tab move 5 1 · tab move 1 (page affichée) · tab up|down|first|last · tab rename <nom>
      if (sub === 'up' || sub === 'down' || sub === 'first' || sub === 'last') return { type: 'tabmove', from: 0, to: sub };
      if (sub === 'move') {
        const [a, b] = rest.slice(1).map(Number);
        if (rest.length === 2 && a >= 1) return { type: 'tabmove', from: 0, to: a };
        if (rest.length === 3 && a >= 1 && b >= 1) return { type: 'tabmove', from: a, to: b };
        return { type: 'error', message: 'tab move <place> · tab move <n> <place> · tab up|down|first|last' };
      }
      if (sub === 'rename') return { type: 'tabrename', name: subArg.trim().slice(0, 80) };
      const op = TAB_OPS[sub];
      return op ? { type: 'tab', op } : { type: 'error', message: 'tab new|close|pin|unpin|reopen|next|prev' };
    }
    case 'zoom': {
      if (sub === 'in' || sub === '+') return { type: 'zoom', x: 'in' };
      if (sub === 'out' || sub === '-') return { type: 'zoom', x: 'out' };
      if (sub === 'reset' || sub === '0' || sub === '100') return { type: 'zoom', x: 100 };
      const n = Number(sub.replace('%', ''));
      return n >= 25 && n <= 500 ? { type: 'zoom', x: n } : { type: 'error', message: 'zoom 150 · zoom + · zoom - · zoom 100' };
    }
    case 'grep': case 'sls': case 'find': case 'chercher': return { type: 'find', text: arg.slice(0, 200) };
    case 'rmspace': return arg ? { type: 'space', op: 'delete', arg } : { type: 'error', message: 'rmspace <nom ou numéro du Space>' };
    case 'import':
      if ((sub === 'cookies' || sub === 'cookie') && (rest[1] ?? '').toLowerCase() === 'file') return { type: 'import-cookie-file', file: rest.slice(2).join(' ').replace(/^["']|["']$/g, '') };
      if (sub === 'cookies' || sub === 'cookie') return { type: 'import-cookies', browser: (rest[1] ?? '').toLowerCase() };
      return sub === 'passwords' || sub === 'password' || sub === 'pass' ? { type: 'import-pass' } : { type: 'error', message: 'import passwords (fichier CSV exporté d\'un autre navigateur) · import cookies (Chrome, Edge, Brave, Opera…)' };
    case 'pass': case 'passwords': {
      if (sub === 'import') return { type: 'import-pass' };
      if (sub === 'forget' || sub === 'clear') return { type: 'pass', op: 'forget', n: 0, q: '' };
      const n = Number(rest[1]);
      if (sub === 'copy' || sub === 'user') return Number.isInteger(n) && n >= 1 ? { type: 'pass', op: sub, n, q: '' } : { type: 'error', message: `pass ${sub} <numéro> (pass ls pour les numéros)` };
      return { type: 'pass', op: 'ls', n: 0, q: (sub === 'ls' ? subArg : arg).slice(0, 100) };
    }
    case 'pip': return { type: 'pip' };
    case 'speed': case 'vitesse': {
      const n = Number(sub.replace(/[x×]$/, '').replace(',', '.'));
      return n >= 0.1 && n <= 16 ? { type: 'media', op: 'speed', x: n } : { type: 'error', message: 'speed 1.5 · speed 2 · speed 1 (vitesse de la vidéo)' };
    }
    case 'loop': case 'boucle': return { type: 'media', op: 'loop', x: 0 };
    case 'mv': case 'move': {
      // mv jeux · mv 3 jeux · mv all jeux : pages vers un autre Space
      if (rest.length === 1) return { type: 'mv', which: 'cur', space: sub };
      const n = Number(sub);
      if (rest.length === 2 && (sub === 'all' || sub === '*' || sub === 'tout')) return { type: 'mv', which: 'all', space: rest[1] };
      if (rest.length === 2 && /^\d+$/.test(sub) && n >= 1) return { type: 'mv', which: n, space: rest[1] };
      return { type: 'error', message: 'mv <space> · mv 3 <space> · mv all <space>' };
    }
    case 'sort': return sub === 'title' || sub === 'titre' ? { type: 'sort', by: 'title' } : sub === 'site' || !sub ? { type: 'sort', by: 'site' } : { type: 'error', message: 'sort site · sort title' };
    case 'dedup': case 'dedupe': case 'uniq': return { type: 'dedup' };
    case 'reopen': case 'undo': case 'rouvrir': {
      // reopen 2 : la 2e page de la liste « fermés » (la plus récente = 1)
      const n = Number(sub);
      return /^\d+$/.test(sub) && n >= 1 ? { type: 'reopen', n } : { type: 'error', message: 'reopen · reopen <n> (n° dans « fermés »)' };
    }
    case 'guide': case 'customize': case 'custom': case 'personnaliser': return { type: 'page', page: 'guide', q: sub };
    case 'find-tab': case 'findtab': case 'tabs': return { type: 'page', page: 'tabs', q: arg.slice(0, 100) };
    case 'unmute': return { type: 'media', op: 'unmute', x: 0 };
    case 'private': case 'privé': case 'prive': case 'incognito': case 'inprivate': {
      const url = !arg ? '' : toUrl(arg) ?? (/^[a-z0-9-]+$/i.test(arg) ? toUrl(arg + '.com') : null) ?? searchUrl(arg, engine);
      return { type: 'private', url: url ?? '' };
    }
    case 'translate': case 'traduire': return { type: 'tool', op: 'translate' };
    case 'archive': return { type: 'tool', op: 'archive' };
    case 'devtools': return { type: 'tool', op: 'devtools' };
    case 'screenshot': case 'shot': case 'capture': return { type: 'tool', op: 'shot' };
    case 'pdf': return { type: 'tool', op: 'pdf' };
    case 'restart': case 'redemarrer': return { type: 'tool', op: 'restart' };
    case 'wake': case 'reveil': return /^[0-9]+$/.test(sub) && Number(sub) >= 1 ? { type: 'tabn', op: 'wake', n: Number(sub) } : { type: 'tool', op: 'wake' };
    case 'cookies':
      if (sub === 'clear-all') return { type: 'cookies-all' };
      if (sub === 'import' || sub === 'file') return { type: 'import-cookie-file', file: subArg.replace(/^["']|["']$/g, '') };
      return sub === 'clear' || sub === 'rm' ? { type: 'tool', op: 'cookies-clear' } : { type: 'error', message: 'cookies clear (site ouvert) · cookies clear-all (tout le Space, avec confirmation) · import cookies (Opera GX)' };
    case 'cache': return sub === 'clear' ? { type: 'tool', op: 'cache-clear' } : { type: 'error', message: 'cache clear' };
    case 'alias': case 'bind': {
      // alias yt start youtube.com · alias rm yt · alias · bind alt+y start youtube.com · bind rm alt+y
      if (!rest.length || sub === 'ls') return { type: word as 'alias' | 'bind', op: 'ls', name: '', cmd: '' };
      if ((sub === 'rm' || sub === 'unset') && rest[1]) return { type: word as 'alias' | 'bind', op: 'rm', name: rest[1].toLowerCase(), cmd: '' };
      const cmd = rest.slice(1).join(' ').replace(/^=\s*/, '');
      return cmd ? { type: word as 'alias' | 'bind', op: 'set', name: sub, cmd: cmd.slice(0, 500) } : { type: 'error', message: word === 'alias' ? 'alias <nom> <commande> · alias rm <nom> · alias' : 'bind <touches> <commande> (ex. bind alt+y start youtube.com) · bind rm <touches> · bind' };
    }
    case 'unalias': return rest[0] ? { type: 'alias', op: 'rm', name: sub, cmd: '' } : { type: 'error', message: 'unalias <nom>' };
    case 'unbind': return rest[0] ? { type: 'bind', op: 'rm', name: sub, cmd: '' } : { type: 'error', message: 'unbind <touches>' };
    case 'shortcut': case 'shortcuts': case 'raccourci': {
      if (sub === 'add' && subArg) { const u = toUrl(subArg) ?? (/^[a-z0-9-]+$/i.test(subArg) ? toUrl(subArg + '.com') : null); return u ? { type: 'shortcut', op: 'add', arg: u } : { type: 'error', message: 'shortcut add <site> (ex. shortcut add twitch.tv)' }; }
      if (sub === 'rm' && /^\d+$/.test(rest[1] ?? '')) return { type: 'shortcut', op: 'rm', arg: rest[1] };
      return sub === 'ls' || !sub ? { type: 'shortcut', op: 'ls', arg: '' } : { type: 'error', message: 'shortcut add <site> · shortcut rm <n> · shortcut ls' };
    }
    case 'source': case '.': return { type: 'source', file: arg.replace(/^["']|["']$/g, '') };
    case 'autorun': return { type: 'settings-op', op: 'autorun' };
    case 'ui':
      if (sub === 'hide' || sub === 'show') return rest[1] ? { type: 'ui', op: sub, part: rest[1].toLowerCase() } : { type: 'error', message: `ui ${sub} <élément> · ui ls pour la liste` };
      return sub === 'reset' ? { type: 'ui', op: 'reset', part: '' } : { type: 'ui', op: 'ls', part: '' };
    case 'reset': return sub === 'settings' ? { type: 'settings-op', op: 'reset' } : { type: 'error', message: 'reset settings (tous les réglages par défaut)' };
    case 'ext': case 'extension': case 'extensions': {
      if (!sub || sub === 'ls') return { type: 'page', page: 'ext' }; // page Extensions (comme chrome://extensions, en terminal) ; « ext ls » = la même page
      if (sub === 'add') return { type: 'ext', op: 'add', n: 0 }; // la liste : page « ext »
      if (sub === 'store' || sub === 'install') return { type: 'ext', op: 'store', n: 0, arg: subArg.trim() }; // sans argument : ouvre le Store, ou installe l'extension de la page ouverte
      const n = Number(rest[1]);
      return (sub === 'rm' || sub === 'on' || sub === 'off' || sub === 'update' || sub === 'open') && Number.isInteger(n) && n >= 1 ? { type: 'ext', op: sub, n } : { type: 'error', message: 'ext · ext store [nom] · ext add · ext open|rm|on|off|update <n>' };
    }
    case 'mod': case 'mods': {
      const name = (rest[1] ?? '').toLowerCase();
      if (sub === 'ls' || sub === 'folder' || sub === 'reload' || (!sub && word === 'mods')) return { type: 'mod', op: sub === 'folder' || sub === 'reload' ? sub : 'ls', name: '' };
      if (sub === 'import') return { type: 'mod', op: 'import', name: subArg.replace(/^["']|["']$/g, '') }; // chemin du fichier (vide : fenêtre de choix)
      // mod new sound <nom> : mod de sons d'exemple (sons synthétisés, prêts à remplacer)
      if (sub === 'new' && name === 'sound') return /^[a-z0-9_-]{1,40}$/.test((rest[2] ?? '').toLowerCase()) ? { type: 'mod', op: 'new-sound', name: rest[2].toLowerCase() } : { type: 'error', message: 'mod new sound <nom>' };
      if ((sub === 'new' || sub === 'on' || sub === 'off' || sub === 'edit' || sub === 'rm') && /^[a-z0-9_-]{1,40}$/.test(name)) return { type: 'mod', op: sub, name };
      return { type: 'error', message: 'mod ls · mod new <nom> · mod new sound <nom> · mod import [.css, dossier, .zip ou .crx Opera GX] · mod edit|on|off|rm <nom> · mod reload · mod folder' };
    }
    case 'cd':
      if (arg === '..' || arg === '-') return { type: 'tab', op: 'back' };
      if (arg === '+') return { type: 'tab', op: 'forward' };
      return { type: 'space', op: 'go', arg };
    case 'mkdir': return arg ? { type: 'folder', op: 'new', arg } : { type: 'error', message: 'mkdir <nom du dossier>' };
    case 'r': case 'reload': return sub === 'all' || sub === 'tout' ? { type: 'reload-all' } : { type: 'tab', op: 'reload' };
    case 'pin': case 'unpin': case 'epingler': {
      const n = Number(sub);
      return /^\d+$/.test(sub) && n >= 1 ? { type: 'tabn', op: word === 'unpin' ? 'unpin' : 'pin', n } : { type: 'error', message: `${word} · ${word} <n>` };
    }
    case 'info': return { type: 'info' };
    case 'fold': return arg ? { type: 'tabfold', name: arg.trim().slice(0, 40) } : { type: 'error', message: 'fold <dossier> (ranger la page dans ce dossier) · unfold' };
    case 'unfold': return { type: 'tabfold', name: '' };
    case 'fullscreen': case 'pleinecran': return { type: 'win', op: 'full' };
    case 'ontop': case 'premierplan': return { type: 'win', op: 'ontop' };
    case 'downloads': case 'telechargements': return { type: 'downloads' };
    case 'home': case 'accueil': return { type: 'home' };
    case 'default-browser': case 'defaut': return { type: 'default-browser', off: sub === 'off' };
    case 'net-check': case 'netcheck': case 'myip': return { type: 'net-check' };
    case 'https-allow': case 'http-allow': {
      if (!sub || sub === 'ls') return { type: 'https-allow', op: 'ls', site: '' };
      if ((sub === 'add' || sub === 'rm') && rest[1]) return { type: 'https-allow', op: sub, site: rest[1] };
      return { type: 'error', message: 'https-allow add <site> · https-allow rm <site> · https-allow ls' };
    }
    case 'blocklist': case 'blocklists': {
      // Activer / désactiver : set blocklist true|false. Ici : exceptions (sites non bloqués).
      if (sub === 'allow' && rest[1]) return { type: 'blocklist-allow', op: 'add', site: rest[1] };
      if (sub === 'rm' && rest[1]) return { type: 'blocklist-allow', op: 'rm', site: rest[1] };
      if (sub === 'ls' || sub === 'allow' || !sub) return { type: 'blocklist-allow', op: 'ls', site: '' };
      return { type: 'error', message: 'blocklist allow <site> · blocklist rm <site> · blocklist ls · (activer : set blocklist true)' };
    }
    case 'update': case 'maj': return { type: 'update', install: sub === 'install' };
    case 'pastego': case 'paste': return { type: 'pastego' };
    case 'clip':
      return sub === 'title' || sub === 'titre' ? { type: 'clip', what: 'title' } : sub === 'md' || sub === 'markdown' ? { type: 'clip', what: 'md' } : { type: 'error', message: 'clip · clip title · clip md' };
    case 'bm': case 'bookmark': case 'bookmarks': case 'favoris': {
      // bm (liste) · bm <mots> · bm add [nom] · bm add <adresse> [nom] · bm rm <n> · bm open <n>
      if (sub === 'add') {
        const url = toUrl(rest[1] ?? '');
        return { type: 'bm', op: 'add', arg: url ?? '', name: (url ? rest.slice(2) : rest.slice(1)).join(' ').slice(0, 80) };
      }
      if ((sub === 'rm' || sub === 'open') && /^\d+$/.test(rest[1] ?? '')) return { type: 'bm', op: sub, arg: rest[1], name: '' };
      return { type: 'page', page: 'bookmarks', q: arg.slice(0, 100) };
    }
    case 'perm': case 'permission': {
      // perm allow <site> <droit> · perm deny <site> <droit> · perm ls
      if (!sub || sub === 'ls') return { type: 'perm', op: 'ls', site: '', perm: '' };
      if ((sub === 'allow' || sub === 'deny') && rest[1] && rest[2]) return { type: 'perm', op: sub, site: rest[1], perm: rest[2].toLowerCase() };
      return { type: 'error', message: 'perm allow|deny <site> <camera|microphone|notifications|geolocation|clipboard|storage|midi> · perm ls' };
    }
    case 'session': {
      if (!sub || sub === 'ls') return { type: 'session', op: 'ls', name: '' };
      const name = (rest[1] ?? '').toLowerCase();
      return (sub === 'save' || sub === 'load' || sub === 'rm') && /^[a-z0-9_-]{1,40}$/.test(name) ? { type: 'session', op: sub, name } : { type: 'error', message: 'session save|load|rm <nom> · session ls' };
    }
    case 'back': return { type: 'tab', op: 'back' };
    case 'forward': return { type: 'tab', op: 'forward' };
    case 'sleep':
      if (/^\d+$/.test(sub) && Number(sub) >= 1) return { type: 'tabn', op: 'sleep', n: Number(sub) };
      if (sub === 'others' || sub === 'all' || sub === 'tout') return { type: 'tab', op: 'sleep-others' };
      if (sub === 'tab' || sub === 'page') return { type: 'tab', op: 'sleep-current' };
      if (sub === 'never' || sub === 'jamais') {
        const op = (rest[1] ?? 'ls').toLowerCase();
        if (op === 'ls') return { type: 'sleep-never', op: 'ls', site: '' };
        if ((op === 'add' || op === 'rm') && rest[2]) return { type: 'sleep-never', op, site: rest[2] };
      }
      return { type: 'error', message: 'sleep · sleep all · sleep tab · sleep never add|rm|ls <site>' };
    case 'space':
      if (sub === 'new' || sub === 'rename') return subArg ? { type: 'space', op: sub, arg: subArg } : { type: 'error', message: `space ${sub} <nom>` };
      if (sub === 'delete') return { type: 'space', op: 'delete', arg: subArg };
      if (sub === 'sleep' || sub === 'clear') return { type: 'space', op: sub, arg: '' };
      if (sub === 'fold' || sub === 'unfold') return { type: 'space', op: sub, arg: subArg.trim().toLowerCase() === 'all' ? 'all' : '' };
      if (sub === 'move') return /^\d+$/.test(subArg.trim()) ? { type: 'space', op: 'move', arg: subArg.trim() } : { type: 'error', message: 'space move <place> (le Space actif ; 1 = en haut)' };
      if (sub === 'color' || sub === 'couleur') return subArg ? { type: 'space', op: 'color', arg: subArg.trim() } : { type: 'error', message: 'space color #rrggbb (Space actif) · space color default' };
      return arg ? { type: 'space', op: 'go', arg } : { type: 'error', message: 'space <nom|numéro>|new|rename|delete' };
    case 'folder':
      if ((sub === 'new' || sub === 'rename') && subArg) return { type: 'folder', op: sub, arg: subArg };
      if (sub === 'delete') return { type: 'folder', op: 'delete', arg: subArg };
      return { type: 'error', message: 'folder new <nom>|rename <nom>|delete' };
    case 'set':
      return rest.length >= 2 ? { type: 'set', key: sub, value: subArg } : { type: 'error', message: 'set <réglage> <valeur> ex. set theme vert' };
    case 'view': case 'mode':
      return sub === 'text' || sub === 'texte' ? { type: 'view', mode: 'text' } : sub === 'web' ? { type: 'view', mode: 'web' } : { type: 'error', message: 'view text|web (pour ce site)' };
    case 'play': case 'lecture': return { type: 'media', op: 'play', x: 0 };
    case 'pause': return { type: 'media', op: 'pause', x: 0 };
    case 'mute': case 'muet':
      if (/^\d+$/.test(sub) && Number(sub) >= 1) return { type: 'tabn', op: 'mute', n: Number(sub) };
      return sub === 'all-but-current' || sub === 'others' || sub === 'autres' ? { type: 'media', op: 'mute-others', x: 0 } : { type: 'media', op: 'mute', x: 0 };
    case 'full': case 'plein': return { type: 'media', op: 'full', x: 0 };
    case 'seek': case 'aller': {
      const m = /^([+-])?(?:(\d+):)?(\d+)$/.exec(arg.trim());
      if (!m) return { type: 'error', message: 'seek 1:30 · seek +10 · seek -10' };
      const secs = Number(m[2] ?? 0) * 60 + Number(m[3]);
      return m[1] ? { type: 'media', op: 'fwd', x: m[1] === '-' ? -secs : secs } : { type: 'media', op: 'seek', x: secs };
    }
    case 'settings':
      if (sub === 'export') return { type: 'settings-op', op: 'export' };
      if (sub === 'reset') return { type: 'settings-op', op: 'reset' };
      return { type: 'page', page: 'settings' };
    case 'help':
      return { type: 'page', page: word };
    case 'history':
      if (sub === 'clear' || sub === 'effacer') return { type: 'history-clear' };
      if (sub === 'rm' || sub === 'del') {
        // history rm 3 5-8 (numéros de la page history) · history rm youtube.com (tout un site)
        const ns: number[] = [];
        for (const p of rest.slice(1)) {
          const m = /^(\d+)(?:-(\d+))?$/.exec(p);
          if (!m) return rest.length === 2 && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(p) ? { type: 'history-rm', ns: [], site: p.toLowerCase() } : { type: 'error', message: 'history rm 3 5-8 · history rm youtube.com · Ctrl+clic puis Suppr dans la page history' };
          for (let k = Number(m[1]); k <= Number(m[2] ?? m[1]) && ns.length < 5000; k++) ns.push(k);
        }
        return ns.length ? { type: 'history-rm', ns, site: '' } : { type: 'error', message: 'history rm 3 5-8 · history rm youtube.com' };
      }
      return { type: 'page', page: 'history', q: arg.slice(0, 100) };
    case 'eco': return { type: 'set', key: 'eco', value: sub };
    case 'sidebar': case 'side':
      if (sub === 'add' || sub === 'rm' || sub === 'remove') return subArg ? { type: 'sidebar', op: sub === 'add' ? 'add' : 'rm', arg: subArg.toLowerCase() } : { type: 'error', message: `sidebar ${sub} <bouton> · sidebar ls pour la liste` };
      if (sub === 'ls' || sub === 'on' || sub === 'off') return { type: 'sidebar', op: sub, arg: '' };
      if (sub === 'order' && subArg) return { type: 'sidebar', op: 'order', arg: subArg.toLowerCase().replace(/\s+/g, '') };
      if (sub === 'move' && rest[1] && /^\d+$/.test(rest[2] ?? '')) return { type: 'sidebar', op: 'move', arg: rest[1].toLowerCase(), n: Number(rest[2]) };
      return { type: 'error', message: 'sidebar add|rm <bouton> · sidebar move <bouton> <n> · sidebar order a,b,c · sidebar ls · sidebar on|off' };
  }
  const url = toUrl(input);
  return { type: 'navigate', url: url ?? searchUrl(input, engine), newTab: false };
}
