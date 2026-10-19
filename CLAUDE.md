# Phosphore — personal Electron browser (French UI)

Architecture and security rules: `ARCHITECTURE.md`. Tests: `npm test`. Build + run: `npm start` (or `Phosphore.bat`).

## Answering "how do I customise X?"

Everything the user can change is a command typed in the bottom prompt. Prefer giving a command over editing code.
Reply with the exact command(s) to type. Full list in the app: `man`; current values: `settings`.

### Settings (`set <key> <value>`, saved in `%APPDATA%\Phosphore\settings.json`)

| key | values | effect |
|---|---|---|
| theme | white, green, amber | colour theme |
| size | s, m, l, xl | text size |
| animations, boot, suggestions, eco | true / false | |
| search | duckduckgo, google, bing, brave | search engine |
| lang | fr, en, es, en-US… | language asked of websites + date format (UI text stays French) |
| newpage | any of `clock,date,shortcuts,recent,hint`, or `none`, `default` | blocks on the new page. "remove the text on the new page" → `set newpage clock` (or `none`) |
| closed-max | 0-25 | items in the sidebar "fermés" list (`sidebar rm closed` removes the list) |
| sidebar-width | 110-480 | sidebar width (the user can also drag its edge) |
| unload-spaces | true / false | switching Space puts other Spaces' tabs to sleep (except tabs playing audio) |
| unload-delay | 0-120 | minutes outside the active Space before that sleep (0 = immediately). One timer per tab, cancelled on return / when audio starts, restarted when audio stops |
| idle-sleep | 0-1440 (default 30) | sleep any tab not shown for N minutes (0 = never); never the shown tab, audio tabs, sleep-never sites |
| eco-sleep | 1-1440 (default 5) | same, in eco mode |
| sleep-pinned | true / false (default true) | pinned tabs can be auto-slept |
| sleep-never | `site,site` or `none` | sites never slept nor auto-closed (also `sleep never add|rm|ls <site>`) |
| sleep-mark | true / false (default true) | sleeping tabs dimmed + "zz" in the sidebar (class `.row.asleep` for mods) |
| close-idle | 0-10080 | close (to "fermés") unpinned tabs of inactive Spaces not seen for N minutes; never audio tabs, never a Space's last tab |
| dedupe-on-open | true / false | opening an address already open in the Space jumps to that tab |
| autoplay-mute | true / false | background tabs that start playing are muted (unmuted when shown) |
| restore | last, home, none | at startup: last session, one new page, or nothing (pinned tabs and folders always kept) |
| newtab | end, next | new tab at the end of the list, or after the current tab |
| color | `<name> #rrggbb` or `<name> default` | names: bg fg strong accent yellow green red cyan gray sel side tabbar clock private space1…space6, or `spaces` (all six). Ex: `set color clock #ffffff` |
| css | `--<variable> <value>` or `--<variable> default` | ANY CSS variable of the UI (see `:root` in `src/ui/style.css`, e.g. `--bg-2`, `--line`; `--side-w` refused: use `set sidebar-width`). Applied last, wins over everything. No `; { } < > url()` |
| text | `<key> <text>` or `<key> default` | UI labels: brand closed history settings help perf new eco empty newtab-title placeholder (`{engine}`) hint newpage-hint open-verb private-badge boot-title |
| sidebar-side | left, right | sidebar position |
| zoom | 25-500 (default 100) | default zoom of every page (per-page `zoom` is kept on resize) |
| download-dir | full Windows path or `default` | downloads folder |
| download-ask | true / false (default true) | ask where to save, or save directly (no overwrite) |
| proxy | `host:port`, `http://…`, `socks5://host:port` (`socks5h://` accepted, DNS goes through the proxy either way), `none` | proxy for every session (none = Windows proxy) |
| home | address or `none` | home page (`home` command, `set restore home`) |
| clear-history-on-exit | true / false | history wiped when Phosphore closes |
| https-only | true / false (default true) | force `https://` (http pages retried in https); localhost/private IPs exempt; exceptions with `https-allow <site>` |
| privacy | strict / normal (default normal) | strict: cross-site referrer trimmed to origin, WebRTC public interface only, no DNS prefetch. **Not Tor** (no network anonymity) |
| safebrowsing | true / false (default true) | warn + block known phishing/malware domains (local lists Phishing.Database + URLhaus, matched by domain only, never sends URLs); exception: `blocklist allow <site>` |
| blocklist | true / false (default false) | block ads/trackers (local StevenBlack hosts list); exception: `blocklist allow <site>` |
| update-check | true / false (default true) | at startup (≤1×/day) warn if the embedded Electron/Chromium is behind the latest stable |
| sound | true / false (default true) | interface sounds of the active sound mod (eco mode mutes too) |
| sound-volume | 0-100 (default 40) | sound volume |
| font | font name or `default` | UI font |
| prompt | text with `{user}` `{space}`, or `default` | prompt string |
| profile, seal | text | user name in the prompt, security seal |
| spaces | true / false | one cookie jar shared by all Spaces |
| images | tint, hide, normal | images in text mode |

`reset settings` restores defaults (keeps extensions, mods, profile).

### Other customisation commands

- `sidebar add|rm <history|settings|help|perf|eco|closed|new|clock>`, `sidebar move <button> <place>`, `sidebar order a,b,c` (or `none`), `sidebar on|off`; buttons can also be dragged
- `ui hide|show <part>`, `ui ls`, `ui reset` — parts: tabbar chip newbtn menu badge winbtns addr status hint prompt tree counts flags empty
- Tabs: `sleep` / `sleep all` (others), `sleep tab` (shown tab, switches to the next), `wake` (whole Space), `reopen` / `reopen <n>` (Ctrl+Shift+T), `dedupe`, `mute` / `unmute` / `mute all-but-current`, `find-tab <words>` (all Spaces, live filter in the top bar), `mv|move <n> <space>`, `mv all <space>`, `space rename <name>`, `space color #rrggbb`; `top` shows sleep duration and estimated freed memory
- Full control: `tab move <place>` / `tab move <n> <place>` / `tab up|down|first|last`, `tab rename <name>`, `rm -right|-all`, `sleep|wake|pin|unpin|mute <n>`, `r all`, `info`, `fold <folder>` / `unfold`, `start a.com b.com`, `space sleep|clear|fold|unfold [all]|move <place>`, `fullscreen`, `ontop`, `downloads`, `home`, `bm` / `bm add [name]` / `bm add <url> [name]` / `bm rm|open <n>`, `clip title|md`, `pastego`, `perm allow|deny <site> <camera|microphone|notifications|geolocation|clipboard|storage|midi>` / `perm ls` (everything else stays refused), `session save|load|rm <name>` / `session ls`, `cookies clear-all`
- Aliases: `{q}` in the alias is replaced by the rest of the line URL-encoded, `{}` raw (`alias yts start https://www.youtube.com/results?search_query={q}`)
- `a ; b` runs several commands in one line (also inside aliases, binds, files)
- `autorun` opens `%APPDATA%\Phosphore\autorun.txt`: commands run at every start
- `settings export` writes the whole configuration as a command file (`Documents\phosphore-config.txt`) that `source` reapplies
- `shortcut add <site>` / `shortcut rm <n>` / `shortcut ls` — new-page shortcuts, opened with Alt+1-9 (pinned tabs come first)
- `alias <name> <command>` / `alias rm <name>` — custom commands (one level, extra words appended)
- `bind <keys> <command>` / `bind rm <keys>` — keyboard shortcuts; Ctrl or Alt required except F1-F24 (e.g. `bind alt+y start youtube.com`)
- `source <file>` — runs a text file of commands, one per line, `#` = comment. Best way to hand the user a ready-made configuration: write a `.txt` file of commands and tell them `source C:\path\file.txt`.
- Security/network commands: `net-check` (public IP seen by the web, to verify the proxy), `update` (looks for a new Phosphore release on GitHub, downloads it, installs on close; also compares embedded Electron to latest stable) / `update install` (restart now to install), `https-allow add|rm|ls <site>`, `blocklist allow|rm|ls <site>`, `default-browser` / `default-browser off` (registry registration + Windows default-apps dialog).
- `import cookies [chrome|edge|brave|opera|operagx|vivaldi]` — take over another Chromium browser's logins; no browser named → a picker lists the installed ones. Close the source browser first. Firefox is not supported (different cookie format).
- `cookies import [path]` (= `import cookies file`) — pick ANY cookie file: `cookies.txt` (Netscape, any browser), a Chromium `Cookies` SQLite (its `Local State` key is found in parent folders), or Firefox `cookies.sqlite`. Chrome/Edge/Brave 127+ store logins as **v20** (app-bound encryption): unreadable outside that browser → export a `cookies.txt` with the "Get cookies.txt LOCALLY" extension in that browser, then `cookies import`. Opera GX cookies are v10 and import directly.
- Mouse back/forward buttons (X1/X2) go back/forward in the shown page.

## Releasing / auto-update

Installed Phosphore checks GitHub Releases (`virrrresque/phosphore`, public) at every start when `update-check` is true (electron-updater): new version downloaded in the background, installed when Phosphore closes (`update install` = now). To publish a version: commit everything, then `npm run release` (tests, version +1 with commit + tag, build, push, then `gh release create` with the installer, its .blockmap, latest.yml and SHA256SUMS.txt; if the upload fails, `node scripts/release.mjs --upload` resends them). Needs `gh auth login` once (token read with `gh auth token`, never packaged). `npm run dist` builds locally without publishing.

## Updating the embedded Chromium

Chromium is frozen to the Electron version until rebuilt. To update: in the project folder run `npm run update-electron` (= `npm install electron@latest --save-dev` + `npm test` + `npm run dist`), commit, then `npm run release` so installed copies update themselves. `npm run dist` also writes `release\SHA256SUMS.txt` (verify with `Get-FileHash`). No code signing without a paid certificate: the installer stays "unknown publisher".

## Passwords

No built-in password manager UI. Use `import passwords` (CSV from another browser) + `pass ls|copy|user`, or an external manager.

**Bitwarden** (and other extensions whose UI is a toolbar popup): install it (`ext store`), then `ext open <n>` (or the `[ouvrir]` button on the `ext` page) opens the extension's popup/options page **in a tab** — log in there; its page-autofill content scripts work separately. This works because `ext open` loads the `chrome-extension://<id>/<default_popup>` page internally (sites still can't navigate to `chrome-extension://`). The toolbar button/badge itself is still absent.

`ext open` is also how any extension's popup or options page is reached (Electron doesn't render toolbar popups). Alternative: Bitwarden **web vault** (vault.bitwarden.com), or KeePassXC.

### Mods (CSS)

Files in `%APPDATA%\Phosphore\mods\<name>.css`. Optional first line: `/* @match youtube.com, twitch.tv */`.
- No `@match`: applied to every website. `@match phosphore`: styles the Phosphore interface itself.
- Interface selectors: `#app` `#tabbar` `.tab` `.space-chip` `#side` `.row.space` (Space header) `.row.child` (tab row) `.row.on` `#grip` `#term` `#top` `#internal` (internal pages / new page) `.clock` `#prompt` `#msg` `#sugg`. CSS variables: see `src/ui/style.css` `:root`.
- To give the user a mod: write the `.css` file anywhere, then tell them `mod import C:\path\name.css` (copies + enables). Also `mod new|edit|on|off|rm <name>`, `mod reload`, `mod ls`.
- CSS mods contain no scripts, by design.

### Sound mods = data, not code

- Folder `%APPDATA%\Phosphore\mods\<name>\` with `mod.json` + audio files (wav/ogg/mp3). Never executed; only the main process reads and validates them, the UI receives audio bytes (no path, no URL).
- `mod.json`: `{ "name", "volume": 0-1, "sounds": { "<event>": "a.wav" | ["a.wav","b.wav"] (random variant) | { "files": ..., "volume": 0-1 } } }`.
- Events (closed list, `src/shared/sounds.ts`): key key-enter key-back key-space tab-new tab-close tab-switch space-switch page-load cmd-ok cmd-error download-done boot.
- Limits: mod.json 64 KB, 500 KB per audio file, 5 MB per mod, 8 variants per event, plain file names only (no folder, no `..`), no symlinks, archives 100 MB.
- Commands: `mod new sound <name>` (sample beeps), `mod import <folder|.zip|.crx>`, `mod on|off|rm|edit <name>`, `mod reload`, `mod ls` (type css / sons). One sound mod active at a time (CSS mods stack). `set sound true|false`, `set sound-volume 0-100`; eco mode mutes.
- Opera GX mods (`manifest.json` with `mod.payload`, schema 1 or 2) are converted in `src/main/soundmods.ts`: TYPING_LETTER/ENTER/BACKSPACE/SPACE → key/key-enter/key-back/key-space, TAB_INSERT → tab-new, TAB_CLOSE → tab-close. Everything else (music, wallpaper, theme, page_styles, cursors, shaders, CLICK, HOVER, TAB_SLASH…) is ignored and listed in the import report.

### Extensions

`ext` opens the Extensions page (installed list with clickable [activer/désactiver] [mettre à jour] [retirer], suggested extensions with [installer]).
`ext store [words]` opens Phosphore's Store menu (like `history`): search typed in the top bar, click a name to unfold its description (users, version, rating), [installer] downloads it. On a real chromewebstore.google.com extension page, a green "▶ INSTALLER DANS PHOSPHORE" badge installs it.
 `ext store <link or id>` installs directly; `ext add` loads an unpacked folder; `ext rm|on|off|update <n>`; `sidebar add ext` adds a sidebar button.
Electron runs content scripts and simple MV3 background workers; toolbar buttons/badges don't work, but an extension's popup or options page can be opened in a tab with `ext open <n>` (the `[ouvrir]` button) — that is how Bitwarden is used here.

## Customization guide

`guide` (or `guide <section>`) opens a clickable page listing everything customizable, by section; clicking a command or example puts it in the prompt. Data: `src/shared/guide.ts` — when adding a customization command or setting, add a line there too (tests check every example is a valid command).

## Command descriptions

`COMMANDS` entries are `[command, English description shown, French keywords]`; `SET_KEYS` descriptions are English, French in `SET_KEYS_FR`. The keyword search matches both languages. The rest of the UI stays French.

## Prompt completion

`src/shared/complete.ts`: after a command, its parameters are proposed (`ext rm ` → installed extensions, `set theme ` → themes, `cd ` → Spaces…);
picking one only fills the prompt, Enter again runs it. Keyword search over commands and `set` keys (`sidebar width` → `set sidebar-width`).
New command with parameters: add a case in `choicesFor`; new setting: add it to `SET_KEYS` (tests check its sample values are accepted).

## Code map

- `src/shared/command.ts` — command parser (pure, tested). New command: add the `Action` type, the `parse` case and a `COMMANDS` help line.
- `src/main/settings.ts` — `applySetting` validates every `set`; lists copied from `src/shared/types.ts` (tests check they match).
- `src/main/index.ts` — main process: `run()` executes actions; IPC with the UI is validated there.
- `src/main/browser.ts` — tabs, Spaces, private tabs (`PRIVATE_PARTITION`, in-memory, never saved).
- `src/ui/main.ts` — interface (all site text goes through `textContent`).
