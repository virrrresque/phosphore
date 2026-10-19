# Phosphore

Navigateur personnel pour Windows, basé sur Electron (Chromium), avec une interface façon terminal.
Tout se pilote depuis l'invite en bas de l'écran : on tape une commande, pas de menus.

## Installation

1. Télécharger `Phosphore Setup X.Y.Z.exe` dans les [Releases](https://github.com/virrrresque/phosphore/releases/latest).
2. Le lancer. Windows affiche « éditeur inconnu » : l'installateur n'est pas signé (pas de certificat payant).
   Vérification possible avec l'empreinte SHA-512 du fichier `latest.yml` de la release, ou :
   ```powershell
   Get-FileHash ".\Phosphore Setup X.Y.Z.exe" -Algorithm SHA256
   ```
3. Mises à jour ensuite automatiques : au démarrage, Phosphore regarde les Releases, télécharge la nouvelle version en fond et l'installe à la fermeture (`update install` pour le faire tout de suite, `set update-check false` pour désactiver).

Réglages, session, cookies et extensions sont dans `%APPDATA%\Phosphore` : une réinstallation ne les efface pas.

## Premiers pas

| Commande | Effet |
|---|---|
| `youtube.com` ou des mots | ouvrir une adresse ou chercher |
| `man` | toutes les commandes |
| `guide` | page cliquable de tout ce qui se personnalise |
| `settings` | valeurs actuelles des réglages |
| `set theme green` | thème (white, green, amber) |
| `cd <space>` | changer de Space (groupe d'onglets avec ses propres cookies, ou communs avec `set spaces true`) |
| `ext store` | installer une extension du Chrome Web Store |
| `import cookies` | reprendre les connexions d'un autre navigateur Chromium |
| `default-browser` | faire de Phosphore le navigateur par défaut |

## Sécurité et vie privée

- Sites isolés (sandbox, contextIsolation, pas de Node), permissions refusées par défaut (`perm allow` pour une exception).
- `https-only` par défaut, alerte sur les adresses trompeuses (punycode, homographes, `user@`, IP brute) et sur les formulaires de mot de passe en http.
- Anti-hameçonnage local (Phishing.Database + URLhaus) : comparaison par domaine sur l'ordinateur, aucune URL envoyée.
- Bloqueur de pubs/traqueurs optionnel (`set blocklist true`), `set privacy strict`, proxy (`set proxy socks5://…`). Ce n'est **pas** Tor.

## Limites connues

- **Connexion Google** : Google bloque souvent la connexion dans les navigateurs Electron. Contournement : se connecter dans un autre navigateur puis `import cookies` (ou `cookies import` avec un `cookies.txt`).
- Extensions : scripts de page et service workers simples ; pas de boutons de barre d'outils. Le popup d'une extension (ex. Bitwarden) s'ouvre dans un onglet avec `ext open <n>`.
- Pas de gestionnaire de mots de passe intégré : Bitwarden, KeePassXC, ou `import passwords` + `pass`.

## Développement

Prérequis : Node.js 24+, Windows.

```powershell
npm install
npm test          # tests
npm start         # compiler et lancer (ou Phosphore.bat)
npm run dist      # installateur dans release\ (sans publier)
```

Publier une version (tout doit être commité, `gh auth login` fait une fois) :

```powershell
npm run release   # tests, version +1, commit + tag, build, envoi sur GitHub Releases, push
```

Mettre à jour Chromium : `npm run update-electron`, commit, puis `npm run release`.

Documentation technique : [ARCHITECTURE.md](ARCHITECTURE.md) (choix et règles de sécurité), [CLAUDE.md](CLAUDE.md) (référence complète des commandes et réglages).
