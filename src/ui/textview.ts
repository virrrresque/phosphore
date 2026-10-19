// Mode texte : affiche une page web convertie en lignes de terminal, et le panneau « sortie » (vidéo / image).
// Le contenu vient du site : tout passe par textContent, jamais par innerHTML.
import type { Line, MediaState, PageSnap } from '../shared/types.js';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, text = '', cls = '') => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const time = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class TextView {
  private snaps = new Map<string, PageSnap>();
  private media = new Map<string, MediaState | null>();
  private sel = new Map<string, number>();       // ref sélectionnée, par onglet
  private auto = new Set<string>();              // onglets où la vidéo a déjà été mise en vedette d'office
  private numbers = new Map<number, number>();   // numéro affiché → ref
  private shownTab: string | null = null;
  private moreAt = 0;
  readonly text = $('text');

  constructor(private send: (m: Record<string, unknown>) => void, private onChange: () => void) {
    this.text.addEventListener('scroll', () => {
      const t = this.text;
      if (t.scrollTop + t.clientHeight > t.scrollHeight - 80 && Date.now() - this.moreAt > 2000) {
        this.moreAt = Date.now();
        this.send({ t: 'more' }); // la page réelle défile pour charger la suite (défilement infini)
      }
      this.onChange();
    });
    this.text.addEventListener('click', e => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (s) { this.select(Number(s.dataset.r)); this.activate(); }
    });
  }

  update(snap: PageSnap, activeTab: string | null) {
    if (snap.lines) this.snaps.set(snap.tabId, snap);
    const prev = this.media.get(snap.tabId);
    this.media.set(snap.tabId, snap.media);
    // Une vidéo sur la page : elle s'affiche d'office dans le panneau, une seule fois par page.
    const video = this.snaps.get(snap.tabId)?.lines?.find(l => l[0] === 'video');
    if (video && !snap.media && !this.auto.has(snap.tabId)) {
      this.auto.add(snap.tabId);
      this.send({ t: 'spot', r: video[1][0][1] });
    }
    if (snap.tabId !== activeTab) return;
    if (snap.lines) this.render(snap.tabId);
    if (snap.lines || JSON.stringify(prev) !== JSON.stringify(snap.media)) this.renderPanel(snap.tabId);
  }

  /** Nouvelle page dans l'onglet : on oublie la mise en vedette automatique. */
  forget(tabId: string) { this.auto.delete(tabId); this.snaps.delete(tabId); this.media.delete(tabId); this.sel.delete(tabId); }

  show(tabId: string | null) {
    if (tabId === this.shownTab) return;
    this.shownTab = tabId;
    this.text.scrollTop = 0;
    if (tabId) { this.render(tabId); this.renderPanel(tabId); }
  }

  hasLines(tabId: string) { return !!this.snaps.get(tabId)?.lines; }
  panelOpen(tabId: string | null) { return !!tabId && !!this.media.get(tabId); }
  percent() {
    const t = this.text;
    return t.scrollHeight <= t.clientHeight ? 100 : Math.round(((t.scrollTop + t.clientHeight) / t.scrollHeight) * 100);
  }
  refOf(n: number) { return this.numbers.get(n); }

  private render(tabId: string) {
    const snap = this.snaps.get(tabId);
    const t = this.text;
    const top = t.scrollTop;
    this.numbers.clear();
    if (!snap?.lines) { t.replaceChildren(el('div', 'CHARGEMENT…', 'mute')); return; }
    let n = 0;
    const out: HTMLElement[] = [];
    for (const [kind, segs] of snap.lines as Line[]) {
      const row = el('div', '', 'ln ' + kind);
      const flat = segs.map(s => s[0]).join('');
      if (kind === 'img' || kind === 'video') {
        const [text, r] = segs[0];
        this.numbers.set(++n, r);
        const s = el('span', `[${kind === 'img' ? 'IMAGE' : 'VIDÉO'} ${n}] ${text}`, 'a m');
        s.dataset.r = String(r);
        row.append(s);
      } else {
        if (kind === 'li') row.append('  • ');
        for (const [text, r, type] of segs) {
          if (!r) { row.append(kind[0] === 'h' ? text.toUpperCase() : text); continue; }
          this.numbers.set(++n, r);
          const label = type === 'b' ? `‹${text}›` : type === 'i' || type === 'p' ? `[${text}]` : text;
          const s = el('span', `[${n}]${label}`, 'a ' + (type ?? 'l'));
          s.dataset.r = String(r);
          row.append(s);
        }
        if (kind === 'h1') row.append('\n', el('span', '='.repeat(Math.min(flat.length, 60)), 'mute'));
        if (kind === 'p' && flat.length > 100) row.classList.add('long');
      }
      out.push(row);
    }
    if (!out.length) out.push(el('div', '(PAGE VIDE — essayez : view web)', 'mute'));
    t.replaceChildren(...out);
    t.scrollTop = top;
    this.mark(tabId);
  }

  private mark(tabId: string) {
    this.text.querySelector('.sel')?.classList.remove('sel');
    const r = this.sel.get(tabId);
    if (r) this.text.querySelector(`[data-r="${r}"]`)?.classList.add('sel');
  }

  private renderPanel(tabId: string) {
    const m = this.media.get(tabId);
    const out = $('out');
    out.hidden = !m;
    this.send({ t: 'panel', on: !!m });
    if (!m) return this.onChange();
    const line = this.snaps.get(tabId)?.lines?.find(l => l[1][0]?.[1] === m.r);
    const title = line?.[1][0][0] ?? '';
    $('out-head').replaceChildren(el('span', m.kind === 'video' ? ' SORTIE · VIDÉO ' : ' SORTIE · IMAGE ', 'tag'));
    const cap: (string | HTMLElement)[] = [el('span', title.slice(0, 120), 'strong'), '\n\n'];
    if (m.kind === 'video') {
      cap.push(`${m.paused ? '❚❚' : '▶'}  ${time(m.t)} / ${time(m.d)}${m.muted ? '   MUET' : ''}\n\n`,
        el('span', 'play · pause · seek 1:30 · seek +10\nmute · plein · ÉCHAP fermer', 'mute'));
    } else cap.push(el('span', 'ÉCHAP fermer', 'mute'));
    $('cap').replaceChildren(...cap);
    this.onChange();
  }

  // ── navigation clavier ──
  private spans() { return [...this.text.querySelectorAll<HTMLElement>('[data-r]')]; }

  select(r: number) {
    if (!this.shownTab) return;
    this.sel.set(this.shownTab, r);
    this.mark(this.shownTab);
    const s = this.text.querySelector<HTMLElement>(`[data-r="${r}"]`);
    s?.scrollIntoView({ block: 'nearest' });
    // Survoler une image au clavier l'affiche dans le panneau.
    if (s?.classList.contains('m')) this.send({ t: 'spot', r });
  }

  move(step: 1 | -1) {
    const all = this.spans();
    if (!all.length || !this.shownTab) return;
    const cur = all.findIndex(s => Number(s.dataset.r) === this.sel.get(this.shownTab!));
    let k: number;
    if (cur < 0 || !this.visible(all[cur])) {
      // Rien de sélectionné à l'écran : on part du premier élément visible.
      const box = this.text.getBoundingClientRect();
      k = all.findIndex(s => s.getBoundingClientRect().top >= box.top);
      if (k < 0) k = 0;
    } else k = Math.min(Math.max(cur + step, 0), all.length - 1);
    this.select(Number(all[k].dataset.r));
  }

  private visible(s: HTMLElement) {
    const a = s.getBoundingClientRect(), b = this.text.getBoundingClientRect();
    return a.bottom > b.top && a.top < b.bottom;
  }

  /** Entrée : ouvre le lien, appuie sur le bouton, ou demande le texte d'un champ. */
  activate(r = this.shownTab ? this.sel.get(this.shownTab) : undefined) {
    if (!r) return false;
    const s = this.text.querySelector<HTMLElement>(`[data-r="${r}"]`);
    this.send({ t: s?.classList.contains('m') ? 'spot' : 'act', r });
    return true;
  }

  labelOf(r: number) { return this.text.querySelector(`[data-r="${r}"]`)?.textContent ?? ''; }

  page(step: number) { this.text.scrollBy({ top: step * this.text.clientHeight * 0.9 }); }
  edge(end: boolean) { this.text.scrollTop = end ? this.text.scrollHeight : 0; }
}
