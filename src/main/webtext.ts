// Mode texte : la page réelle tourne en coulisse, ce script la convertit en lignes de terminal.
// Exécuté dans un monde isolé : le site ne voit pas ce code et ne peut pas le modifier.
import type { Settings } from '../shared/types.js';

/**
 * API exposée au processus principal (dans le monde isolé uniquement) :
 *  __phos.snap(v)      → null si rien n'a changé depuis la version v, sinon { v, title, lines, media }
 *  __phos.act(r)       → 'input' | 'password' | 'ok' | 'gone'   (clic sur l'élément r)
 *  __phos.focus(r)     → focalise et sélectionne le champ r avant une saisie
 *  __phos.spot(r)      → met la vidéo / l'image r en vedette (0 = aucune)
 *  __phos.media(op, x) → play | pause | mute | seek | full
 *  __phos.more()       → fait défiler la page réelle pour charger la suite
 * Format d'une ligne : [genre, [[texte, ref, type], ...]]  genre = p | h1..h6 | li | pre | img | video
 */
export const TEXT_SCRIPT = String.raw`(() => {
  if (window.__phos) return;
  const ids = new WeakMap(), refs = new Map();
  let next = 1, version = 0, dirty = true, spotEl = null, cache = null, last = 0;
  const ref = el => { let n = ids.get(el); if (!n) { n = next++; ids.set(el, n); } refs.set(n, new WeakRef(el)); return n; };
  const get = r => refs.get(r)?.deref();
  new MutationObserver(() => { dirty = true; }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'style', 'class', 'aria-hidden', 'open', 'value', 'src', 'href'] });
  addEventListener('scroll', () => { dirty = true; }, { passive: true, capture: true });

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'HEAD', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'MATH']);
  const ACT = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=option],[role=switch],[contenteditable=""],[contenteditable=true]';
  const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'contents', 'ruby']);
  const clean = s => (s || '').replace(/\s+/g, ' ');
  // Pendant une mise en vedette, la page est masquée (visibility) : innerText serait vide, on lit textContent.
  const txt = e => !e ? '' : spotEl ? e.textContent || '' : e.innerText || '';
  const MAX_CHARS = 400000, MAX_LINES = 6000;
  // YouTube sans Shorts.
  const YT = /(^|\.)youtube\.com$/.test(location.hostname);
  const YT_SKIP = 'ytd-reel-shelf-renderer,[is-shorts],ytm-shorts-lockup-view-model,ytd-rich-shelf-renderer[is-shorts],a[href^="/shorts"],grid-shelf-view-model:has(a[href^="/shorts"]),ytd-rich-item-renderer:has(a[href^="/shorts"]),ytd-video-renderer:has(a[href^="/shorts"])';

  function label(el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) {
      const type = (el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return ['[' + (el.checked ? 'X' : ' ') + '] ' + clean(txt(el.labels?.[0]) || el.getAttribute('aria-label') || el.name), 'c'];
      if (type === 'submit' || type === 'button' || type === 'reset') return [el.value || type, 'b'];
      const name = clean(el.getAttribute('aria-label') || el.placeholder || txt(el.labels?.[0]) || el.name || 'texte').trim();
      const val = type === 'password' ? '•'.repeat(Math.min((el.value || '').length, 12)) : clean(el.isContentEditable ? txt(el) : el.value).trim();
      return [name.slice(0, 60) + ': ' + (val.slice(0, 80) || '____________'), type === 'password' ? 'p' : 'i'];
    }
    if (tag === 'SELECT') return [clean(el.getAttribute('aria-label') || el.name) + ': ' + clean(el.selectedOptions?.[0]?.text) + ' ▼', 'b'];
    const role = el.getAttribute('role');
    if (role === 'checkbox' || role === 'switch') return ['[' + (el.getAttribute('aria-checked') === 'true' ? 'X' : ' ') + '] ' + clean(txt(el) || el.getAttribute('aria-label')), 'c'];
    const t = clean(txt(el)).trim() || clean(el.getAttribute('aria-label') || el.title || el.querySelector('img[alt]')?.alt || '').trim();
    return [t.slice(0, 200), tag === 'A' || role === 'link' ? 'l' : 'b'];
  }

  function snap(since) {
    const media = mediaState();
    // Au plus une conversion par seconde : certains sites (lecteurs vidéo) modifient leur page en continu.
    if (cache && (!dirty || Date.now() - last < 1000)) return since === version ? { v: version, media } : { ...cache, media };
    version++;
    dirty = false;
    last = Date.now();
    const lines = [], disp = new Map();
    let cur = null, curBlock = null, chars = 0;
    const display = e => { let d = disp.get(e); if (d === undefined) { d = getComputedStyle(e).display; disp.set(e, d); } return d; };
    const blockOf = el => { for (let e = el; e && e !== document.body; e = e.parentElement) if (!INLINE.has(display(e))) return e; return document.body; };
    const kindOf = b => { const h = b.closest('h1,h2,h3,h4,h5,h6'); return h ? h.tagName.toLowerCase() : b.closest('pre') ? 'pre' : b.closest('li') ? 'li' : 'p'; };
    const push = (block, seg) => {
      if (block !== curBlock || !cur) { cur = [kindOf(block), []]; lines.push(cur); curBlock = block; }
      const last = cur[1][cur[1].length - 1];
      if (!seg[1] && last && !last[1]) last[0] += seg[0]; else cur[1].push(seg);
      chars += seg[0].length;
    };
    const line = (kind, seg) => { lines.push([kind, [seg]]); cur = null; chars += seg[0].length; };
    const opts = { visibilityProperty: !spotEl, contentVisibilityAuto: true };
    // Ordre de lecture : fenêtres du site (consentement, connexion…), puis contenu principal, puis menus.
    const body = document.body || document.documentElement;
    const modals = [...body.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')]
      .filter(d => d.checkVisibility() && txt(d).trim().length > 20 && !d.parentElement.closest('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]'));
    const main = [...body.querySelectorAll('main,[role=main]')].find(m => m.checkVisibility() && txt(m).length > 200 && !modals.some(d => d.contains(m)));
    const done = new Set();
    const walk = root => { done.add(root); const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter(root)); while (w.nextNode()); };
    const section = title => { lines.push(['hr', [['──────── ' + title + ' ────────', 0]]]); cur = null; };
    const filter = root => ({
      acceptNode(n) {
        if (n !== root && done.has(n)) return NodeFilter.FILTER_REJECT;
        if (chars > MAX_CHARS || lines.length > MAX_LINES) return NodeFilter.FILTER_REJECT;
        if (n.nodeType === 3) {
          const t = n.parentElement && n.parentElement.closest('pre') ? n.nodeValue : clean(n.nodeValue);
          if (t && t.trim()) push(blockOf(n.parentElement), [t, 0]);
          else if (t && cur) push(blockOf(n.parentElement), [' ', 0]);
          return NodeFilter.FILTER_SKIP;
        }
        if (SKIP.has(n.tagName) || n.getAttribute('aria-hidden') === 'true' || !n.checkVisibility(opts) || (YT && n.matches(YT_SKIP))) return NodeFilter.FILTER_REJECT;
        if (n.tagName === 'VIDEO') {
          const r = n.getBoundingClientRect();
          if (r.width >= 120 || n === spotEl) line('video', [clean(n.getAttribute('aria-label') || n.title || document.title).slice(0, 160), ref(n), 'v']);
          return NodeFilter.FILTER_REJECT;
        }
        if (n.tagName === 'IMG') {
          const r = n.getBoundingClientRect();
          const big = (r.width >= 160 && r.height >= 100) || n === spotEl;
          if (big && !n.closest('a,button,[role=button],[role=link]')) line('img', [clean(n.alt || n.title || 'image').slice(0, 160), ref(n), 'm']);
          return NodeFilter.FILTER_REJECT;
        }
        if (n.matches(ACT)) {
          const [t, type] = label(n);
          if (t.trim() && !(YT && t.trim() === 'Shorts')) push(blockOf(n), [t, ref(n), type]);
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    for (const d of modals) { section('FENÊTRE DU SITE'); walk(d); }
    if (modals.length) section('PAGE');
    if (main) { walk(main); section('MENUS DU SITE'); }
    walk(body);
    const out = [];
    for (const [k, segs] of lines) {
      if (segs.length && !segs[0][1]) segs[0][0] = segs[0][0].trimStart();
      if (segs.length && !segs[segs.length - 1][1]) segs[segs.length - 1][0] = segs[segs.length - 1][0].trimEnd();
      const kept = segs.filter(s => s[1] || s[0]);
      if (kept.length) out.push([k, kept]);
    }
    cache = { v: version, title: document.title, lines: out };
    return { ...cache, media };
  }

  function mediaState() {
    const v = spotEl;
    if (!v || !v.isConnected) return null;
    return v.tagName === 'VIDEO'
      ? { r: ids.get(v), kind: 'video', t: v.currentTime || 0, d: Number.isFinite(v.duration) ? v.duration : 0, paused: v.paused, muted: v.muted }
      : { r: ids.get(v), kind: 'img' };
  }

  function act(r) {
    const el = get(r);
    if (!el || !el.isConnected) return 'gone';
    const type = (el.type || '').toLowerCase();
    if ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color'].includes(type)) || el.tagName === 'TEXTAREA' || el.isContentEditable) {
      el.focus();
      return type === 'password' ? 'password' : 'input';
    }
    if (el.tagName === 'VIDEO' || el.tagName === 'IMG') { spot(r); return 'ok'; }
    el.click();
    dirty = true;
    return 'ok';
  }

  function focus(r) {
    const el = get(r);
    if (!el) return false;
    el.focus();
    if (el.select) el.select();
    else if (el.isContentEditable) document.getSelection().selectAllChildren(el);
    return document.activeElement === el;
  }

  function spot(r) {
    if (spotEl) spotEl.removeAttribute('data-phos-spot');
    spotEl = r ? get(r) || null : null;
    if (spotEl) spotEl.setAttribute('data-phos-spot', '');
    document.documentElement.toggleAttribute('data-phos-spotting', !!spotEl);
    dirty = true;
    return !!spotEl;
  }

  async function media(op, x) {
    const v = spotEl && spotEl.tagName === 'VIDEO' ? spotEl : document.querySelector('video');
    if (!v) return false;
    if (v !== spotEl) spot(ref(v));
    if (op === 'play' || op === 'pause' || op === 'toggle') {
      const want = op === 'toggle' ? v.paused : op === 'play';
      if (want === !v.paused) return true;
      // Le lecteur du site d'abord (un clic sur la vidéo) : sinon il remet son propre état.
      v.click();
      await new Promise(r => setTimeout(r, 400));
      if (want !== !v.paused) want ? await v.play().catch(() => {}) : v.pause();
    }
    else if (op === 'mute') v.muted = !v.muted;
    else if (op === 'seek') v.currentTime = Math.max(0, x < 0 ? v.currentTime + x : x);
    else if (op === 'fwd') v.currentTime += x;
    else if (op === 'full') v.requestFullscreen().catch(() => {});
    return true;
  }

  function more() { scrollBy(0, innerHeight * 3); dirty = true; }

  window.__phos = { snap, act, focus, spot, media, more };
})();`;

/**
 * Mise en vedette : seul l'élément choisi (vidéo ou image) reste visible et remplit la page,
 * qui est affichée dans le panneau « sortie » à droite. Les ancêtres perdent ce qui casserait position:fixed.
 */
export function spotCss(s: Settings): string {
  const tint = s.images === 'tint'
    ? ({ amber: 'grayscale(1) sepia(1) saturate(3) hue-rotate(-12deg) brightness(.85)', green: 'grayscale(1) sepia(1) saturate(3) hue-rotate(75deg) brightness(.85)', white: 'grayscale(1) brightness(.85)' })[s.theme]
    : 'none';
  return `html[data-phos-spotting],html[data-phos-spotting] body{background:#000!important;overflow:hidden!important}
html[data-phos-spotting] :has([data-phos-spot]){transform:none!important;filter:none!important;contain:none!important;will-change:auto!important;perspective:none!important;backdrop-filter:none!important;z-index:auto!important;opacity:1!important;clip-path:none!important;mask:none!important}
html[data-phos-spotting] body :not(:has([data-phos-spot])):not([data-phos-spot]){visibility:hidden!important}
[data-phos-spot]{visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;object-fit:contain!important;z-index:2147483647!important;background:#000!important;transform:none!important}
img[data-phos-spot]{filter:${tint}!important}`;
}

/** Largeur « virtuelle » de la page en coulisse : assez grande pour que les sites affichent leur version ordinateur. */
export const VIRTUAL_WIDTH = 1280;
