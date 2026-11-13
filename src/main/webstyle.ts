// Ajouts discrets aux sites : la page reste intacte.

// YouTube sans Shorts (demandé dans le cahier des charges). Masquer ces blocs ne touche à aucune autre fonction.
export const SHORTS_CSS = 'ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],ytm-shorts-lockup-view-model,grid-shelf-view-model:has(a[href^="/shorts"]),ytd-guide-entry-renderer:has(a[href^="/shorts"]),ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),ytd-rich-item-renderer:has(a[href^="/shorts"]),yt-chip-cloud-chip-renderer:has(a[href^="/shorts"]){display:none!important}';

/** Monde isolé réservé à Phosphore (≠ 0, le monde du site). */
export const WORLD = 1999;

/**
 * Barre de défilement de la page (html) aux couleurs de l'interface. Les barres internes gardent celles du site :
 * body est remis à auto, sinon leurs ::-webkit-scrollbar (souvent display:none sur les carrousels) seraient ignorés.
 * Valeur refusée (pas une couleur CSS simple) : '' = barre par défaut de Chromium.
 */
export function scrollbarCss(thumb: unknown, track: unknown): string {
  // Aucun ; { } < > ni guillemet : la valeur est posée telle quelle dans les pages des sites.
  const ok = (v: unknown): v is string => typeof v === 'string' && /^[#\w (),.%/-]{1,60}$/.test(v);
  return ok(thumb) && ok(track) ? `html{scrollbar-color:${thumb} ${track}}body{scrollbar-color:auto}` : '';
}
