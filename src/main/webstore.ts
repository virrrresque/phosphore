// Lecture des pages du Chrome Web Store (recherche, fiche d'une extension) pour le menu « ext store ».
// Le HTML vient d'Internet : on n'en garde que du texte court, jamais du HTML (l'interface affiche tout en textContent).

export type StoreItem = { id: string; name: string; rating: string };
export type StoreDetail = { id: string; name: string; summary: string; about: string; users: string; version: string; rating: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Texte brut : balises retirées, entités HTML décodées, espaces resserrés (retours à la ligne gardés). */
export function text(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Résultats d'une page de recherche : une carte par extension (data-item-id), avec son nom (<h2>) et sa note. */
export function parseSearch(html: string): StoreItem[] {
  const out: StoreItem[] = [];
  const cards = html.split(/data-item-id="/).slice(1);
  for (const c of cards) {
    const id = /^([a-p]{32})"/.exec(c)?.[1];
    if (!id || out.some(x => x.id === id)) continue;
    const name = text(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(c)?.[1] ?? '').slice(0, 120);
    const rating = /aria-label="[^"]*?(\d[.,]\d)[^"]*"/.exec(c)?.[1] ?? '';
    if (name) out.push({ id, name, rating });
    if (out.length >= 30) break;
  }
  return out;
}

/** Fiche d'une extension : titre et résumé (balises og:), texte de présentation, utilisateurs, version. */
export function parseDetail(id: string, html: string): StoreDetail {
  const meta = (p: string) => text(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`).exec(html)?.[1] ?? '');
  const name = meta('og:title').replace(/\s*-\s*Chrome Web Store\s*$/i, '').slice(0, 120);
  const summary = (meta('og:description') || meta('description')).slice(0, 300);
  // Présentation complète : le texte qui suit le titre « Présentation » / « Overview », jusqu'à la section suivante.
  const at = html.search(/>(Présentation|Overview|Übersicht|Descripción general|Panoramica)</);
  const rest = at < 0 ? '' : html.slice(at + 1, at + 40000);
  const end = rest.search(/>(Détails|Details|Confidentialité|Privacy|Datenschutz|Privacidad)</);
  let about = text(end < 0 ? rest.slice(0, 8000) : rest.slice(0, end + 1)).replace(/^(Présentation|Overview|Übersicht|Descripción general|Panoramica)\s*/, '');
  if (summary && about.startsWith(summary)) about = about.slice(summary.length).trim(); // le résumé est déjà affiché à part
  about = about.replace(/\s*\d[.,]\d\s*(?:sur|out of) 5[\s\S]*$/, '').slice(0, 2500); // le bloc des avis qui suit
  const users = (/([\d][\d\s  .,]*\+?)\s*(utilisateurs|users)/.exec(html)?.[1] ?? '').replace(/[\s  ]+/g, ' ').trim();
  const version = text(/Version<\/div>\s*<div[^>]*>([^<]{1,30})</.exec(html)?.[1] ?? '');
  const rating = /(\d[.,]\d)\s*(?:sur|out of)\s*5/.exec(html)?.[1] ?? '';
  return { id, name, summary, about, users, version, rating };
}
