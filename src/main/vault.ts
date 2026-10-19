// Coffre de mots de passe. Chaque mot de passe est chiffré un par un avec safeStorage (DPAPI sous Windows) :
// la liste n'a jamais besoin de les déchiffrer, et le fichier passwords.json ne contient aucun mot de passe en clair.
import { safeStorage } from 'electron';
import { passHost, type CsvRow } from './csv.js';

export type Entry = { host: string; url: string; user: string; enc: string };

/** Chiffre les lignes CSV en entrées de coffre. Chaque mot de passe est effacé (Buffer.fill(0)) après chiffrement. */
export function encryptRows(rows: CsvRow[]): Entry[] {
  return rows.map(r => {
    const buf = safeStorage.encryptString(r.pass);
    const enc = buf.toString('base64');
    buf.fill(0);
    return { host: passHost(r.url), url: r.url.slice(0, 2048), user: r.user.slice(0, 256), enc };
  });
}

export function decrypt(e: Entry): string {
  return safeStorage.decryptString(Buffer.from(e.enc, 'base64'));
}

/** Fusionne sans doublon (même host + user + mot de passe). */
export function merge(existing: Entry[], added: Entry[]): Entry[] {
  const seen = new Set(existing.map(e => e.host + '\0' + e.user));
  const out = [...existing];
  let n = 0;
  for (const e of added) {
    const k = e.host + '\0' + e.user;
    if (seen.has(k)) continue;
    seen.add(k); out.push(e); n++;
  }
  return out.slice(0, 10000);
}

export function available(): boolean {
  return safeStorage.isEncryptionAvailable();
}
