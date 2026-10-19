// Analyse de CSV de mots de passe (export Chrome / Edge / Opera). Pur : aucun accès Electron, testé dans tests/.
export type CsvRow = { url: string; user: string; pass: string };

/** Découpe un CSV en lignes de champs, en gérant les guillemets et les « , » / sauts de ligne à l'intérieur. */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      if (field || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex(h => names.includes(h));
  const iu = col('url', 'website', 'login_uri'), in_ = col('username', 'login', 'login_username'), ip = col('password', 'login_password');
  if (ip < 0) throw new Error('colonne « password » absente : ce n\'est pas un export de mots de passe');
  return rows.slice(1).flatMap(r => {
    const pass = r[ip] ?? '';
    return pass ? [{ url: (iu >= 0 ? r[iu] : '') ?? '', user: (in_ >= 0 ? r[in_] : '') ?? '', pass }] : [];
  });
}

export const passHost = (url: string) => { try { return new URL(url).host; } catch { return url.slice(0, 80); } };
