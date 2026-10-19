// Listes de blocage locales (anti-hameçonnage et anti-pub/traqueurs). Comparaison par NOM DE DOMAINE seulement :
// aucune URL n'est jamais envoyée à qui que ce soit. Téléchargées au plus une fois par jour, gardées dans %APPDATA%\Phosphore.
// Échec (réseau coupé, source indisponible) = silencieux : on ne bloque rien plutôt que de casser la navigation.
import fs from 'node:fs';
import path from 'node:path';
import type { Session } from 'electron';

/** Sources publiques gratuites (format « hosts » ou liste de domaines), concaténées par liste. */
export const LIST_SOURCES = {
  // Hameçonnage : Phishing.Database (domaines actifs) ; logiciels malveillants : hostfile d'abuse.ch (URLhaus).
  safe: ['https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt', 'https://urlhaus.abuse.ch/downloads/hostfile/'],
  // Publicités et traqueurs : liste unifiée StevenBlack (format hosts).
  ads: ['https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'],
} as const;
export type ListId = keyof typeof LIST_SOURCES;

const MAX_BYTES = 20 * 1024 * 1024; // garde-fou : une liste anormalement grosse est refusée
const SKIP = new Set(['localhost', 'localhost.localdomain', 'local', 'broadcasthost', 'ip6-localhost', 'ip6-loopback', '0.0.0.0']);

/**
 * Extrait les domaines d'une liste au format « hosts » (0.0.0.0 domaine) ou « un domaine par ligne ».
 * Ignore les commentaires (#), les IP seules et les entrées localhost.
 */
export function parseHostList(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const host = (parts.length > 1 ? parts[1] : parts[0]).toLowerCase();
    if (!host || SKIP.has(host) || /^[\d.:]+$/.test(host) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) continue;
    out.add(host.replace(/^www\./, ''));
  }
  return out;
}

/** Vrai si le domaine (ou un de ses parents) figure dans la liste : « ads.x.com » est bloqué si « x.com » l'est. */
export function domainListed(host: string, set: Set<string>): boolean {
  if (!set.size) return false;
  let h = host.toLowerCase().replace(/^www\./, '');
  if (set.has(h)) return true;
  for (let dot = h.indexOf('.'); dot >= 0; dot = h.indexOf('.')) {
    h = h.slice(dot + 1);
    if (h.includes('.') && set.has(h)) return true;
  }
  return false;
}

type Cache = { at: number; set: Set<string> };

/** Gère le téléchargement, le cache disque et l'interrogation des listes. Partagé par safebrowsing et blocklist. */
export class BlockLists {
  private sets: Record<ListId, Set<string>> = { safe: new Set(), ads: new Set() };
  private at: Record<ListId, number> = { safe: 0, ads: 0 };
  private busy = new Set<ListId>();
  private dir: string;
  private fetcher: (url: string) => Promise<Response>;
  constructor(dir: string, fetcher: (url: string) => Promise<Response>) { this.dir = dir; this.fetcher = fetcher; }

  private file(id: ListId) { return path.join(this.dir, `blocklist-${id}.txt`); }

  /** Charge la liste depuis le disque (au démarrage). */
  load(id: ListId): void {
    try {
      const f = this.file(id);
      const st = fs.statSync(f);
      this.sets[id] = parseHostList(fs.readFileSync(f, 'utf8'));
      this.at[id] = st.mtimeMs;
    } catch { /* pas encore téléchargée */ }
  }

  has(id: ListId, host: string): boolean { return domainListed(host, this.sets[id]); }
  size(id: ListId): number { return this.sets[id].size; }
  freshness(id: ListId): number { return this.at[id]; }

  /** Télécharge la liste si elle a plus d'un jour (ou jamais). Silencieux en cas d'échec. */
  async refresh(id: ListId, force = false): Promise<void> {
    if (this.busy.has(id)) return;
    if (!force && this.at[id] && Date.now() - this.at[id] < 864e5) return;
    this.busy.add(id);
    try {
      // Une source en panne n'empêche pas les autres ; toutes en panne = « liste vide » plus bas.
      const parts = await Promise.all(LIST_SOURCES[id].map(async url => {
        try {
          const r = await this.fetcher(url);
          if (!r.ok) return '';
          const buf = Buffer.from(await r.arrayBuffer());
          return buf.length > MAX_BYTES ? '' : buf.toString('utf8');
        } catch { return ''; }
      }));
      const text = parts.join('\n');
      const set = parseHostList(text);
      if (!set.size) throw new Error('liste vide');
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file(id), text);
      this.sets[id] = set;
      this.at[id] = Date.now();
    } catch { /* on garde l'ancienne liste (ou aucune) : jamais de blocage cassé */ }
    finally { this.busy.delete(id); }
  }
}
