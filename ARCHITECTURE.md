# Architecture — navigateur_mini

Document de référence. Il explique les choix techniques avant d'écrire du code.
Rien n'est construit tant que ce document n'est pas validé.

## 1. Pile technique

| Élément | Choix | Pourquoi |
|---|---|---|
| Moteur | Electron 44.x (dernière stable vérifiée : 44.9.0) | Chromium à jour, pas de moteur maison. |
| Langage | TypeScript 7 | Erreurs détectées avant l'exécution. |
| Outil de build | Vite 8 | Rapide, rechargement à chaud pour l'interface. |
| Interface | TypeScript + CSS natif, sans framework | Démarrage rapide, peu de RAM, moins de dépendances à surveiller. |
| Stockage | Fichiers JSON (réglages, session) + `node:sqlite` intégré (historique, favoris) | Aucune dépendance de base de données à ajouter. |
| Bloqueur | `@ghostery/adblocker-electron` | Demandé, maintenu. |
| Extensions | `electron-chrome-extensions` | Demandé. Support partiel (voir §8). |
| Installeur / MAJ | `electron-builder` + `electron-updater` | Standard pour Windows. |

Toutes les versions sont verrouillées (`package-lock.json`, versions exactes sans `^`).

## 2. Processus et fenêtres

Electron sépare le code en processus isolés. C'est la base de la sécurité.

```
Processus principal (main, Node.js, accès disque)
│  - seul processus de confiance
│  - gère onglets, Spaces, stockage, IPC, permissions, téléchargements
│
└── BaseWindow (la fenêtre Windows)
     ├── WebContentsView "interface" : tout l'écran terminal (ligne d'état, pages,
     │                                  texte de la page, invite ORION>, dialogues)
     └── WebContentsView "onglet"    : un par onglet actif (sites web, non fiables)
```

Mise à jour (design Phosphore v2 · Terminal) : il n'y a plus de vue "overlay"
séparée. L'interface est une seule vue, qui passe au-dessus du site quand elle
affiche des suggestions. Les demandes du navigateur s'affichent dans l'invite,
qui porte le sceau choisi (ex. `ORION>`) : un site ne peut jamais écrire dedans.

- Les sites ne peuvent pas dessiner dans la vue "interface" : ce sont des
  processus séparés. Un site ne peut donc pas imiter une demande du navigateur.
- L'interface charge des fichiers locaux de l'application
  (protocole interne `app://`), jamais une URL web.

### Mode web (par défaut) et mode texte

- **Mode web** (par défaut) : la vraie page, intacte, sans filtre (seuls les
  Shorts sont masqués sur YouTube). L'interface imite Windows Terminal /
  PowerShell en mode sombre : onglets en haut, barre d'adresse (recherche Google
  par défaut), site encadré, invite de commandes en bas (`PS SCEAU:\space>`).
  Le sceau, mot secret tiré au hasard, prouve que l'invite vient du navigateur :
  le site ne peut pas l'imiter. `nativeTheme` est en sombre : les sites qui ont
  un thème sombre l'utilisent.
- **Propositions de recherche** : pendant la frappe dans la barre du haut, le
  texte est envoyé à `suggestqueries.google.com` (session en mémoire, sans les
  cookies des Spaces). Seule exception à « aucune donnée hors du PC », demandée
  explicitement ; `set suggestions non` la coupe.
- **Mode texte** (`view text`, par site, optionnel) : le vrai site tourne dans Chromium, en coulisse (largeur
  virtuelle de 1280 px). Un script injecté dans un *monde isolé* (le site ne le
  voit pas et ne peut pas le modifier) convertit la page en lignes : titres,
  paragraphes, liens `[n]`, boutons `‹…›`, champs `[…]`, images et vidéos.
  Le processus principal *interroge* la page toutes les 350 ms : la page ne peut
  rien envoyer d'elle-même. Les lignes sont vérifiées (types, tailles) puis
  affichées avec `textContent` uniquement.
- **Panneau SORTIE** : quand une vidéo ou une image importante est choisie, la
  vraie page est montrée dans un cadre à droite, avec seulement ce média en
  vedette (CSS). La lecture vidéo, les DRM et les connexions restent ceux de Chromium.
- **Actions** : Entrée = clic dans la vraie page (compté comme un geste réel) ;
  un champ = saisie dans l'invite, puis le texte est tapé dans le vrai champ
  (`insertText`). Les mots de passe sont masqués dans l'invite.
- `view web` remet un site en mode web.
- Un onglet en veille n'a plus de vue : on garde seulement URL, titre, favicon.

## 3. Organisation des dossiers

```
src/
  main/            processus principal (Node)
    index.ts       démarrage, fenêtre
    tabs.ts        onglets (ouvrir, fermer, ordre, épingle, veille)
    spaces.ts      Spaces et partitions
    ipc.ts         tous les canaux IPC + validation
    security.ts    permissions, navigation, CSP, HTTPS-Only
    store.ts       lecture/écriture JSON atomique
    ...            (un fichier par fonctionnalité, ajoutés phase par phase)
  preload/
    ui.ts          pont minimal pour l'interface (contextBridge)
  ui/              interface (HTML + CSS + TS), servie dans "chrome" et "overlay"
    tokens.css     variables CSS copiées telles quelles depuis /design
design/            fichiers Claude Design (à fournir, voir §11)
tests/
```

Les onglets web n'ont **aucun preload** : rien n'est exposé aux sites.

## 4. Sécurité (appliquée dès la phase 1)

Réglages forcés sur **toutes** les vues :
`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
`webSecurity: true`, pas de `<webview>`.

- **IPC** : une liste fermée de canaux. Chaque message vérifie l'expéditeur
  (doit être la vue "chrome" ou "overlay", jamais un onglet) et le contenu
  (types, longueurs, valeurs autorisées). Message invalide = ignoré + refus.
- **Code** : pas de `eval`, pas de `innerHTML` avec des données non fiables
  (on utilise `textContent` et `createElement`).
- **CSP de l'interface** : `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
- **Navigation** : seuls `http`, `https` et les pages internes sont autorisés.
  `file://` bloqué. Protocoles externes (`mailto:`, `steam:`…) : dialogue de
  confirmation avant `shell.openExternal`. `window.open` non désiré : refusé
  ou converti en nouvel onglet après geste utilisateur.
- **Permissions** : caméra, micro, géolocalisation, notifications,
  presse-papiers refusés par défaut, demandés par dialogue "overlay",
  mémorisés par site et par Space.
- **HTTPS-Only** : `http://` remplacé par `https://` ; si échec, page
  d'avertissement avec choix explicite.
- **Certificat invalide** : page d'erreur claire, pas de contournement silencieux.
- **Sites malveillants** : liste locale (voir §9, point télémétrie).
- **Electron Fuses** (phase 3 et build) : `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off,
  `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on,
  `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on.
- **Revue** : à la fin de chaque phase, passage sur la checklist officielle
  "Electron Security" (20 points) avec l'état de chaque point.

## 5. Données et Spaces

- Chaque Space a sa partition : `persist:space-<id>`. Cookies, cache et
  stockage sont séparés. Un site connecté dans "École" n'est pas connecté dans "Perso".
- Fichiers dans `%APPDATA%/navigateur_mini/` :
  `settings.json`, `session.json` (onglets, dossiers, Spaces),
  `data.sqlite` (historique, favoris), `vault.bin` (mots de passe chiffrés).
- Écriture atomique (fichier temporaire puis renommage) pour ne jamais
  corrompre la session en cas de crash.
- Au démarrage, les onglets restaurés ne chargent rien tant qu'on ne les ouvre
  pas (lazy loading).

## 6. Barre de commande

Une seule saisie remplace la barre d'adresse (raccourci `Ctrl+L` / `Ctrl+K`).
Elle détecte :
- une URL (`exemple.com`, `https://…`) : ouverture ;
- une commande (`open`, `search`, `tab`, `space`, `folder`, `settings`, `history`) ;
- sinon : recherche avec le moteur choisi dans les réglages.

## 7. Connexion Google / YouTube

Google refuse parfois la connexion si le navigateur s'annonce comme
"Electron". Solution propre, testée dès la phase 1 :
- User-Agent identique à Chrome de même version (on retire `Electron/x`
  et le nom de l'appli) ;
- pas d'injection de script sur `accounts.google.com`.
Google bloque quand même Electron déguisé en Chrome : sur `accounts.google.com`
seulement, l'appli se présente en Firefox (User-Agent en-tête + `navigator`,
client hints retirés). Code : `userAgentFor` dans `src/main/security.ts`.

## 8. Limites connues (dites honnêtement dès maintenant)

- **Extensions** : `electron-chrome-extensions` couvre une partie de l'API
  Chrome. Les extensions simples (uBlock Origin Lite, Dark Reader, gestionnaires
  de styles) ont de bonnes chances. Celles qui dépendent du Chrome Web Store,
  de la synchronisation de compte Google, de `chrome.identity` ou d'API rares
  marcheront mal ou pas. La liste testée sera publiée en phase 6.
- **Windows Hello** : Electron ne fournit pas d'API Windows Hello sous Windows
  (seulement Touch ID sur Mac). Il faudra un petit module natif. Le mot de
  passe principal marche sans, Windows Hello sera ajouté en option en phase 5.
- **Cookies Chrome récents (v20, "App-Bound")** : non importables, par choix.
  Aucun contournement. Message clair + proposition d'importer les mots de passe.
  Edge, Opera, Brave (selon versions) utilisent encore souvent v10 : importables.
- **Styles rétro** : "ne jamais casser un site" ne peut pas être garanti à 100 %
  sur tout le web. Mesures : styles limités à l'apparence (couleurs, polices,
  bordures), jamais `display:none` sur un élément interactif, désactivation en
  un clic par site.
- **Signature de l'installeur** : il faut un certificat de signature de code
  Windows (payant, environ 100 à 400 € par an, ou Azure Trusted Signing).
  Sans lui, Windows SmartScreen affiche un avertissement et les MAJ ne sont pas vérifiables.
- **Mode jeu** : Electron ne peut pas plafonner la RAM de Chromium. Le mode jeu
  met en veille les onglets en arrière-plan, réduit les animations et la
  fréquence de rafraîchissement des onglets cachés.

## 9. Réseau et télémétrie

Aucune télémétrie, aucune donnée personnelle envoyée. Seules ces requêtes sortent,
toutes désactivables dans les réglages :
- téléchargement des listes du bloqueur de pubs ;
- téléchargement de la liste locale de sites malveillants (aucune URL visitée
  n'est envoyée — c'est pourquoi on n'utilise pas l'API Google Safe Browsing) ;
- vérification des mises à jour (vers le serveur de releases choisi, par ex. GitHub Releases).

## 10. Import des cookies (phase 5)

Tout dans le processus principal, déclenché uniquement par un clic.

1. Détection du navigateur source ; s'il est ouvert, demande de le fermer.
2. Chromium (Opera GX, Opera, Edge, Brave, Chrome) : lecture de `Local State`
   (clé `encrypted_key`), déchiffrement DPAPI pour **le compte Windows courant**
   (via PowerShell `ProtectedData.Unprotect` passé par l'entrée standard, aucun
   fichier), puis AES-256-GCM avec `node:crypto` sur les cookies `v10`.
   Cookies `v20` : arrêt + message (§8).
3. Firefox / Zen : lecture directe de `cookies.sqlite`.
4. Lecture SQLite en lecture seule avec `node:sqlite`, sans copie temporaire.
5. Écran de choix des domaines (case "tout sélectionner") + choix du Space.
6. `session.cookies.set` en gardant domain, path, secure, httpOnly, sameSite,
   expiration. Cookies expirés ignorés.
7. Valeurs et clé effacées (`Buffer.fill(0)`) à la fin. Aucune valeur dans
   les logs ou la console.
8. Résumé : nombre de cookies par site + erreurs.
9. Tests avec faux profils générés (fausse clé, faux cookies).

L'import CSV (mots de passe, favoris, historique) suit la même règle : local,
manuel, et suppression du CSV seulement après ta confirmation.

## 11. Ce qu'il me manque

- **Le dossier `/design` est absent** du projet. Il faut y copier les fichiers
  Claude Design (maquettes, design system, variables CSS) avant que je construise
  l'interface. En attendant, la phase 1 peut avancer avec une interface neutre
  qui sera habillée dès réception des fichiers.

## 12. Phases

1. Architecture + fenêtre + onglets + barre de commande + test connexion Google.
2. Spaces + dossiers + session restaurée.
3. Sécurité complète + bloqueur de pubs + fuses.
4. Paramètres + favoris + historique + téléchargements.
5. Import (CSV + cookies) + gestionnaire de mots de passe.
6. Extensions.
7. Styles rétro + intégration finale du design.
8. Optimisation, tests, installeur signé, mises à jour automatiques, page Performances.

À la fin de chaque phase : ce qui est fait, comment tester, ce qui reste,
revue de sécurité.

## Version installable

- `npm run dist` → `release/Phosphore Setup 0.1.0.exe` (installeur NSIS, par utilisateur).
- Electron Fuses appliqués à la fabrication : RunAsNode, NODE_OPTIONS et `--inspect` désactivés ;
  chiffrement des cookies, vérification d'intégrité de l'ASAR et chargement depuis l'ASAR seulement activés.
- La version installée refuse `--remote-debugging-port`, `--remote-debugging-pipe` et `--inspect` (arrêt immédiat).
- Pas de certificat de signature : Windows SmartScreen affiche un avertissement au premier lancement.
- Extensions (`ext add`) : dossier d'extension Chrome décompressée, chargé dans chaque Space via
  `session.extensions`. Scripts de contenu et règles : oui. Boutons, fenêtres et pages d'options : non.
- Mods (`mod new`) : fichiers CSS dans `%APPDATA%\Phosphore\mods`, ligne `/* @match site.com */` facultative.

## Mots de passe (coffre)

- `import passwords` : l'utilisateur choisit un fichier CSV qu'il a lui-même exporté d'un autre navigateur
  (Chrome/Edge/Opera : Paramètres → Mots de passe → Exporter, protégé par le mot de passe Windows).
  Phosphore n'ouvre jamais la base chiffrée d'un autre navigateur ; il ne lit que ce CSV fourni.
- Chaque mot de passe est chiffré un par un avec `safeStorage` (DPAPI) dans `passwords.json` ; le fichier ne
  contient aucun mot de passe en clair, et la liste (`pass ls`) n'a pas besoin de les déchiffrer.
- Après l'import, Phosphore propose de supprimer le CSV en clair (avec l'accord de l'utilisateur).
- `pass copy <n>` / `pass user <n>` : copie dans le presse-papiers, effacé après 30 s ; jamais affiché à l'écran.
- `pass forget` : vide le coffre. Déchiffrement lié au compte Windows (DPAPI).
- `import cookies` : reprend les cookies d'Opera GX (profil Default, Opera fermé) dans le Space actif
  (ou dans `perso` si `set spaces true`). Clé DPAPI + AES-256-GCM v10 (`src/main/cookies.ts`). v20, expirés et partitionnés ignorés.
- Recherche par défaut : DuckDuckGo. Propositions depuis le moteur choisi (DuckDuckGo /ac/ ou Google), session en mémoire.
