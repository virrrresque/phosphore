// Ajouts discrets aux sites : la page reste intacte.

// YouTube sans Shorts (demandé dans le cahier des charges). Masquer ces blocs ne touche à aucune autre fonction.
export const SHORTS_CSS = 'ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],ytm-shorts-lockup-view-model,grid-shelf-view-model:has(a[href^="/shorts"]),ytd-guide-entry-renderer:has(a[href^="/shorts"]),ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),ytd-rich-item-renderer:has(a[href^="/shorts"]),yt-chip-cloud-chip-renderer:has(a[href^="/shorts"]){display:none!important}';

/** Monde isolé réservé à Phosphore (≠ 0, le monde du site). */
export const WORLD = 1999;
