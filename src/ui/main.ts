// Interface Phosphore v3 · PowerShell. Tout le texte passe par textContent : aucune donnée de site n'est interprétée en HTML.
import { COMMANDS, parse, searchUrl, toUrl } from '../shared/command.js';
import { COLORS, DEFAULT_PROMPT, modeOf, NEWPAGE, PARTS, TEXTS, tree, WIDGETS, type ColorName, type PageSnap, type TabItem, type TextKey, type UiState } from '../shared/types.js';
import { TextView } from './textview.js';
import { bigText } from './ascii.js';
import { keyEvent, play, setPack } from './sound.js';
import type { SoundPack } from '../shared/sounds.js';
import { complete, searchCommands, type Ctx } from '../shared/complete.js';
import { GUIDE } from '../shared/guide.js';

declare global {
  interface Window { phos: { send(m: unknown): void; on(cb: (event: string, data: unknown) => void): void } }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const send = (m: Record<string, unknown>) => window.phos.send(m);
const el = (tag: string, text = '', cls = '') => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
/** Une ligne de terminal : morceaux de texte, chacun avec sa couleur Campbell (y, g, r, cy, bc, gray, w). */
type Part = string | [string, string];
const L = (...parts: Part[]): (string | HTMLElement)[] => [...parts.map(p => typeof p === 'string' ? p : el('span', p[0], p[1])), '\n'];

const cmd = $<HTMLInputElement>('cmd');   // invite de commandes (bas)
const addr = $<HTMLInputElement>('addr'); // barre d'adresse et de recherche (haut)
type Sugg = { label: string; kind: string; fill?: string; command?: boolean; run: () => void };
let st: UiState | null = null;
let page: 'settings' | 'history' | 'help' | 'perf' | 'ext' | 'store' | 'tabs' | 'guide' | 'bookmarks' | null = null;
let bmQuery = ''; // filtre de la page des favoris
const guideOpen = new Set<string>(); // rubriques dépliées du guide
let tabQuery = ''; // find-tab : mots cherchés dans les titres et adresses de toutes les pages
type Perf = { freed: number; total: number; cpu: number; sysTotal: number; sysFree: number; eco: boolean; tabs: { id: string; title: string; space: string; mb: number; cpu: number; asleep: boolean; sleptMin: number; freed: number; timer: boolean }[]; other: { type: string; mb: number; cpu: number }[] };
let perf: Perf | null = null;
type Ext = { name: string; version: string; desc: string; dir: string; store: boolean; loaded: boolean; off: boolean };
let exts: Ext[] = [];
let mods: { name: string }[] = []; // fichiers de mods (activés ou non), pour la complétion de « mod on|off »
let storeTip = '';
// Menu Store : dernière recherche, fiches déjà lues (par identifiant), fiche ouverte, installations en cours.
type StoreItem = { id: string; name: string; rating: string };
type StoreDetail = { id: string; name?: string; summary?: string; about?: string; users?: string; version?: string; rating?: string; error?: string };
let store: { q: string; list: StoreItem[]; loading?: boolean; error?: string } = { q: '', list: [] };
const details = new Map<string, StoreDetail | 'loading'>();
let storeOpen: string | null = null;
const installing = new Set<string>(); // page du Store pour laquelle l'astuce d'installation a déjà été affichée
/** Extensions conseillées sur la page « ext » (identifiants du Chrome Web Store). */
const SUGGESTED: [string, string, string][] = [
  ['BetterTTV', 'ajopnjidmegmdimjlfnijceegpefgped', 'emotes et options en plus sur Twitch et YouTube'],
  ['7TV', 'ammjkodgmmoknidbanneddgankgfejfh', 'emotes 7TV sur Twitch'],
  ['uBlock Origin Lite', 'ddkjiahejlhfcafbddmgiahcphecmpfh', 'bloqueur de pubs'],
  ['SponsorBlock', 'mnjggcdmjocbbbhaepdhchncahnbgone', 'saute les passages sponsorisés sur YouTube'],
  ['Return YouTube Dislike', 'gebbhagfogifgggkldgodflihgfeippi', 'remet le compteur de « je n\'aime pas »'],
  ['Dark Reader', 'eimadpbcbfnmbkopoojfekhnkhdbieeh', 'mode sombre sur tous les sites'],
  ['VT4Browsers', 'efbjojhplkelaegfbieplglfidafgoka', 'VirusTotal (limité : ses menus ne marchent pas ici)'],
];
let hist: { q: string; list: { url: string; title: string; t: number }[] } = { q: '', list: [] };
let sugg: Sugg[] = [];
let suggFor: 'addr' | 'cmd' = 'cmd';
let sel = 0;
let ask: { text: string; answer(v: string): void; input?: boolean } | null = null;
let booted = false;
// Commandes déjà tapées, la plus récente d'abord (↑ ↓ dans l'invite). Gardées dans ce profil d'interface, jamais celles d'une page privée.
const recent: string[] = (() => { try { const v = JSON.parse(localStorage.getItem('phos-hist') ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []; } catch { return []; } })();
let histPos = -1; // position dans « recent » pendant ↑ ↓ (-1 : ligne en cours)
let typing: { r: number; password: boolean } | null = null; // saisie dans un champ du site
const urls = new Map<string, string>();
const collapsed = new Set<string>(); // Spaces repliés dans la barre latérale
let closedOpen = true;
let menu: HTMLElement | null = null; // menu clic droit ouvert
let resizing = false; // poignée de la barre latérale tirée
let cssApplied: string[] = []; // variables posées par « set css », retirées quand on les remet par défaut
const tv = new TextView(m => send(m), () => { renderPrompt(); sendLayout(); });

// ── messages du processus principal ──
window.phos.on((event, data) => {
  if (event === 'state') { st = data as UiState; if (!st.internal) page = null; render(); boot(); }
  else if (event === 'focus-prompt') {
    const f = (data ?? {}) as { which?: string; text?: string };
    if (f.which === 'cmd') { cmd.focus(); if (f.text) { cmd.value = f.text; cmdInput(); } }
    else { addr.focus(); addr.select(); }
  }
  else if (event === 'page') { page = data as typeof page; send({ t: 'internal', on: true }); }
  else if (event === 'msg') flash(String(data));
  else if (event === 'table') {
    const t = data as { head: string[]; widths: number[]; rows: string[][]; foot?: string };
    flash([...grid(t.head, t.widths, t.rows), ...(t.foot ? ['\n', el('span', t.foot, 'gray')] : [])]);
  }
  else if (event === 'history') { hist = data as typeof hist; renderInternal(); }
  else if (event === 'perf') { perf = data as Perf; if (page === 'perf') renderInternal(); }
  else if (event === 'mods') mods = data as typeof mods;
  else if (event === 'sounds') setPack(data as SoundPack | null);
  else if (event === 'sound') playSound(String(data));
  else if (event === 'exts') { exts = data as Ext[]; installing.clear(); if (page === 'ext' || page === 'store') renderInternal(); }
  else if (event === 'collapse') { const c = data as { ids: string[]; on: boolean }; for (const id of c.ids ?? []) if (c.on) collapsed.add(id); else collapsed.delete(id); renderSide(); }
  else if (event === 'bm-q') { bmQuery = String(data); if (page === 'bookmarks') { addr.focus(); addr.value = bmQuery; renderInternal(); } }
  else if (event === 'guide-open') { const id = String(data); if (GUIDE.some(g => g.id === id)) guideOpen.add(id); if (page === 'guide') renderInternal(); }
  else if (event === 'find-tab') { tabQuery = String(data); if (page === 'tabs') { addr.focus(); addr.value = tabQuery; renderInternal(); } }
  else if (event === 'store') { store = data as typeof store; storeOpen = null; if (page === 'store') renderInternal(); }
  else if (event === 'store-detail') { const d = data as StoreDetail; details.set(d.id, d); if (page === 'store') renderInternal(); }
  else if (event === 'cls') { $('msg').textContent = ''; if (ask) { ask.answer(''); clearAsk(); } }
  else if (event === 'suggest') {
    const d = data as { q: string; list: string[] };
    if (suggFor === 'addr' && document.activeElement === addr && d.q === addr.value.trim()) { google = d.list; addrSuggest(); }
  }
  else if (event === 'snap') { tv.update(data as PageSnap, textTab()); renderPrompt(); }
  else if (event === 'input') {
    typing = data as { r: number; password: boolean };
    cmd.type = typing.password ? 'password' : 'text';
    cmd.value = '';
    flash('saisie : ' + tv.labelOf(typing.r));
    cmd.focus();
    renderPrompt();
  }
  else if (event === 'confirm') {
    const c = data as { what: string; id: string; text: string };
    setAsk(c.text, v => send({ t: 'confirm', what: c.what, id: c.id, yes: v === 'o' || v === 'oui' }));
  }
});

/** Son d'interface, avec les réglages courants (set sound, set sound-volume, mode éco coupe tout). */
function playSound(ev: string) {
  const s = st?.settings;
  play(ev, { volume: (s?.soundVolume ?? 40) / 100, enabled: !!s && s.sound && !s.eco });
}
// Frappe dans l'invite ou la barre d'adresse (jamais dans les sites : ils ont leur propre vue).
addEventListener('keydown', e => {
  if (e.target !== cmd && e.target !== addr) return;
  const ev = keyEvent(e);
  if (ev) playSound(ev);
}, true);

let msgTimer = 0;
function flash(text: string | (string | Node)[]) {
  if (typeof text === 'string') $('msg').textContent = text.slice(0, 6000);
  else $('msg').replaceChildren(...text);
  // Croix pour fermer le message (aussi Ctrl+C), comme sur les pages internes.
  const close = el('span', '[X]', 'close');
  close.title = 'Fermer · Ctrl+C';
  close.setAttribute('aria-label', 'Fermer');
  close.onclick = () => { clearTimeout(msgTimer); $('msg').textContent = ''; };
  $('msg').prepend(close);
  clearTimeout(msgTimer);
  // Une sortie de plusieurs lignes (ls) reste plus longtemps à l'écran ; cls l'efface.
  msgTimer = window.setTimeout(() => ($('msg').textContent = ''), typeof text !== 'string' || text.includes('\n') ? 30000 : 6000);
}

/**
 * Cellule de tableau de largeur fixe (en caractères), coupée par « … » si trop longue.
 * Vraie boîte CSS : l'alignement tient même avec des caractères chinois ou des emoji, plus larges que les autres.
 */
function cell(text: string | HTMLElement, width: number, cls = '') {
  const c = el('span', '', 'cell' + (cls ? ' ' + cls : ''));
  c.append(text);
  c.style.width = width + 'ch';
  if (typeof text === 'string') c.title = text;
  return c;
}
/** Tableau façon PowerShell : en-tête vert souligné de tirets, puis les lignes. */
function grid(head: string[], widths: number[], rows: (string | HTMLElement)[][], cls: (string | undefined)[][] = [], indent = ''): (string | HTMLElement)[] {
  const line = (cells: (string | HTMLElement)[], k?: number, hc?: string) =>
    [indent, ...cells.map((c, i) => cell(c, widths[i] ?? 20, hc ?? (k === undefined ? '' : cls[k]?.[i] ?? ''))), '\n'];
  const top = head.length ? [...line(head, undefined, 'g'), ...line(head.map(h => '-'.repeat(h.length)), undefined, 'g')] : []; // sans en-tête : lignes seules
  return [...top, ...rows.flatMap((r, k) => line(r, k))];
}

/** Demande du navigateur (style PowerShell) : le sceau prouve qu'elle vient de Phosphore, pas du site. */
function setAsk(text: string, answer: (v: string) => void) {
  ask = { text, answer };
  const box = $('ask');
  box.replaceChildren(...L([st?.settings.seal ?? '', 'bc'], ' · Demande du navigateur'), ...L([text, 'w']),
    ...L('[O] Oui  ', ['[N] Non', 'y'], '  (la valeur par défaut est « N ») : tapez en bas puis Entrée'));
  box.hidden = false;
  cmd.focus();
  renderPrompt();
}

/** Demande d'un texte (renommer) : l'invite du bas devient « nom: » avec la valeur actuelle. */
function askText(text: string, initial: string, answer: (v: string) => void) {
  ask = { text, answer, input: true };
  const box = $('ask');
  box.replaceChildren(...L([st?.settings.seal ?? '', 'bc'], ' · ', [text, 'w']), ...L(['Entrée valider · Échap annuler', 'gray']));
  box.hidden = false;
  cmd.value = initial;
  cmd.focus();
  cmd.select();
  renderPrompt();
}

function clearAsk() {
  ask = null;
  $('ask').hidden = true;
  renderPrompt();
}

// ── rendu ──
function activeTab(): TabItem | undefined {
  if (!st) return;
  const id = st.session.active[st.session.activeSpace];
  return st.session.items.find((i): i is TabItem => i.kind === 'tab' && i.id === id);
}

function render() {
  if (!st) return;
  const d = document.documentElement, s = st.settings;
  d.dataset.theme = s.theme;
  d.dataset.size = s.size;
  d.dataset.motion = s.reduceMotion ? 'reduce' : 'full';
  d.lang = s.lang;
  // ui hide … : une classe par élément masqué ; set sidebar-side right ; set css --variable valeur.
  for (const p of Object.keys(PARTS)) document.body.classList.toggle('hide-' + p, s.hidden.includes(p as keyof typeof PARTS));
  document.body.classList.toggle('side-right', s.sideRight);
  // Personnalisation (set color / set font / set sidebar-width) : variables CSS posées par le CSSOM.
  for (const [name, v] of Object.entries(COLORS)) { const c = s.colors[name as ColorName]; if (c) d.style.setProperty(v, c); else d.style.removeProperty(v); }
  if (s.font) d.style.setProperty('--font-display', `'${s.font}', 'Cascadia Mono', Consolas, monospace`); else d.style.removeProperty('--font-display');
  if (!resizing) d.style.setProperty('--side-w', s.sideWidth + 'px');
  // set css en dernier : il a le dernier mot sur tout le reste.
  for (const k of cssApplied) if (!(k in s.css)) d.style.removeProperty(k);
  cssApplied = Object.keys(s.css);
  for (const [k, v] of Object.entries(s.css)) d.style.setProperty(k, v);
  renderTabs();
  renderStatus();
  renderSide();
  renderInternal();
  renderPage();
  renderPrompt();
}

/** Onglet affiché en mode texte (null : page interne, nouvelle page, erreur ou mode web). */
function textTab(): string | null {
  const tab = activeTab();
  if (!st || !tab || !tab.url || page || st.live[tab.id]?.error) return null;
  return modeOf(tab.url, st.settings.textHosts) === 'text' ? tab.id : null;
}

function renderPage() {
  const tab = activeTab();
  document.body.classList.toggle('web', !!tab && !!tab.url && modeOf(tab.url, st!.settings.textHosts) === 'web');
  for (const i of st!.session.items) {
    if (i.kind !== 'tab') continue;
    if (urls.has(i.id) && urls.get(i.id) !== i.url) tv.forget(i.id);
    urls.set(i.id, i.url);
  }
  tv.show(textTab());
  sendLayout();
}

function host(url: string) { try { return new URL(url).host; } catch { return url; } }
const spaceName = () => { const s = st?.session; return s?.spaces.find(x => x.id === s.activeSpace)?.name.toLowerCase() ?? ''; };
/** Invite (set prompt) : {user} = réglage « profile », {space} = Space courant, comme un dossier. */
const ps = () => (st?.settings.prompt ?? DEFAULT_PROMPT).replaceAll('{user}', st?.settings.profile ?? '').replaceAll('{space}', spaceName() + (activeTab()?.private ? ' (privé)' : ''));
const locale = () => st?.settings.lang ?? 'fr';
const hhmm = (d: Date) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
/** Couleur d'un Space dans la barre latérale et les onglets (set color space1…space6). */
const spaceColor = (spaceId: string) => `var(--sp${(Math.max(0, st!.session.spaces.findIndex(s => s.id === spaceId)) % 6) + 1})`;
/** Ligne déjà exécutée : invite, commande en jaune, argument. */
const doneLine = (verb: string, arg = '') => L(ps(), [verb, 'y'], arg ? ' ' + arg : '');
/** Texte de l'interface : celui choisi par « set text », sinon celui par défaut. */
const T = (k: TextKey) => st?.settings.texts[k] ?? TEXTS[k];
const tabLabel = (t: TabItem) => t.label || (!t.url ? T('newtab-title') : t.title || host(t.url)); // tab rename : nom choisi d'abord

/** Onglets du Space actif, en haut, comme Windows Terminal. */
function renderTabs() {
  const s = st!.session;
  const activeId = s.active[s.activeSpace];
  const tabs = tree(s.items, s.activeSpace, true).flatMap(({ item }) => item.kind === 'tab' ? [item] : []);
  // Pastille du Space courant, de sa couleur : on sait toujours dans quel Space sont ces onglets.
  const chip = el('div', spaceName(), 'space-chip');
  chip.style.setProperty('--spc', spaceColor(s.activeSpace));
  chip.title = 'Space courant · Ctrl+1-9 pour changer';
  $('tabs').replaceChildren(chip, ...tabs.map((t, k) => {
    const live = st!.live[t.id];
    const b = el('div', '', 'tab' + (t.id === activeId && !page ? ' on' : '') + (live?.error ? ' danger' : '') + (t.private ? ' priv' : ''));
    b.setAttribute('role', 'tab');
    b.dataset.id = t.id;
    b.draggable = true;
    b.title = `${k + 1} · ${t.private ? 'privé · ' : ''}${t.url || 'nouvelle page'} · glisser pour déplacer`;
    const x = el('span', '×', 'x');
    x.setAttribute('aria-label', 'Fermer la page');
    x.onclick = e => { e.stopPropagation(); send({ t: 'close', id: t.id }); };
    b.append(el('span', live?.loading ? '…' : t.private ? '◆' : '>_', 'ic'), el('span', tabLabel(t), 't'), x);
    return b;
  }));
}
// Glisser-déposer dans la barre d'onglets : avant / après l'onglet survolé.
{
  const bar = $('tabs');
  let drag: string | null = null, target: { id: string; where: 'before' | 'after' } | null = null;
  const clear = () => bar.querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  bar.addEventListener('dragstart', e => { drag = (e.target as HTMLElement).closest<HTMLElement>('.tab')?.dataset.id ?? null; e.dataTransfer?.setData('text/plain', ''); });
  bar.addEventListener('dragover', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tab');
    if (!drag || !t || t.dataset.id === drag) return;
    e.preventDefault();
    clear();
    const r = t.getBoundingClientRect();
    target = { id: t.dataset.id!, where: e.clientX < r.left + r.width / 2 ? 'before' : 'after' };
    t.classList.add('drop-' + target.where);
  });
  bar.addEventListener('drop', e => { e.preventDefault(); clear(); if (drag && target) send({ t: 'move', id: drag, target: target.id, where: target.where }); drag = target = null; });
  bar.addEventListener('dragend', () => { clear(); drag = target = null; });
}
$('tabs').addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('.tab');
  if (t) send({ t: 'activate', id: t.dataset.id });
});
$('tabs').addEventListener('auxclick', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('.tab');
  if (e.button === 1 && t) send({ t: 'close', id: t.dataset.id });
});

function renderStatus() {
  // L'adresse et l'état viennent de l'interface, jamais du site (impossible à imiter).
  const tab = activeTab();
  const live = tab && st!.live[tab.id];
  const info = $('st-info'), sec = $('sec');
  $('addr-ps').textContent = ps();
  if (document.activeElement !== addr) addr.value = page || !tab ? '' : tab.url;
  addr.placeholder = page === 'store' ? 'chercher une extension (ex. twitch, youtube, sombre…)' : page === 'bookmarks' ? 'filtrer les favoris' : page === 'tabs' ? 'chercher une page dans tous les Spaces (titre ou adresse)' : T('placeholder').replaceAll('{engine}', st!.settings.search);
  info.className = 'gray';
  const badge = (text: string, cls = '') => { sec.textContent = text; sec.className = 'badge ' + cls; sec.onclick = null; };
  if (page || !tab || !tab.url) {
    badge(T('brand'));
    info.textContent = page ? '  page interne Phosphore' : '  nouvelle page';
    return;
  }
  if (live?.error) { badge('ERREUR', 'err'); info.className = 'danger'; info.textContent = `  connexion impossible · ${live.error}`; return; }
  const https = tab.url.startsWith('https:');
  badge(https ? 'TLS OK' : 'NON CHIFFRÉ', https ? 'ok' : 'err');
  info.textContent = `  ${https ? 'TLS · connexion chiffrée' : 'non chiffré · n\'y tapez pas de mot de passe'}${live?.loading ? ' · chargement…' : ''} · ${tab.title || host(tab.url)}`;
  // Page d'une extension du Chrome Web Store : son bouton « Ajouter à Chrome » ne marche pas ici, Phosphore propose le sien.
  if (/^https:\/\/chromewebstore\.google\.com\/detail\//.test(tab.url)) {
    const install = () => send({ t: 'run', input: 'ext store' });
    const b = el('span', '  ▶ installer dans Phosphore (ext store)', 'install');
    b.onclick = install;
    info.prepend(b);
    // Le gros bouton vert en haut à droite remplace « Ajouter à Chrome » (qui demande de télécharger Chrome).
    badge('▶ INSTALLER DANS PHOSPHORE', 'install');
    sec.onclick = install;
    if (storeTip !== tab.url) { storeTip = tab.url; flash('Extension du Chrome Web Store : ignorez « Ajouter à Chrome / Télécharger Chrome ». Cliquez ▶ INSTALLER DANS PHOSPHORE en haut à droite, ou tapez ext store.'); }
  }
  if (!https) info.className = 'danger';
}

function renderSide() {
  const s = st!.session;
  const side = $('side');
  const activeId = s.active[s.activeSpace];
  const row = (text: string, cls = '', flag = '') => {
    const r = el('div', '', 'row ' + cls);
    r.append(el('span', text, 'name'), el('span', flag, 'flag'));
    return r;
  };
  const rows: HTMLElement[] = [];
  s.spaces.forEach((sp, k) => {
    const cur = sp.id === s.activeSpace;
    const count = s.items.filter(i => i.kind === 'tab' && i.spaceId === sp.id).length;
    const col = collapsed.has(sp.id);
    const toggle = () => { if (col) collapsed.delete(sp.id); else collapsed.add(sp.id); renderSide(); };
    // En-tête de Space : flèche repliable (un seul clic plie / déplie, quel que soit le Space actif) puis le nom.
    const h = el('div', '', 'row space' + (cur ? ' cur' : ''));
    const arrow = el('span', col ? '▸' : '▾', 'arr');
    arrow.title = col ? 'Déplier' : 'Replier';
    arrow.onclick = e => { e.stopPropagation(); toggle(); };
    h.append(arrow, el('span', ' ' + sp.name.toUpperCase(), 'name'), el('span', String(count), 'flag'));
    h.style.setProperty('--spc', spaceColor(sp.id));
    h.title = `Ctrl+${k + 1} · cd ${sp.name.toLowerCase()} · clic droit : options`;
    h.dataset.space = sp.id;
    h.draggable = true; // glisser un Space sur un autre change leur ordre
    // Clic sur le nom : aller dans le Space (s'il n'est pas déjà actif), sinon plier / déplier.
    h.onclick = () => { if (!cur) { collapsed.delete(sp.id); send({ t: 'space', id: sp.id }); } else toggle(); };
    rows.push(h);
    const items = col ? [] : tree(s.items, sp.id, false);
    if (!col && !items.length) { const e = row(T('empty'), 'dim child empty'); e.style.setProperty('--spc', spaceColor(sp.id)); rows.push(e); }
    items.forEach(({ item, depth }, n) => {
      let r: HTMLElement;
      // Branche d'arbre (├ └) : chaque page est visiblement rattachée à son Space.
      const branch = '  '.repeat(depth) + (st!.settings.hidden.includes('tree') ? '' : n === items.length - 1 ? '└ ' : '├ ');
      if (item.kind === 'folder') {
        const c = s.items.filter(i => i.parent === item.id).length;
        r = row(`${branch}${item.open ? '▾' : '▸'} ${item.name}\\`, 'dim child', item.open ? '' : String(c));
      } else {
        const live = st!.live[item.id];
        const on = item.id === activeId && !page;
        // set sleep-mark : page en veille grisée et marquée « zz » (classe .asleep, stylable par un mod @match phosphore).
        const asleep = !!live?.asleep && !!item.url && st!.settings.sleepMark;
        const flag = live?.error ? '!!' : live?.loading ? '…' : asleep ? 'zz' : item.pinned ? '*' : '';
        r = row(branch + (item.private ? '◆ ' : '') + tabLabel(item), 'child' + (on ? ' on' : asleep ? ' dim asleep' : '') + (on && live?.error ? ' danger' : '') + (item.private ? ' priv' : ''), on ? '' : flag);
        const x = el('span', '×', 'x');
        x.setAttribute('aria-label', 'Fermer la page');
        x.onclick = e => { e.stopPropagation(); send({ t: 'close', id: item.id }); };
        r.append(x);
        r.title = (item.private ? 'privé · ' : '') + (item.url || 'nouvelle page');
      }
      r.style.setProperty('--spc', spaceColor(sp.id));
      r.dataset.id = item.id;
      r.dataset.kind = item.kind;
      r.draggable = true;
      rows.push(r);
    });
    rows.push(row('', 'gap'));
  });
  // Boutons ajoutés avec « sidebar add », dans l'ordre choisi (sidebar move / order, ou glisser-déposer).
  const tool = (w: string, icon: string, text: string, input: string, flag = '') => {
    const r = row(`${icon} ${text}`, 'widget', flag);
    r.title = input + ' · glisser pour changer la place';
    r.dataset.widget = w;
    r.draggable = true;
    r.onclick = () => send({ t: 'run', input });
    rows.push(r);
  };
  for (const w of st!.settings.sidebar) {
    if (w === 'closed') {
      // Pages fermées : un clic les rouvre.
      const closed = (st!.closed ?? []).slice(0, st!.settings.closedMax);
      const h = row(`${closedOpen ? '▾' : '▸'} ${T('closed')}`, 'head widget', String(closed.length));
      h.title = 'set closed-max <n> : nombre affiché · sidebar rm closed : retirer · glisser pour changer la place';
      h.dataset.widget = w;
      h.draggable = true;
      h.onclick = () => { closedOpen = !closedOpen; renderSide(); };
      rows.push(h);
      if (closedOpen) for (const c of closed) {
        const r = row('↺ ' + (c.title || host(c.url) || 'nouvelle page'), 'dim');
        r.style.paddingLeft = '18px';
        r.title = 'Rouvrir · ' + (c.url || 'nouvelle page');
        r.onclick = () => send({ t: 'reopen', id: c.id });
        rows.push(r);
      }
      rows.push(row('', 'gap'));
    }
    else if (w === 'history') tool(w, '↶', T('history'), 'history');
    else if (w === 'settings') tool(w, '⚙', T('settings'), 'settings');
    else if (w === 'help') tool(w, '?', T('help'), 'man');
    else if (w === 'perf') tool(w, '▤', T('perf'), 'top');
    else if (w === 'new') tool(w, '+', T('new'), 'start');
    else if (w === 'ext') tool(w, '⧉', T('ext'), 'ext');
    else if (w === 'guide') tool(w, '☰', T('guide'), 'guide');
    else if (w === 'bm') tool(w, '★', T('bm'), 'bm');
    else if (w === 'eco') tool(w, '♻', T('eco'), 'eco', st!.settings.eco ? 'oui' : 'non');
    else if (w === 'clock') { const r = row('◷ ' + hhmm(new Date()), 'dim widget'); r.dataset.clock = ''; r.dataset.widget = w; r.draggable = true; rows.push(r); }
  }
  side.replaceChildren(...rows);
  document.body.classList.toggle('noside', st!.settings.sideHidden);
}

const day = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const table = (head: string, dash: string) => [...L([head, 'g']), ...L([dash, 'g'])];
const picked = new Set<number>(); // entrées d'historique choisies (Ctrl+clic), par heure de visite

/** Favoris dont le nom ou l'adresse contient tous les mots du filtre. */
function bmMatches() {
  const words = bmQuery.toLowerCase().split(/[ ]+/).filter(Boolean);
  return st!.settings.bookmarks.map((b, k) => ({ ...b, n: k + 1 })).filter(b => words.every(w => (b.name + ' ' + b.url).toLowerCase().includes(w)));
}

/** Pages de tous les Spaces dont le titre ou l'adresse contient tous les mots de find-tab, rangées par Space. */
function tabMatches(): TabItem[] {
  const words = tabQuery.toLowerCase().split(/\s+/).filter(Boolean);
  return st!.session.spaces.flatMap(sp => tree(st!.session.items, sp.id).flatMap(({ item }) =>
    item.kind === 'tab' && words.every(w => (item.title + ' ' + item.url).toLowerCase().includes(w)) ? [item] : []));
}

/** Raccourcis de la nouvelle page : pages épinglées du Space, puis sites (shortcut add). Même ordre qu'Alt+1-9 côté principal. */
function shortcutList(): { label: string; tab?: string; url: string }[] {
  const s = st!.session;
  const pinned = tree(s.items, s.activeSpace).flatMap(({ item }) => item.kind === 'tab' && item.pinned ? [item] : []);
  return [...pinned.map(t => ({ label: tabLabel(t), tab: t.id, url: t.url })), ...st!.settings.shortcuts.map(u => ({ label: host(u).replace(/^www\./, ''), url: u }))].slice(0, 9);
}

function renderInternal() {
  const box = $('internal');
  const tab = activeTab();
  const err = tab && st!.live[tab.id]?.error;
  const lines: (string | HTMLElement)[] = [];
  if (page === 'help') {
    lines.push(...doneLine('man'), ...L(),
      ...table('Command             Description', '-------             -----------'),
      ...COMMANDS.flatMap(([c, d]) => L([(c.trim() + (c.endsWith(' ') ? ' …' : '')).padEnd(20), 'y'], d)), ...L(),
      ...L(['space rename|delete'.padEnd(20), 'y'], 'rename / delete the current Space'),
      ...L(['view text|web'.padEnd(20), 'y'], 'page as text (experimental) / real page'),
      ...L(['retry'.padEnd(20), 'y'], 'retry (like r)'), ...L(),
      ...L(['Buttons for "sidebar add": ', 'gray'], [Object.keys(WIDGETS).join(' · '), 'cy']),
      ...L(['Right-click a tab, a Space or a folder: options menu.', 'gray']), ...L(),
      ...L(['Top bar: an address, or a search with suggestions. Ctrl+Enter: new tab.', 'gray']),
      ...L(['Ctrl+L top bar · Ctrl+K prompt · Ctrl+F grep · Ctrl+T start · Ctrl+W rm · Ctrl+Shift+T undo', 'gray']),
      ...L(['Ctrl+Tab next page · Ctrl+1-9 Space · Alt+1-9 shortcut · Alt+←/→ cd .. / cd + · Tab complete · → accept the grey suggestion', 'gray']), ...L(),
      ...L(['Everything is set by command: ', 'gray'], ['settings', 'y'], [' (all settings) · ', 'gray'], ['set color accent #ff8800', 'y'], [' · ', 'gray'], ['set newpage none', 'y'], [' · ', 'gray'], ['mod import', 'y'], [' · ', 'gray'], ['source file.txt', 'y']),
      ...L(['Interface mod: a CSS file starting with /* @match phosphore */ (classes: #side .row.space .row.child #tabbar .tab #prompt #internal .clock). Sound mods: mod new sound <name>.', 'gray']));
  } else if (page === 'settings') {
    const s = st!.settings;
    // Comme Get-ItemProperty dans PowerShell : nom anglais du réglage, valeur true / false.
    const row = (k: string, v: string | boolean, note = '') => L(k.padEnd(22) + ': ', [String(v), typeof v === 'boolean' ? (v ? 'g' : 'r') : 'w'], note ? ['   ' + note, 'gray'] : '');
    lines.push(...doneLine('settings'), ...L(),
      ...row('theme', s.theme), ...row('size', s.size.toLowerCase()), ...row('animations', !s.reduceMotion), ...row('boot', s.boot),
      ...row('search', s.search), ...row('suggestions', s.suggest, `propositions depuis ${s.search} pendant la frappe`), ...row('eco', s.eco),
      ...row('images', s.images, 'mode texte seulement'), ...row('profile', s.profile), ...row('seal', s.seal),
      ...row('sidebar', s.sideHidden ? 'off' : s.sidebar.join(', ') || '(vide)'),
      ...row('spaces', s.sharedCookies, s.sharedCookies ? 'cookies communs (ceux de perso)' : 'cookies séparés par Space'),
      ...row('lang', s.lang, 'langue des sites et des dates'), ...row('sidebar-width', String(s.sideWidth), 'ou tirer le bord de la barre'),
      ...row('closed-max', String(s.closedMax), 'pages dans « fermés »'), ...row('newpage', s.newpage.join(',') || 'none', NEWPAGE.join(',')),
      ...row('unload-spaces', s.unloadSpaces, 'changer de Space endort les autres'), ...row('newtab', s.newTabEnd ? 'end' : 'next', 'end = à la fin · next = après la page'),
      ...row('unload-delay', String(s.unloadDelay), 'min avant la veille des autres Spaces (0 = tout de suite)'), ...row('idle-sleep', String(s.idleSleep), 'min sans être vue avant la veille (0 = jamais)'),
      ...row('eco-sleep', String(s.ecoSleep), 'même chose en mode éco'), ...row('sleep-pinned', s.sleepPinned, 'épinglées mises en veille aussi'),
      ...row('sleep-never', s.sleepNever.join(',') || 'none', 'sites jamais en veille'), ...row('sleep-mark', s.sleepMark, 'pages en veille grisées « zz »'),
      ...row('close-idle', String(s.closeIdle), 'min avant fermeture dans les Spaces inactifs (0 = jamais)'), ...row('dedupe-on-open', s.dedupeOnOpen, 'adresse déjà ouverte : y aller'),
      ...row('autoplay-mute', s.autoplayMute, 'son coupé en arrière-plan'), ...row('restore', s.restore, 'last · home · none (au démarrage)'),
      ...row('sound', s.sound, 'sons de l\'interface (mod de sons, coupés en mode éco)'), ...row('sound-volume', String(s.soundVolume), '0-100'),
      ...row('zoom', String(s.zoom), 'zoom par défaut des pages (%)'), ...row('home', s.home || 'none', 'page d\'accueil'),
      ...row('download-dir', s.downloadDir || 'default', 'dossier des téléchargements'), ...row('download-ask', s.downloadAsk, 'demander où enregistrer'),
      ...row('proxy', s.proxy || 'none'), ...row('clear-history-on-exit', s.clearHistoryOnExit, 'historique effacé en quittant'),
      ...row('update-check', s.updateCheck, 'prévenir si Chromium a du retard'),
      ...row('https-only', s.httpsOnly, 'forcer https · https-allow pour les exceptions'),
      ...(s.httpsAllow.length ? row('https-allow', s.httpsAllow.join(', ')) : []),
      ...row('privacy', s.privacy, 'strict : moins de traçabilité (pas Tor)'),
      ...row('safebrowsing', s.safeBrowsing, 'avertir avant les sites d\'hameçonnage'),
      ...row('blocklist', s.blockAds, 'bloquer pubs et traqueurs · blocklist allow <site>'),
      ...(s.blockAllow.length ? row('blocklist-allow', s.blockAllow.join(', ')) : []),
      ...row('bookmarks', String(s.bookmarks.length), 'bm'), ...row('permissions', Object.keys(s.permissions).join(', ') || '(aucune)', 'perm ls'),
      ...row('font', s.font || 'default'), ...row('prompt', JSON.stringify(s.prompt), '{user} {space}'),
      ...row('color', Object.entries(s.colors).map(([k, v]) => `${k}=${v}`).join(' ') || '(défaut)', Object.keys(COLORS).join(' ')),
      ...row('shortcuts', String(s.shortcuts.length), 'shortcut ls'), ...row('aliases', Object.keys(s.aliases).join(', ') || '(aucun)', 'alias'),
      ...row('binds', Object.keys(s.binds).join(', ') || '(aucun)', 'bind'),
      ...row('extensions', String(s.extensions.length), 'ext'), ...row('mods', s.mods.join(', ') || '(aucun)', 'mod ls'), ...L(),
      ...L(['Modifier : set <setting> <value>', 'gray']),
      ...L(['  set theme green · set size l · set animations false · set boot false · set eco true', 'gray']),
      ...L(['  set search google · set suggestions false · set profile virrrr · set seal VEGA · set lang en', 'gray']),
      ...L(['  set color accent #ff8800 · set color clock default · set font "JetBrains Mono" · set prompt "{user}@{space} $ "', 'gray']),
      ...L(['  set newpage clock · set newpage none · set closed-max 3 · set sidebar-width 220 · reset settings', 'gray']));
  } else if (page === 'history') {
    lines.push(...doneLine('history', hist.q), ...L());
    if (!hist.list.length) lines.push(...L([hist.q ? 'Aucune page trouvée.' : 'Historique vide.', 'gray']));
    else {
      let cur = '';
      const w = String(hist.list.length).length;
      hist.list.forEach((v, k) => {
        const d = new Date(v.t);
        const label = day(d);
        if (label !== cur) { cur = label; lines.push(...L(), ...L([label, 'g']), ...L(['-'.repeat(label.length), 'g'])); }
        const a = el('span', (v.title || host(v.url)).slice(0, 70), 'a' + (picked.has(v.t) ? ' picked' : ''));
        a.dataset.url = v.url;
        a.dataset.t = String(v.t);
        a.title = v.url + ' · Ctrl+clic : sélectionner';
        lines.push(el('span', String(k + 1).padStart(w) + '  ', 'gray'), (picked.has(v.t) ? '[x] ' : '') + hhmm(d) + '  ', a, el('span', '  ' + host(v.url), 'gray'), '\n');
      });
    }
    lines.push(...L(), ...L([picked.size ? `${picked.size} sélectionnée(s) · Suppr : effacer · Échap : désélectionner` : 'Clic : ouvrir · Ctrl+clic : sélectionner puis Suppr · history rm 3 5-8 · history rm youtube.com', 'gray']),
      ...L(['history <mots> : chercher · history clear : tout effacer · enregistré sur ce PC uniquement', 'gray']));
  } else if (page === 'bookmarks') {
    // Favoris : filtrés pendant la frappe dans la barre du haut ; clic sur un nom : ouvrir ; [retirer] : bm rm.
    lines.push(...doneLine('bm', bmQuery), ...L());
    const all = st!.settings.bookmarks.map((b, k) => ({ ...b, n: k + 1 }));
    const hits = bmMatches();
    if (!all.length) lines.push(...L(['  Aucun favori. bm add : ajoute la page affichée · bm add <adresse> [nom]', 'gray']));
    else if (!hits.length) lines.push(...L([`  Aucun favori pour « ${bmQuery} ».`, 'gray']));
    else {
      const rm = (n: number) => { const b = el('span', '[remove]', 'a btn danger'); b.dataset.run = 'bm rm ' + n; return b; };
      lines.push(...grid(['N', 'Bookmark', 'Site', ''], [5, 50, 34, 10], hits.map(b => {
        const a = el('span', b.name || host(b.url), 'a');
        a.dataset.url = b.url;
        a.title = b.url;
        return [String(b.n), a, host(b.url), rm(b.n)];
      }), hits.map(() => ['gray', '', 'gray', '']), '  '));
    }
    lines.push(...L(), ...L(['  Type at the top to filter · Enter: open the first one · bm add [name] · bm rm <n> · bm open <n>', 'gray']));
  } else if (page === 'guide') {
    // Guide : une ligne par rubrique ; clic = déplier. Dans une rubrique, clic sur une commande ou un exemple = recopié dans l'invite.
    lines.push(...doneLine('guide'), ...L(), ...L(['Customize Phosphore', 'w'], ['  ·  click a section  ·  click a command or an example to put it in the prompt, then Enter', 'gray']), ...L());
    for (const g of GUIDE) {
      const open = guideOpen.has(g.id);
      const head = el('span', (open ? '▾ ' : '▸ ') + g.title, 'a guide-head' + (open ? ' open' : ''));
      head.dataset.guide = g.id;
      lines.push('  ', head, el('span', '  ' + g.intro, 'gray'), '\n');
      if (!open) continue;
      const fill = (text: string, cls: string) => { const a = el('span', text, cls); a.dataset.fill = text.replace(/ <[^>]*>.*$/, ' ').replace(/ ·.*$/, ''); a.title = 'Put in the prompt'; return a; };
      lines.push(...grid(['Command', 'What it does', 'Example'], [34, 62, 34],
        g.items.map(([c, what, ex]) => [fill(c, 'y guide-cmd'), what, ex ? fill(ex, 'a') : '']), g.items.map(() => ['', 'wrap', '']), '     '), '\n');
    }
    lines.push(...L(), ...L(['  guide <section> opens one directly: ' + GUIDE.map(g => g.id).join(' · '), 'gray']), ...L(['  Every command: man  ·  every current value: settings', 'gray']));
  } else if (page === 'tabs') {
    // find-tab : toutes les pages de tous les Spaces, filtrées pendant la frappe dans la barre du haut ; clic ou Entrée : y aller.
    lines.push(...doneLine('find-tab', tabQuery), ...L());
    const hits = tabMatches();
    if (!hits.length) lines.push(...L(['  Aucune page trouvée' + (tabQuery ? ` pour « ${tabQuery} »` : '') + '.', 'gray']));
    let cur = '';
    hits.forEach((t, k) => {
      const sp = st!.session.spaces.find(x => x.id === t.spaceId);
      if (t.spaceId !== cur) {
        cur = t.spaceId;
        const h = el('span', '■ ' + (sp?.name ?? '').toUpperCase(), 'space-label');
        h.style.setProperty('--spc', spaceColor(t.spaceId));
        lines.push('\n', h, '\n');
      }
      const a = el('span', (t.private ? '◆ ' : '') + tabLabel(t), 'a' + (k === 0 && tabQuery ? ' sel' : ''));
      a.dataset.tab = t.id;
      a.title = t.url || 'nouvelle page';
      const live = st!.live[t.id];
      lines.push(...grid([], [5, 60, 36, 10], [[String(k + 1), a, t.url ? host(t.url) : '', live?.asleep && t.url ? 'en veille' : t.id === st!.session.active[st!.session.activeSpace] ? 'affichée' : '']], [['gray', '', 'gray', 'gray']]));
    });
    lines.push(...L(), ...L(['  Tapez en haut pour filtrer · Entrée : la première page · clic : y aller', 'gray']));
  } else if (page === 'store') {
    // Menu Store (comme history) : la barre du haut cherche dans le Chrome Web Store ; clic sur un nom : sa fiche.
    const btn = (label: string, input: string, cls = '') => { const b = el('span', `[${label}]`, 'a btn' + (cls ? ' ' + cls : '')); b.dataset.run = input; b.title = input; return b; };
    const have = new Set(exts.map(x => x.dir.split(/[\\/]/).pop()));
    lines.push(...doneLine('ext store', store.q), ...L(),
      ...L(['Chrome Web Store', 'w'], ['  ·  tapez dans la barre du haut pour chercher  ·  clic sur un nom : ce que fait l\'extension', 'gray']), ...L());
    const list: StoreItem[] = store.q ? store.list : SUGGESTED.map(([name, id]) => ({ id, name, rating: '' }));
    if (store.loading) lines.push(...L(['  recherche de « ' + store.q + ' »…', 'gray']));
    else if (store.error) lines.push(...L(['  ' + store.error, 'r']));
    else if (store.q && !list.length) lines.push(...L(['  Aucune extension trouvée pour « ' + store.q + ' ».', 'gray']));
    else lines.push(...L([store.q ? `  ${list.length} résultat(s) pour « ${store.q} »` : '  Conseillées (tapez en haut pour chercher autre chose)', 'g']), ...L());
    list.forEach((it, k) => {
      const open = storeOpen === it.id;
      const name = el('span', (open ? '▾ ' : '▸ ') + it.name, 'a');
      name.dataset.store = it.id;
      name.title = 'Voir ce que fait cette extension';
      const state = have.has(it.id) ? el('span', 'installée', 'g') : installing.has(it.id) ? el('span', 'installation…', 'gray') : btn('installer', 'ext store ' + it.id, 'go');
      lines.push(...grid([], [5, 70, 7, 16], [[String(k + 1), name, it.rating ? '★ ' + it.rating : '', state]], [['gray']], '').slice(0));
      if (!open) return;
      const d = details.get(it.id);
      if (!d || d === 'loading') { lines.push(...L(['       lecture de la fiche…', 'gray'])); return; }
      if (d.error) { lines.push(...L(['       ' + d.error, 'r'])); return; }
      const facts = [d.users && d.users + ' utilisateurs', d.version && 'version ' + d.version, d.rating && '★ ' + d.rating + ' / 5'].filter(Boolean).join('  ·  ');
      const box = el('div', '', 'store-card');
      box.append(el('div', d.summary || d.name || '', 'w'), el('div', facts, 'gray'));
      if (d.about) box.append(el('div', d.about, 'about'));
      const acts = el('div');
      acts.append(have.has(it.id) ? el('span', '✓ déjà installée', 'g') : btn('▶ installer dans Phosphore', 'ext store ' + it.id, 'go'), '  ',
        btn('voir la page sur le Store', 'start https://chromewebstore.google.com/detail/' + it.id));
      box.append(acts);
      lines.push(box);
    });
    lines.push(...L(), ...L(['  Après une installation : r pour recharger la page. Gérer les extensions installées : ext', 'gray']));
  } else if (page === 'ext') {
    // Page Extensions, comme chrome://extensions mais en terminal : chaque [action] est cliquable et a sa commande.
    const btn = (label: string, input: string, cls = '') => { const b = el('span', `[${label}]`, 'a btn' + (cls ? ' ' + cls : '')); b.dataset.run = input; b.title = input; return b; };
    lines.push(...doneLine('ext'), ...L(), ...L(['Extensions installées', 'w']), ...L());
    if (!exts.length) lines.push(...L(['  Aucune extension. Choisissez-en une plus bas, ou cherchez dans le Chrome Web Store.', 'gray']));
    else {
      const actions = (x: Ext, n: number) => {
        const box = el('span');
        box.append(btn(x.off ? 'activer' : 'désactiver', `ext ${x.off ? 'on' : 'off'} ${n}`), ' ');
        if (x.loaded && !x.off) box.append(btn('ouvrir', `ext open ${n}`), ' ');
        if (x.store) box.append(btn('mettre à jour', `ext update ${n}`), ' ');
        box.append(btn('retirer', `ext rm ${n}`, 'danger'));
        return box;
      };
      lines.push(...grid(['N', 'Extension', 'Version', 'État', 'Actions'], [4, 30, 10, 12, 44],
        exts.map((x, k) => [String(k + 1), x.name, x.version, x.off ? 'désactivée' : x.loaded ? 'active' : 'non chargée', actions(x, k + 1)]),
        exts.map(x => ['', '', '', x.off ? 'gray' : x.loaded ? 'g' : 'r', '']), '  '));
    }
    lines.push(...L(), ...L(['Installer', 'w']), ...L());
    const store = btn('▶ chercher des extensions', 'ext store', 'go');
    lines.push('  ', store, el('span', '   ou tapez ', 'gray'), el('span', 'ext store <nom>', 'y'), el('span', ' pour chercher', 'gray'), '\n',
      ...L(['  Sur la page d\'une extension : bouton vert ▶ INSTALLER DANS PHOSPHORE en haut à droite (le bouton « Ajouter à Chrome » du Store ne marche pas ici).', 'gray']), ...L());
    const have = new Set(exts.map(x => x.dir.split(/[\\/]/).pop()));
    lines.push(...grid(['Conseillées', 'Description', ''], [26, 54, 14],
      SUGGESTED.map(([name, id, desc]) => [name, desc, have.has(id) ? 'installée' : btn('installer', 'ext store ' + id, 'go')]),
      SUGGESTED.map(([, id]) => ['', 'gray', have.has(id) ? 'g' : '']), '  '));
    lines.push(...L(), ...L(['  Marchent dans Phosphore : scripts sur les pages (emotes, bloqueurs, thèmes). Les popups de barre d\'outils (Bitwarden…) s\'ouvrent dans un onglet avec [ouvrir] (ext open <n>).', 'gray']),
      ...L(['  Après une installation ou un changement : r pour recharger la page.', 'gray']));
  } else if (page === 'perf') {
    lines.push(...doneLine('top'), ...L());
    if (!perf) lines.push(...L(['mesure…', 'gray']));
    else {
      const bar = (mb: number) => '█'.repeat(Math.min(10, Math.round(mb / 50))).padEnd(10, '░');
      lines.push(...L('Phosphore ', [`${perf.total} Mo`, 'w'], ` · processeur ${perf.cpu} %  ·  PC : ${(perf.sysFree / 1024).toFixed(1)} Go libres sur ${(perf.sysTotal / 1024).toFixed(1)} Go  ·  mode éco : `, perf.eco ? ['oui', 'g'] : ['non', 'y']), ...L());
      // Colonnes en vraies cellules : un titre chinois ne décale plus les colonnes suivantes.
      const color = (mb: number) => mb > 400 ? 'r' : mb > 200 ? 'y' : 'g';
      // En veille : depuis combien de temps et mémoire libérée (mesurée juste avant la veille ; estimation).
      const since = (m: number) => m < 0 ? '' : m < 60 ? ` · ${m} min` : ` · ${Math.floor(m / 60)} h`;
      lines.push(...grid(['N', 'Page', 'Space', 'Mémoire', 'CPU', 'État'], [4, 38, 10, 20, 6, 30],
        perf.tabs.map((t, k) => [String(k + 1), t.title, t.space, t.asleep ? (t.freed ? `≈ ${t.freed} Mo libérés` : '—') : `${String(t.mb).padStart(5)} Mo ${bar(t.mb)}`, t.asleep ? '' : String(t.cpu).padStart(3),
          t.asleep ? 'en veille' + since(t.sleptMin) : t.timer ? 'active · veille programmée' : 'active']),
        perf.tabs.map(t => ['', '', '', t.asleep ? 'gray' : color(t.mb), '', t.asleep ? 'gray' : ''])));
      lines.push(...L(), ...grid(['Processus internes', 'Mémoire', 'CPU'], [26, 10, 6], perf.other.map(o => [o.type, `${String(o.mb).padStart(5)} Mo`, String(o.cpu).padStart(3)])));
      lines.push(...L(), ...L(['Mémoire privée de chaque processus (même mesure que le Gestionnaire des tâches).', 'gray']),
        ...(perf.freed ? L([`La veille a libéré environ ${perf.freed} Mo (estimation : un processus peut servir plusieurs pages d'un même site).`, 'g']) : []),
        ...L(['eco : mode économie (veille plus rapide : set eco-sleep, moins de processus) · sleep : mettre les autres pages en veille · rm 3 : fermer la page 3', 'gray']),
        ...L(['Actualisé toutes les 2 secondes.', 'gray']));
    }
  } else if (err) {
    lines.push(...doneLine('open', host(tab!.url)),
      ...L([`open: Connexion impossible. ${host(tab!.url)} ne répond pas.`, 'r']), ...L(),
      ...table('Détail      Valeur', '------      ------'),
      ...L('Code        ', [err, 'r']), ...L('Adresse     ' + tab!.url), ...L(),
      ...L('Vérifiez l\'orthographe ou essayez :'),
      ...L('  ', ['retry', 'y'], ['                       réessayer', 'gray']),
      ...L('  ', ['curl', 'y'], [` "${host(tab!.url)}"`, 'cy'], ['        rechercher sur le web', 'gray']));
  } else if (!tab || !tab.url) {
    // Nouvelle page : blocs choisis par « set newpage » (clock, date, shortcuts, recent, hint), dans cet ordre.
    const now = new Date();
    const s = st!.session, parts = st!.settings.newpage;
    const mine = s.items.filter((i): i is TabItem => i.kind === 'tab' && i.spaceId === s.activeSpace);
    const asleep = mine.filter(t => st!.live[t.id]?.asleep && t.url).length;
    const has = (p: typeof parts[number]) => parts.includes(p);
    if (parts.length) lines.push(...doneLine('start'), ...L());
    if (has('clock')) lines.push(...bigText(hhmm(now)).flatMap(l => L(['  ' + l, 'clock'])), ...L());
    if (has('date')) lines.push(...L('  ', [day(now), 'w'], `  ·  space ${spaceName()}  ·  ${mine.length} onglet${mine.length > 1 ? 's' : ''}, ${asleep} en veille`), ...L());
    if (activeTab()?.private) lines.push(...L('  ', [T('private-badge'), 'priv'], ['  ni historique, ni cookies gardés · tout est effacé à la fermeture de la dernière page privée', 'gray']), ...L());
    const sc = has('shortcuts') ? shortcutList() : [];
    const rc = has('recent') ? recent.slice(0, 5) : [];
    if (has('shortcuts') || has('recent')) {
      // Vraies cellules de largeur fixe : chaque ligne reste alignée, quelle que soit la longueur ou la langue des textes.
      const head = [...(has('shortcuts') ? ['Alt', 'Raccourci'] : []), ...(has('recent') ? ['Récent'] : [])];
      const widths = [...(has('shortcuts') ? [5, 30] : []), ...(has('recent') ? [60] : [])];
      const rows: (string | HTMLElement)[][] = [];
      for (let k = 0; k < Math.max(sc.length, rc.length, 1); k++) {
        const p = sc[k], r = rc[k];
        const row: (string | HTMLElement)[] = [];
        if (has('shortcuts')) {
          if (p) {
            const a = el('span', p.label, 'a');
            if (p.tab) a.dataset.tab = p.tab; else a.dataset.url = p.url;
            a.title = p.url;
            row.push(String(k + 1), a);
          } else row.push(k === 0 ? '-' : '', k === 0 ? 'shortcut add <site>' : '');
        }
        if (has('recent')) {
          const c = el('span');
          if (r) { const [verb, ...rest] = r.split(' '); c.append(el('span', verb, 'y'), rest.length ? ' ' + rest.join(' ') : ''); }
          row.push(c);
        }
        rows.push(row);
      }
      lines.push(...grid(head, widths, rows, [], '  '), ...L());
    }
    if (has('hint')) lines.push(...L(['  ' + T('newpage-hint'), 'gray']));
  }
  box.hidden = lines.length === 0;
  box.replaceChildren(...lines);
  // Page interne ouverte (ext, settings, history, guide…) : croix rouge en haut à droite pour la fermer (aussi Ctrl+C).
  if (page) {
    const close = el('span', '[X]', 'close');
    close.title = 'Fermer · Ctrl+C';
    close.setAttribute('aria-label', 'Fermer');
    close.onclick = closeInternal;
    box.prepend(close); // en tête : un float placé après le texte tomberait sous la dernière ligne
  }
}

/** Ferme la page interne affichée et revient au site / à la nouvelle page. */
function closeInternal() {
  if (!page) return;
  page = null;
  send({ t: 'internal', on: false });
  renderStatus();
  renderInternal();
  renderPage();
  renderPrompt();
}

/** Mot de commande connu (coloré en jaune) : tout ce que parse ne prend pas pour une adresse ou une recherche. */
function isCommand(word: string) {
  const a = parse(word, st?.settings.search ?? 'google');
  return !!a && a.type !== 'navigate';
}

function ghost() {
  const v = cmd.value;
  if (!v || typing || ask || cmd.selectionStart !== v.length) return '';
  const fill = sugg[sel]?.fill ?? recent.find(r => r.startsWith(v) && r !== v);
  return fill && fill.startsWith(v) ? fill.slice(v.length) : '';
}

/** Recopie colorée du texte tapé dans l'invite du bas, plus la suite proposée en gris (comme PSReadLine). */
function paintCmd() {
  const m = $('cmd-m');
  const plain = !!typing || !!ask;
  cmd.classList.toggle('plain', plain);
  if (plain) return m.replaceChildren();
  const parts: HTMLElement[] = cmd.value.split(/(\s+)/).map((tok, k) =>
    el('span', tok, k === 0 && tok && isCommand(tok) ? 'y' : /^-/.test(tok) ? 'gray' : /^"/.test(tok) ? 'cy' : ''));
  const g = ghost();
  if (g) parts.push(el('span', g, 'gray'));
  m.replaceChildren(...parts);
  m.scrollLeft = cmd.scrollLeft;
}

function renderPrompt() {
  $('seal').textContent = typing ? `${ps()}saisie: ` : ask ? `${ps()}${ask.input ? 'nom: ' : '(o/N) '}` : ps();
  $('hint').textContent = typing ? 'Entrée envoyer · Tab remplir seulement · Échap annuler'
    : ask ? 'Entrée valider · Échap annuler'
    : textTab() ? `-- ${tv.percent()} % --  ↑↓ choisir · Entrée ouvrir · Espace page suiv.` : sugg.length ? '' : T('hint');
  $('addr-verb').hidden = !(document.activeElement === addr || addr.value);
  const box = $('sugg');
  box.hidden = sugg.length === 0;
  box.classList.toggle('cmd', suggFor === 'cmd');
  if (sugg.length) {
    // Vue liste de PSReadLine : en-tête avec le nombre de propositions par source, ligne choisie en bleu.
    const kinds = new Map<string, number>();
    for (const s of sugg) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    const head = el('div', '', 'it gray');
    head.append(el('span', `<-/${sugg.length}>`, 'l'), el('span', `<${[...kinds].map(([k, n]) => `${k}(${n})`).join(' ')}>`, 'k'));
    const items = sugg.map((s, k) => {
      const r = el('div', '', 'it' + (k === sel ? ' sel' : ''));
      const l = el('span', '', 'l');
      const [w, ...rest] = s.label.split(' ');
      l.append('> ', s.command ? el('span', w, 'y') : w, rest.length ? ' ' + rest.join(' ') : '');
      r.append(l, el('span', `[${s.kind}]`, 'k'));
      r.setAttribute('role', 'option');
      r.onmousedown = e => { e.preventDefault(); s.run(); done(); };
      return r;
    });
    const foot = el('div', '↑↓ choisir  ·  Entrée ouvrir  ·  ' + (suggFor === 'addr' ? 'Ctrl+Entrée nouvel onglet' : 'Tab compléter  ·  → accepter la suite') + '  ·  Échap annuler', 'gray');
    box.replaceChildren(head, ...items, foot);
  } else box.replaceChildren();
  paintCmd();
  // resizing : l'interface passe au-dessus du site pour garder la souris pendant qu'on tire la poignée.
  const overlay = sugg.length > 0 || !$('boot').hidden || !!menu || resizing;
  if (overlay !== document.body.classList.contains('overlay')) {
    document.body.classList.toggle('overlay', overlay);
    send({ t: 'overlay', on: overlay });
  }
}

function done() {
  if (suggFor === 'cmd') cmd.value = '';
  else { addr.blur(); renderStatus(); }
  sugg = [];
  sel = 0;
  renderPrompt();
}

// ── barre d'adresse (haut) : adresse ou recherche, propositions Google ──
let google: string[] = [];
let suggestTimer = 0;
function addrSuggest() {
  const text = addr.value.trim();
  suggFor = 'addr';
  sel = 0;
  // Menu Store : la barre cherche une extension, pas sur le web (Entrée lance la recherche).
  if (!st || !text || page === 'store' || page === 'tabs' || page === 'bookmarks') { sugg = []; return renderPrompt(); }
  const engine = st.settings.search;
  const url = toUrl(text);
  const go = (u: string) => () => send({ t: 'run', input: u });
  const out: Sugg[] = [url
    ? { label: url, kind: 'Adresse', run: go(url) }
    : { label: `"${text}"`, kind: 'Recherche', run: go(searchUrl(text, engine)) }];
  // Un seul mot (youtube) : on propose aussi le site en .com, comme « open youtube ».
  const guess = !url && /^[a-z0-9-]{2,}$/i.test(text) ? toUrl(text + '.com') : null;
  if (guess) out.push({ label: guess, kind: 'Adresse', run: go(guess) });
  const q = text.toLowerCase();
  if (q.length >= 2) {
    for (const t of st.session.items.filter((i): i is TabItem => i.kind === 'tab' && !!i.url && (i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q))).slice(0, 2)) {
      out.push({ label: tabLabel(t).slice(0, 70), kind: 'Onglet ouvert', run: () => send({ t: 'activate', id: t.id }) });
    }
  }
  for (const g of google) if (g.toLowerCase() !== q) out.push({ label: g, kind: 'Suggestion', fill: g, run: go(searchUrl(g, engine)) });
  sugg = out.slice(0, 8);
  renderPrompt();
}
addr.addEventListener('input', () => {
  if (page === 'tabs') { tabQuery = addr.value.trim(); renderInternal(); } // find-tab : filtre en direct
  if (page === 'bookmarks') { bmQuery = addr.value.trim(); renderInternal(); }
  google = [];
  addrSuggest();
  clearTimeout(suggestTimer);
  const q = addr.value.trim();
  // Page privée : rien de ce qui est tapé ne part vers le moteur de recherche avant Entrée.
  if (st?.settings.suggest && !activeTab()?.private && q && !toUrl(q)) suggestTimer = window.setTimeout(() => send({ t: 'suggest', q }), 120);
});
// Clic : toute l'adresse est sélectionnée, taper la remplace.
let filled = false;
addr.addEventListener('focus', () => { addr.select(); filled = true; renderPrompt(); });
addr.addEventListener('mouseup', e => { if (filled) e.preventDefault(); filled = false; });
addr.addEventListener('blur', () => {
  if (suggFor === 'addr') sugg = [];
  const t = activeTab();
  addr.value = page || !t ? '' : t.url; // on quitte la barre : elle remontre l'adresse de la page
  renderPrompt();
});
addr.addEventListener('keydown', e => {
  if (e.key === 'Escape') { done(); send({ t: 'focus-page' }); }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sugg.length) {
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : sugg.length - 1)) % sugg.length;
    if (sugg[sel].fill) addr.value = sugg[sel].fill!;
    renderPrompt();
  } else if (e.key === 'Enter' && page === 'bookmarks') {
    const b = bmMatches()[0];
    if (b) send({ t: 'run', input: b.url });
    addr.value = '';
    done();
  } else if (e.key === 'Enter' && page === 'tabs') {
    const t = tabMatches()[0];
    if (t) send({ t: 'activate', id: t.id });
    addr.value = '';
    done();
  } else if (e.key === 'Enter' && page === 'store') {
    const v = addr.value.trim();
    if (v) send({ t: 'run', input: 'ext store ' + v });
    addr.value = '';
    done();
  } else if (e.key === 'Enter') {
    const v = addr.value.trim();
    // Ctrl+Entrée : dans un nouvel onglet.
    if (e.ctrlKey && v) send({ t: 'run', input: 'start ' + (toUrl(v) ?? searchUrl(v, st!.settings.search)) });
    else if (sugg[sel]) sugg[sel].run();
    else if (v) send({ t: 'run', input: toUrl(v) ?? searchUrl(v, st!.settings.search) });
    done();
  }
});
$('top').addEventListener('mousedown', e => { if (e.target !== addr) { e.preventDefault(); addr.focus(); } });

// ── invite de commandes (bas) ──
/** État courant donné à la complétion des paramètres (src/shared/complete.ts). */
function completionCtx(): Ctx {
  const s = st!.settings, ses = st!.session;
  return {
    spaces: ses.spaces.map(x => x.name),
    tabs: tree(ses.items, ses.activeSpace).flatMap(({ item }) => item.kind === 'tab' ? [tabLabel(item)] : []),
    exts: exts.map(e => ({ name: e.name, off: e.off })),
    mods: mods.map(m => ({ name: m.name, on: s.mods.includes(m.name) })),
    widgets: Object.entries(WIDGETS).map(([id, desc]) => ({ id, desc, on: s.sidebar.includes(id as keyof typeof WIDGETS) })),
    parts: Object.entries(PARTS).map(([id, desc]) => ({ id, desc, hidden: s.hidden.includes(id as keyof typeof PARTS) })),
    aliases: Object.keys(s.aliases), binds: Object.keys(s.binds), shortcuts: s.shortcuts,
    closed: st!.closed.slice(0, Math.max(s.closedMax, 1)).map(c => c.title || host(c.url) || 'nouvelle page'),
    sleepNever: s.sleepNever, colors: Object.keys(COLORS), texts: Object.keys(TEXTS),
    bookmarks: s.bookmarks.map(b => b.name || host(b.url)),
    folders: ses.items.flatMap(i => i.kind === 'folder' && i.spaceId === ses.activeSpace ? [i.name] : []),
    host: (() => { const t = activeTab(); try { return t?.url ? new URL(t.url).hostname.replace(/^www\./, '') : ''; } catch { return ''; } })(),
    httpsAllow: s.httpsAllow, blockAllow: s.blockAllow,
  };
}

function cmdSuggestions(text: string): Sugg[] {
  if (!st || !text.trim()) return [];
  const n = /^\d+$/.test(text.trim()) && textTab() ? tv.refOf(Number(text)) : undefined;
  if (n) return [{ label: `suivre ${tv.labelOf(n).slice(0, 80)}`, kind: 'Lien', run: () => { tv.select(n); tv.activate(n); } }];
  const runText = (t: string) => () => send({ t: 'run', input: t });
  const fillIn = (t: string) => () => { cmd.value = t; cmdInput(); cmd.focus(); };
  const low = text.trimStart().toLowerCase();
  // Paramètres de la commande (comme Minecraft) : « ext rm » propose les extensions, « set theme » les thèmes…
  // Choisir une valeur la recopie seulement dans l'invite : Entrée une seconde fois exécute (jamais d'action par erreur).
  const values = complete(text, completionCtx());
  if (values.length) return values.map(v => ({ label: `${v.label}  — ${v.desc}`, kind: 'Paramètre', command: true, fill: v.fill, run: fillIn(v.fill) }));
  // Commandes qui commencent par ce qui est tapé (Tab complète, Entrée exécute).
  const out: Sugg[] = COMMANDS.filter(([c]) => c.startsWith(low) && c.trim() !== low.trim()).slice(0, 6)
    .map(([c, d]) => ({ label: `${c.trim()}  — ${d}`, kind: 'Commande', command: true, fill: c,
      run: c.endsWith(' ') ? fillIn(c) : runText(c) }));
  // Mots-clés : « sidebar width » trouve « set sidebar-width », « largeur barre » aussi.
  if (out.length < 6 && /[a-zà-ÿ]{2}/i.test(low)) {
    for (const [c, d] of searchCommands(low, COMMANDS)) {
      if (out.length >= 6 || out.some(s => s.fill?.trim() === c.trim())) continue;
      out.push({ label: `${c.trim()}  — ${d}`, kind: 'Mot-clé', command: true, fill: c, run: c.endsWith(' ') ? fillIn(c) : runText(c) });
    }
  }
  for (const r of recent.filter(r => r.startsWith(low) && r !== low).slice(0, 2)) out.push({ label: r, kind: 'Historique', command: true, fill: r, run: runText(r) });
  if (low.length >= 2) {
    const tabs = st.session.items.filter((i): i is TabItem => i.kind === 'tab' && i.spaceId === st!.session.activeSpace);
    tabs.forEach((t, k) => {
      if (out.length < 8 && (t.title.toLowerCase().includes(low) || t.url.toLowerCase().includes(low))) out.push({ label: `sel ${k + 1}  ${tabLabel(t).slice(0, 50)}`, kind: 'Onglet ouvert', command: true, run: () => send({ t: 'activate', id: t.id }) });
    });
  }
  const a = parse(text, st.settings.search);
  if (a && !out.some(s => s.kind === 'Commande')) {
    const isSearch = a.type === 'navigate' && a.url.startsWith(searchUrl('', st.settings.search));
    out.push(isSearch ? { label: `curl "${text.trim()}"`, kind: 'Recherche', command: true, run: runText(text) }
      : a.type === 'navigate' ? { label: `${a.newTab ? 'start' : 'open'} ${host(a.url)}`, kind: 'Adresse', command: true, run: runText(text) }
      : a.type === 'error' ? { label: a.message, kind: 'Aide', run: () => {} }
      : { label: text.trim(), kind: 'Commande', command: true, run: runText(text) });
  }
  return out.slice(0, 8);
}
function cmdInput() {
  histPos = -1;
  if (ask || typing) return renderPrompt();
  suggFor = 'cmd';
  sugg = cmdSuggestions(cmd.value);
  sel = 0;
  renderPrompt();
}
cmd.addEventListener('input', cmdInput);
cmd.addEventListener('scroll', paintCmd);
cmd.addEventListener('keyup', paintCmd);
cmd.addEventListener('blur', () => { if (suggFor === 'cmd' && sugg.length) { sugg = []; renderPrompt(); } });

function endTyping() { typing = null; cmd.type = 'text'; cmd.value = ''; renderPrompt(); }

cmd.addEventListener('keydown', e => {
  if (typing) {
    if (e.key === 'Escape') { endTyping(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      send({ t: 'type', r: typing.r, text: cmd.value, submit: e.key === 'Enter' });
      endTyping();
    }
    return;
  }
  // Invite vide en mode texte : les touches pilotent la page, comme une appli de terminal.
  if (!cmd.value && !ask && !sugg.length && textTab()) {
    const keys: Record<string, () => void> = {
      ArrowDown: () => tv.move(1), ArrowUp: () => tv.move(-1), Enter: () => tv.activate(),
      ' ': () => tv.page(e.shiftKey ? -1 : 1), PageDown: () => tv.page(1), PageUp: () => tv.page(-1),
      Home: () => tv.edge(false), End: () => tv.edge(true), ArrowLeft: () => send({ t: 'run', input: 'back' }),
      Escape: () => { if (tv.panelOpen(textTab())) send({ t: 'spot', r: 0 }); },
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); renderPrompt(); return; }
  }
  if (e.key === 'Escape') {
    if (ask) { ask.answer(''); clearAsk(); }
    done();
    if (!textTab()) send({ t: 'focus-page' });
  } else if (e.key === 'ArrowRight' && ghost()) {
    e.preventDefault(); // accepter la suite grise
    cmd.value += ghost();
    cmdInput();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const s = sugg[sel];
    if (s?.fill) { cmd.value = s.fill; cmdInput(); }
  } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (histPos >= 0 || !cmd.value)) {
    // ↑ ↓ : commandes précédentes, comme dans un vrai terminal.
    e.preventDefault();
    const next = histPos + (e.key === 'ArrowUp' ? 1 : -1);
    if (next >= recent.length) return;
    histPos = Math.max(-1, next);
    cmd.value = histPos < 0 ? '' : recent[histPos];
    sugg = [];
    renderPrompt();
    cmd.setSelectionRange(cmd.value.length, cmd.value.length);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!sugg.length) return;
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : sugg.length - 1)) % sugg.length;
    renderPrompt();
  } else if (e.key === 'Enter') {
    const v = cmd.value.trim();
    if (ask) { const q = ask; clearAsk(); q.answer(q.input ? v : v.toLowerCase()); return done(); }
    const tab = activeTab();
    const s = sugg[sel];
    // Le texte tapé gagne s'il est déjà une commande ou une adresse ; sinon (début de mot, ↑↓) la proposition choisie.
    const a = parse(v, st!.settings.search);
    const complete = a && a.type !== 'error' && !(a.type === 'navigate' && a.url.startsWith(searchUrl('', st!.settings.search)));
    if (v === '?' && tab && st!.live[tab.id]?.error) send({ t: 'run', input: 'search ' + host(tab.url) });
    else if (s && (sel > 0 || !complete)) { s.run(); if (cmd.value.endsWith(' ') || s.kind === 'Paramètre') return; } // paramètre recopié : Entrée encore pour exécuter
    else if (v) send({ t: 'run', input: v });
    if (v && !tab?.private) { // une page privée ne laisse pas de « récent »
      if (recent[0] !== v) recent.unshift(v);
      recent.splice(200);
      try { localStorage.setItem('phos-hist', JSON.stringify(recent)); } catch { /* stockage indisponible : historique de session seulement */ }
    }
    histPos = -1;
    done();
  }
});
$('prompt').addEventListener('mousedown', e => { if (e.target !== cmd) { e.preventDefault(); cmd.focus(); } });

// ── barre latérale : clics et glisser-déposer ──
const side = $('side');
const rowOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('.row[data-id]');
side.addEventListener('click', e => {
  const r = rowOf(e);
  if (!r) return;
  send({ t: r.dataset.kind === 'folder' ? 'toggle-folder' : 'activate', id: r.dataset.id });
});
side.addEventListener('auxclick', e => {
  const r = rowOf(e);
  if (e.button === 1 && r?.dataset.kind === 'tab') send({ t: 'close', id: r.dataset.id });
});
let dragId: string | null = null;
let drop: { id: string | null; where: 'before' | 'after' | 'inside' } | null = null;
const clearDrop = () => side.querySelectorAll('.drop-before,.drop-after,.drop-inside').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-inside'));
// En-têtes de Space : glisser l'un sur l'autre change l'ordre des Spaces (comme space move).
let dragSpace: string | null = null;
let spaceDrop: { id: string; after: boolean } | null = null;
const spaceOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('.row[data-space]');
side.addEventListener('dragstart', e => { dragSpace = spaceOf(e)?.dataset.space ?? null; if (dragSpace) e.dataTransfer?.setData('text/plain', ''); });
side.addEventListener('dragover', e => {
  if (!dragSpace) return;
  const r = spaceOf(e);
  e.preventDefault();
  clearDrop();
  if (!r || r.dataset.space === dragSpace) { spaceDrop = null; return; }
  const box = r.getBoundingClientRect();
  spaceDrop = { id: r.dataset.space!, after: e.clientY > box.top + box.height / 2 };
  r.classList.add(spaceDrop.after ? 'drop-after' : 'drop-before');
});
side.addEventListener('drop', e => {
  if (!dragSpace) return;
  e.preventDefault();
  clearDrop();
  if (spaceDrop) {
    const rest = st!.session.spaces.filter(s => s.id !== dragSpace);
    send({ t: 'space-move', id: dragSpace, index: rest.findIndex(s => s.id === spaceDrop!.id) + (spaceDrop.after ? 1 : 0) });
  }
  dragSpace = spaceDrop = null;
});
side.addEventListener('dragend', () => { dragSpace = spaceDrop = null; });

// Boutons de la barre (historique, fermés…) : glisser l'un sur l'autre change leur ordre (sidebar move).
let dragWidget: string | null = null;
let widgetDrop: { w: string; after: boolean } | null = null;
const widgetOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('.row[data-widget]');
side.addEventListener('dragstart', e => { dragWidget = widgetOf(e)?.dataset.widget ?? null; });
side.addEventListener('dragover', e => {
  if (!dragWidget) return;
  const r = widgetOf(e);
  e.preventDefault();
  clearDrop();
  if (!r || r.dataset.widget === dragWidget) { widgetDrop = null; return; }
  const box = r.getBoundingClientRect();
  widgetDrop = { w: r.dataset.widget!, after: e.clientY > box.top + box.height / 2 };
  r.classList.add(widgetDrop.after ? 'drop-after' : 'drop-before');
});
side.addEventListener('drop', e => {
  if (!dragWidget) return;
  e.preventDefault();
  clearDrop();
  if (widgetDrop) {
    const rest = st!.settings.sidebar.filter(w => w !== dragWidget);
    send({ t: 'run', input: `sidebar move ${dragWidget} ${rest.indexOf(widgetDrop.w as typeof rest[number]) + (widgetDrop.after ? 2 : 1)}` });
  }
  dragWidget = widgetDrop = null;
});
side.addEventListener('dragend', () => { dragWidget = widgetDrop = null; });
side.addEventListener('dragstart', e => { dragId = rowOf(e)?.dataset.id ?? null; e.dataTransfer?.setData('text/plain', ''); });
side.addEventListener('dragover', e => {
  if (!dragId) return;
  e.preventDefault();
  clearDrop();
  const r = rowOf(e);
  if (!r || r.dataset.id === dragId) { drop = { id: null, where: 'after' }; return; }
  const box = r.getBoundingClientRect();
  const y = (e.clientY - box.top) / box.height;
  const where = r.dataset.kind === 'folder' && y > 0.25 && y < 0.75 ? 'inside' : y < 0.5 ? 'before' : 'after';
  drop = { id: r.dataset.id!, where };
  r.classList.add('drop-' + where);
});
side.addEventListener('drop', e => {
  if (!dragId) return;
  e.preventDefault();
  clearDrop();
  if (dragId && drop) send({ t: 'move', id: dragId, target: drop.id, where: drop.where });
  dragId = drop = null;
});
side.addEventListener('dragend', () => { clearDrop(); dragId = drop = null; });

// ── boutons ──
const runCmd = (input: string) => () => send({ t: 'run', input });
$('t-new').onclick = runCmd('start');
$('t-menu').onclick = () => {
  suggFor = 'addr';
  sel = 0;
  sugg = ([['settings', 'Paramètres'], ['man', 'Aide'], ['history', 'Historique'], ['undo', 'Rouvrir la page fermée'], ['rm -others', 'Fermer les autres pages']] as const)
    .map(([c, label]) => ({ label: `${c}  — ${label}`, kind: 'Menu', command: true, run: runCmd(c) }));
  renderPrompt();
};
$('w-min').onclick = () => send({ t: 'win', op: 'min' });
$('w-max').onclick = () => send({ t: 'win', op: 'max' });
$('w-close').onclick = () => send({ t: 'win', op: 'close' });
$('page').addEventListener('mousedown', e => { if (sugg.length && !(e.target as HTMLElement).closest('#sugg')) done(); });

// Position des « trous » où le processus principal place le site : la page entière (mode web) ou le panneau (mode texte).
const pageEl = $('page'), mediaEl = $('media');
const inner = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return { x: r.left + e.clientLeft, y: r.top + e.clientTop, width: e.clientWidth, height: e.clientHeight }; };
function sendLayout() {
  const page = inner(pageEl);
  let media = inner(mediaEl);
  if ($('out').hidden || !media.width) {
    // Panneau fermé : la page en coulisse garde la taille qu'aura le panneau, cachée derrière le texte.
    const width = Math.max(160, Math.round(Math.min(560, page.width * 0.42) - 30));
    media = { x: page.x + page.width - width, y: page.y + 30, width, height: Math.round(width * 9 / 16) };
  }
  send({ t: 'layout', page, media });
}
new ResizeObserver(sendLayout).observe(pageEl);
new ResizeObserver(sendLayout).observe(mediaEl);

setInterval(() => { if (page === 'perf') send({ t: 'perf' }); }, 2000);
let shownMinute = '';
setInterval(() => {
  document.querySelectorAll<HTMLElement>('[data-clock] .name').forEach(n => (n.textContent = '◷ ' + hhmm(new Date())));
  // Grande horloge de la nouvelle page : redessinée quand la minute change.
  const t = activeTab();
  if (st && !page && (!t || !t.url) && hhmm(new Date()) !== shownMinute) { shownMinute = hhmm(new Date()); renderInternal(); }
}, 5_000);
$('internal').addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-url],[data-tab],[data-run],[data-store],[data-guide],[data-fill]');
  if (!a) return;
  if (a.dataset.run) {
    const id = /^ext store ([a-p]{32})$/.exec(a.dataset.run)?.[1];
    if (id) { installing.add(id); renderInternal(); }
    return send({ t: 'run', input: a.dataset.run });
  }
  if (a.dataset.guide) { const id = a.dataset.guide; if (!guideOpen.delete(id)) guideOpen.add(id); return renderInternal(); }
  if (a.dataset.fill !== undefined) {
    // Guide : la commande est recopiée dans l'invite (avec ses paramètres proposés), rien n'est exécuté tout seul.
    cmd.value = a.dataset.fill;
    cmd.focus();
    cmdInput();
    return;
  }
  if (a.dataset.store) {
    // Fiche d'une extension : lue une fois, puis gardée.
    const id = a.dataset.store;
    storeOpen = storeOpen === id ? null : id;
    if (storeOpen && !details.has(id)) { details.set(id, 'loading'); send({ t: 'store-detail', id }); }
    return renderInternal();
  }
  if (page === 'history' && (e.ctrlKey || e.metaKey) && a.dataset.t) {
    const t = Number(a.dataset.t);
    if (!picked.delete(t)) picked.add(t);
    return renderInternal();
  }
  if (a.dataset.tab) send({ t: 'activate', id: a.dataset.tab });
  else if (a.dataset.url) send({ t: 'run', input: a.dataset.url });
});
// Page history : Suppr efface les entrées choisies, Échap annule le choix.
addEventListener('keydown', e => {
  if (page !== 'history' || !picked.size || cmd.value) return;
  if (e.key === 'Delete') { e.preventDefault(); send({ t: 'history-rm', ts: [...picked] }); picked.clear(); }
  else if (e.key === 'Escape') { picked.clear(); renderInternal(); }
});
// Ctrl+C ferme le message affiché, sinon la page interne ouverte (sauf si du texte est sélectionné : on le laisse copier, ou si on tape une commande).
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return;
  if (!page && !$('msg').textContent) return;
  if (window.getSelection()?.toString() || (document.activeElement === cmd && cmd.value)) return;
  e.preventDefault();
  if ($('msg').textContent) { clearTimeout(msgTimer); $('msg').textContent = ''; }
  else closeInternal();
});

// ── poignée de la barre latérale : tirer pour changer sa largeur (enregistrée par set sidebar-width) ──
{
  const grip = $('grip');
  // Barre à droite (set sidebar-side right) : la largeur se compte depuis le bord droit.
  const width = (x: number) => Math.round(Math.min(480, Math.max(110, st?.settings.sideRight ? innerWidth - x : x)));
  grip.addEventListener('pointerdown', e => { resizing = true; grip.setPointerCapture(e.pointerId); renderPrompt(); });
  grip.addEventListener('pointermove', e => { if (resizing) document.documentElement.style.setProperty('--side-w', width(e.clientX) + 'px'); });
  const end = (e: PointerEvent) => {
    if (!resizing) return;
    resizing = false;
    send({ t: 'run', input: 'set sidebar-width ' + width(e.clientX) });
    renderPrompt();
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  grip.addEventListener('dblclick', () => send({ t: 'run', input: 'set sidebar-width 180' }));
}

// ── menus clic droit (comme Opera GX) : onglets, Spaces, dossiers ──
type Item = { label: string; hint?: string; run?: () => void; danger?: boolean } | '-';
function closeMenu() { menu?.remove(); menu = null; renderPrompt(); }
function openMenu(x: number, y: number, items: Item[]) {
  closeMenu();
  const m = el('div', '', 'ctx');
  m.setAttribute('role', 'menu');
  for (const it of items) {
    if (it === '-') { m.append(el('div', '', 'sep')); continue; }
    const r = el('div', '', 'mi' + (it.danger ? ' danger' : '') + (it.run ? '' : ' off'));
    r.setAttribute('role', 'menuitem');
    r.append(el('span', it.label, 'l'), el('span', it.hint ?? '', 'k'));
    if (it.run) r.onmousedown = e => { e.preventDefault(); e.stopPropagation(); const f = it.run!; closeMenu(); f(); };
    m.append(r);
  }
  $('app').append(m);
  menu = m;
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.min(x, innerWidth - w - 4) + 'px';
  m.style.top = Math.min(y, innerHeight - h - 4) + 'px';
  renderPrompt();
}
addEventListener('mousedown', e => { if (menu && !menu.contains(e.target as Node)) closeMenu(); }, true);
addEventListener('keydown', e => { if (menu && e.key === 'Escape') { e.preventDefault(); closeMenu(); } }, true);
addEventListener('blur', () => { if (menu) closeMenu(); });

const ctx = (kind: string, id: string, op: string, arg?: string) => () => send({ t: 'ctx', kind, id, op, arg });
function tabMenu(id: string): Item[] {
  const t = st!.session.items.find((i): i is TabItem => i.kind === 'tab' && i.id === id);
  if (!t) return [];
  const live = st!.live[id];
  const others = st!.session.spaces.filter(s => s.id !== t.spaceId);
  return [
    { label: 'Nouvelle page à droite', hint: 'start', run: ctx('tab', id, 'new-right') },
    { label: 'Recharger', hint: 'r', run: ctx('tab', id, 'reload') },
    { label: 'Dupliquer', hint: 'cp', run: ctx('tab', id, 'dup') },
    { label: t.pinned ? 'Désépingler' : 'Épingler', hint: t.pinned ? 'unpin' : 'pin', run: ctx('tab', id, t.pinned ? 'unpin' : 'pin') },
    { label: live?.muted ? 'Remettre le son' : 'Couper le son', hint: 'mute', run: live?.asleep ? undefined : ctx('tab', id, 'mute') },
    { label: 'Copier l\'adresse', hint: 'clip', run: t.url ? ctx('tab', id, 'copy') : undefined },
    { label: 'Mettre en veille', hint: 'sleep', run: live?.asleep || id === st!.session.active[st!.session.activeSpace] ? undefined : ctx('tab', id, 'sleep') },
    '-',
    ...others.map(s => ({ label: `Déplacer vers ${s.name.toLowerCase()}`, hint: '→', run: ctx('tab', id, 'move', s.id) })),
    ...(others.length ? ['-' as const] : []),
    { label: 'Fermer', hint: 'rm', run: ctx('tab', id, 'close') },
    { label: 'Fermer les autres', hint: 'rm -others', run: ctx('tab', id, 'close-others') },
    { label: 'Fermer les pages à droite', run: ctx('tab', id, 'close-right') },
    { label: 'Rouvrir la page fermée', hint: 'undo', run: st!.closed.length ? () => send({ t: 'run', input: 'undo' }) : undefined },
  ];
}
function spaceMenu(id: string): Item[] {
  const sp = st!.session.spaces.find(s => s.id === id);
  if (!sp) return [];
  return [
    { label: 'Ouvrir', hint: 'cd ' + sp.name.toLowerCase(), run: ctx('space', id, 'open') },
    { label: 'Nouvelle page ici', run: ctx('space', id, 'new-tab') },
    { label: 'Renommer…', run: () => askText('Nouveau nom du Space :', sp.name.toLowerCase(), v => v && send({ t: 'ctx', kind: 'space', id, op: 'rename', arg: v })) },
    { label: 'Nouveau Space…', hint: 'md -space', run: () => askText('Nom du nouveau Space :', '', v => v && send({ t: 'ctx', kind: 'space', id, op: 'new', arg: v })) },
    '-',
    { label: 'Mettre ses pages en veille', run: ctx('space', id, 'sleep') },
    ...st!.session.spaces.filter(s => s.id !== id).map(s => ({ label: `Déplacer toutes ses pages vers ${s.name.toLowerCase()}`, hint: 'mv all', run: ctx('space', id, 'move-all', s.id) })),
    { label: 'Fermer ses pages', run: ctx('space', id, 'close-all') },
    '-',
    { label: 'Supprimer le Space…', danger: true, run: ctx('space', id, 'delete') },
  ];
}
function folderMenu(id: string): Item[] {
  const f = st!.session.items.find(i => i.kind === 'folder' && i.id === id);
  if (!f || f.kind !== 'folder') return [];
  return [
    { label: f.open ? 'Replier' : 'Déplier', run: ctx('folder', id, 'toggle') },
    { label: 'Nouvelle page dedans', run: ctx('folder', id, 'new-tab') },
    { label: 'Renommer…', hint: 'ren', run: () => askText('Nouveau nom du dossier :', f.name, v => v && send({ t: 'ctx', kind: 'folder', id, op: 'rename', arg: v })) },
    '-',
    { label: 'Supprimer le dossier (les pages restent)', hint: 'rmdir', danger: true, run: ctx('folder', id, 'delete') },
  ];
}
addEventListener('contextmenu', e => {
  const t = e.target as HTMLElement;
  const tab = t.closest<HTMLElement>('.tab, .row[data-kind="tab"]');
  const folder = t.closest<HTMLElement>('.row[data-kind="folder"]');
  const space = t.closest<HTMLElement>('.row[data-space]');
  const items = tab ? tabMenu(tab.dataset.id!) : folder ? folderMenu(folder.dataset.id!) : space ? spaceMenu(space.dataset.space!)
    : t.closest('#tabbar, #side') ? [
      { label: 'Nouvelle page', hint: 'start', run: () => send({ t: 'run', input: 'start' }) },
      { label: 'Rouvrir la page fermée', hint: 'undo', run: st?.closed.length ? () => send({ t: 'run', input: 'undo' }) : undefined },
      { label: 'Nouveau Space…', hint: 'md -space', run: () => askText('Nom du nouveau Space :', '', v => v && send({ t: 'run', input: 'md -space ' + v })) },
      '-' as const,
      { label: 'Performances', hint: 'top', run: () => send({ t: 'run', input: 'top' }) },
      { label: st?.settings.eco ? 'Quitter le mode éco' : 'Mode éco', hint: 'eco', run: () => send({ t: 'run', input: 'eco' }) },
    ] : null;
  if (!items || !st) return;
  e.preventDefault();
  openMenu(e.clientX, e.clientY, items);
});

// ── écran de démarrage (T1) ──
function boot() {
  if (booted || !st) return;
  booted = true;
  if (!st.settings.boot) return;
  const s = st.settings, b = $('boot');
  const pages = st.session.items.filter(i => i.kind === 'tab').length;
  const ok = (label: string, value: string) => L(`  ${label.padEnd(13)}${value.padEnd(16)}`, ['OK', 'g']);
  b.replaceChildren(...L([T('boot-title'), 'w'], ` — chargement du profil ${s.profile}`), ...L(),
    ...ok('Mémoire', `${st.memMo} Mo`), ...ok('Profil', s.profile), ...ok('Sceau', s.seal),
    ...ok('Spaces', String(st.session.spaces.length)), ...ok('Pages', `${pages} restaurée${pages > 1 ? 's' : ''}`),
    ...(navigator.onLine ? ok('Réseau', 'en ligne') : L(`  ${'Réseau'.padEnd(13)}${'hors ligne'.padEnd(16)}`, ['!!', 'r'])), ...L(),
    ...L('Prêt. Tapez ', ['man', 'y'], ' pour la liste des commandes. Une touche passe cet écran.'), ...L(), ps());
  b.hidden = false;
  renderPrompt();
  const end = () => { b.hidden = true; removeEventListener('keydown', end); renderPrompt(); cmd.focus(); };
  addEventListener('keydown', end);
  setTimeout(end, s.reduceMotion ? 300 : 900);
}

send({ t: 'ready' });
cmd.focus();
