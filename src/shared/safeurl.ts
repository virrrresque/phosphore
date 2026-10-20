// Détection d'adresses piégées (pur, sans accès Electron : testé dans tests/). N'EMPÊCHE rien : renvoie seulement
// un avertissement à montrer. But : repérer les URL d'hameçonnage qui imitent un vrai site.

/**
 * Adresse locale ou réseau privé (jamais forcée en https : souvent pas de certificat).
 * localhost, 127.x, ::1, 10.x, 192.168.x, 172.16-31.x, et les noms sans point (machine du réseau local).
 */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (!h.includes('.') && !h.includes(':')) return true; // nom d'hôte sans domaine (intranet)
  return false;
}

/** Lettres latines imitées par d'autres alphabets (cyrillique, grec) : « раypаl » n'est pas « paypal ». */
const CONFUSABLE = /[Ѐ-ӿͰ-ϿԀ-ԯ -↏]/;

/**
 * Renvoie une raison (en français) si l'adresse a l'air piégée, sinon null.
 * Vérifie : identifiants dans l'URL (user:pass@), IP brute, punycode (xn--), mélange d'alphabets (homographes).
 */
export function suspiciousUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // Identifiants glissés dans l'adresse : « https://paypal.com@site-piege.ru » mène en réalité à site-piege.ru.
  if (u.username || u.password) return `l'adresse contient un identifiant (…@) : le vrai site est « ${u.hostname} », pas ce qui précède le @`;
  const host = u.hostname;
  // Adresse IP brute au lieu d'un nom : rare pour un vrai site public.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return `adresse IP brute (${host}) au lieu d'un nom de site`;
  // Punycode : un nom affiché en caractères non latins, encodé « xn-- » dans l'URL.
  const puny = host.split('.').find(l => l.startsWith('xn--'));
  if (puny) return `nom de domaine en caractères spéciaux (${puny}) : peut imiter un autre site`;
  // Mélange d'alphabets : des lettres cyrilliques ou grecques qui ressemblent à des lettres latines.
  if (CONFUSABLE.test(host) && /[a-z]/i.test(host)) return `le nom de domaine mélange plusieurs alphabets (${host}) : peut imiter un autre site`;
  return null;
}

// Schémas jamais passés à Windows : internes au navigateur, ou détournés par des attaques connues (search-ms, ms-msdt…).
const BLOCKED_SCHEMES = /^(file|javascript|data|blob|about|chrome|chrome-untrusted|devtools|view-source|filesystem|app|search-ms|search|ms-msdt|ms-officecmd|ms-cxh|ms-cxh-full)$/i;
/** Lien vers une application externe (mailto:, zoommtg:, claude:…) : son schéma, sinon ''. */
export function externalScheme(url: string): string {
  const s = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] ?? '';
  return !s || /^(https?|chrome-extension)$/i.test(s) || BLOCKED_SCHEMES.test(s) ? '' : s.toLowerCase();
}
