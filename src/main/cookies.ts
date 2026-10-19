// Import des cookies d'un autre navigateur : Chromium (clé DPAPI de « Local State », puis AES-256-GCM v10),
// Firefox (cookies.sqlite, en clair) ou fichier cookies.txt (format Netscape).
// Tout reste local ; aucune valeur n'est affichée ni écrite ailleurs que dans la partition du Space.
import { execFileSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { CookiesSetDetails } from 'electron';

export const OPERA_GX = () => path.join(process.env.APPDATA ?? '', 'Opera Software', 'Opera GX Stable');

const LOCAL = () => process.env.LOCALAPPDATA ?? '';
const ROAM = () => process.env.APPDATA ?? '';
/** Navigateurs Chromium connus sous Windows : dossier « User Data » de chaque profil. Tous utilisent le même format de cookies. */
export function chromiumBrowsers(): { id: string; label: string; dir: string }[] {
  return [
    { id: 'chrome', label: 'Google Chrome', dir: path.join(LOCAL(), 'Google', 'Chrome', 'User Data') },
    { id: 'edge', label: 'Microsoft Edge', dir: path.join(LOCAL(), 'Microsoft', 'Edge', 'User Data') },
    { id: 'brave', label: 'Brave', dir: path.join(LOCAL(), 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { id: 'vivaldi', label: 'Vivaldi', dir: path.join(LOCAL(), 'Vivaldi', 'User Data') },
    { id: 'opera', label: 'Opera', dir: path.join(ROAM(), 'Opera Software', 'Opera Stable') },
    { id: 'operagx', label: 'Opera GX', dir: OPERA_GX() },
  ];
}

/** Premier chemin existant parmi plusieurs (profil Default de Chrome/Edge, ou racine du profil d'Opera). */
function firstExisting(dir: string, rels: string[][]): string | null {
  for (const parts of rels) { const f = path.join(dir, ...parts); if (fs.existsSync(f)) return f; }
  return null;
}
/** Fichier « Local State » (clé de chiffrement) du navigateur. */
const localStateFile = (dir: string) => firstExisting(dir, [['Local State']]);
/** Fichier SQLite des cookies : Chrome/Edge/Brave (Default/Network/Cookies) ou Opera (Network/Cookies). */
const cookieFile = (dir: string) =>
  firstExisting(dir, [['Default', 'Network', 'Cookies'], ['Network', 'Cookies'], ['Default', 'Cookies'], ['Cookies']]);

/** Navigateurs réellement installés (fichier de cookies présent), pour proposer le choix à l'utilisateur. */
export function installedBrowsers(): { id: string; label: string; dir: string }[] {
  return chromiumBrowsers().filter(b => b.dir && localStateFile(b.dir) && cookieFile(b.dir));
}

/** Clé AES du navigateur (fichier « Local State ») : déchiffrée par DPAPI pour le compte Windows courant (PowerShell, entrée standard). */
function masterKey(localState: string): Buffer {
  const st = JSON.parse(fs.readFileSync(localState, 'utf8'));
  const enc = Buffer.from(st?.os_crypt?.encrypted_key ?? '', 'base64');
  if (enc.subarray(0, 5).toString() !== 'DPAPI') throw new Error('clé de chiffrement introuvable dans Local State');
  const ps = 'Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd());'
    + "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { input: enc.subarray(5).toString('base64'), windowsHide: true });
  return Buffer.from(out.toString().trim(), 'base64');
}

/** Déchiffre un cookie v10. Base version 24+ : les 32 premiers octets sont le SHA-256 du domaine, retirés. */
export function decryptV10(key: Buffer, blob: Uint8Array, hashed: boolean): string {
  const b = Buffer.from(blob);
  const d = createDecipheriv('aes-256-gcm', key, b.subarray(3, 15));
  d.setAuthTag(b.subarray(b.length - 16));
  const plain = Buffer.concat([d.update(b.subarray(15, b.length - 16)), d.final()]);
  const s = plain.subarray(hashed ? 32 : 0).toString('utf8');
  plain.fill(0);
  return s;
}

const SAME_SITE = { [-1]: 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict' } as const;
type SameSite = CookiesSetDetails['sameSite'];
/** v20 : cookies Chrome 127+ chiffrés « liés à l'appli », illisibles hors de Chrome (comptés à part pour le dire). */
export type Read = { cookies: CookiesSetDetails[]; skipped: number; v20: number };

/** Cookie au format Electron. Préfixes : __Secure-/__Host- en https, __Host- sans domaine ; SameSite=None exige « secure ». */
export function toCookie(host: string, name: string, value: string, p: string, secure: boolean, httpOnly: boolean, sameSite: SameSite, exp?: number): CookiesSetDetails {
  const bare = host.replace(/^\./, '');
  const sec = secure || name.startsWith('__Secure-') || name.startsWith('__Host-');
  return {
    url: `${sec ? 'https' : 'http'}://${bare}${p || '/'}`,
    name, value, path: p || '/',
    ...(host.startsWith('.') && !name.startsWith('__Host-') ? { domain: host } : {}), // sans point : cookie limité à ce seul hôte
    secure: sec, httpOnly,
    sameSite: sameSite === 'no_restriction' && !sec ? 'unspecified' : sameSite,
    ...(exp ? { expirationDate: exp } : {}),
  };
}

type Row = { host_key: string; name: string; value: string; encrypted_value: Uint8Array; path: string; exp: number; is_secure: number; is_httponly: number; has_expires: number; samesite: number };

/**
 * Fichier « Cookies » d'un navigateur Chromium. localState : son « Local State » (clé), ou null (seuls les cookies non chiffrés passent).
 * Ignorés : expirés, partitionnés ; v20 comptés à part.
 */
export function readChromiumCookieFile(file: string, localState: string | null): Read {
  let db: DatabaseSync;
  try { db = new DatabaseSync(file, { readOnly: true }); db.prepare('select 1 from meta').get(); }
  catch { throw new Error('fichier des cookies verrouillé ou illisible : fermez complètement le navigateur source puis réessayez'); }
  let key: Buffer | null = null;
  try {
    if (localState) key = masterKey(localState);
    const hashed = Number((db.prepare("select value from meta where key='version'").get() as { value: string }).value) >= 24;
    const now = Date.now() / 1000;
    // expires_utc : microsecondes depuis 1601, converti en secondes Unix dans SQLite (dépasse 2^53 sinon).
    const rows = db.prepare(`select host_key, name, value, encrypted_value, path, expires_utc / 1000000 - 11644473600 as exp,
      is_secure, is_httponly, has_expires, samesite from cookies where top_frame_site_key = ''`).all() as Row[];
    const cookies: CookiesSetDetails[] = [];
    let skipped = 0, v20 = 0;
    for (const r of rows) {
      const ev = Buffer.from(r.encrypted_value);
      const tag = ev.subarray(0, 3).toString();
      if (r.has_expires && r.exp < now) { skipped++; continue; }
      if (ev.length && tag === 'v20') { v20++; continue; }
      let value = r.value;
      if (ev.length) {
        if (tag !== 'v10' || !key) { skipped++; continue; }
        try { value = decryptV10(key, ev, hashed); } catch { skipped++; continue; }
      }
      cookies.push(toCookie(r.host_key, r.name, value, r.path, !!r.is_secure, !!r.is_httponly, SAME_SITE[r.samesite as keyof typeof SAME_SITE] ?? 'unspecified', r.has_expires ? r.exp : undefined));
    }
    return { cookies, skipped, v20 };
  } finally { key?.fill(0); db.close(); }
}

/** Cookies du profil par défaut d'un navigateur Chromium installé (dossier « User Data »). */
export function readChromiumCookies(dir: string): Read {
  const file = cookieFile(dir);
  if (!file) throw new Error('fichier des cookies introuvable pour ce navigateur');
  const ls = localStateFile(dir);
  if (!ls) throw new Error('fichier « Local State » introuvable pour ce navigateur');
  return readChromiumCookieFile(file, ls);
}

/** Cherche « Local State » dans les dossiers parents d'un fichier Cookies (…/User Data/Default/Network/Cookies). */
function findLocalState(file: string): string | null {
  let d = path.dirname(file);
  for (let k = 0; k < 5; k++) {
    const f = path.join(d, 'Local State');
    if (fs.existsSync(f)) return f;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

/** Firefox (cookies.sqlite) : valeurs en clair. Firefox doit être fermé. */
export function readFirefoxCookies(file: string): Read {
  let db: DatabaseSync;
  try { db = new DatabaseSync(file, { readOnly: true }); }
  catch { throw new Error('cookies.sqlite verrouillé : fermez complètement Firefox puis réessayez'); }
  try {
    const now = Date.now() / 1000;
    const rows = db.prepare(`select host, name, value, path, expiry, isSecure, isHttpOnly, sameSite from moz_cookies where originAttributes = ''`).all() as
      { host: string; name: string; value: string; path: string; expiry: number; isSecure: number; isHttpOnly: number; sameSite: number }[];
    const cookies: CookiesSetDetails[] = [];
    let skipped = 0;
    // Firefox : 0 = None, 1 = Lax, 2 = Strict.
    const ss = (n: number): SameSite => n === 0 ? 'no_restriction' : n === 2 ? 'strict' : n === 1 ? 'lax' : 'unspecified';
    for (const r of rows) {
      const exp = r.expiry > 1e11 ? r.expiry / 1000 : r.expiry; // secondes (anciennes versions) ou millisecondes (récentes)
      if (exp && exp < now) { skipped++; continue; }
      cookies.push(toCookie(r.host, r.name, r.value, r.path, !!r.isSecure, !!r.isHttpOnly, ss(r.sameSite), exp || undefined));
    }
    return { cookies, skipped, v20: 0 };
  } finally { db.close(); }
}

/**
 * Fichier cookies.txt (format Netscape, exporté par l'extension « Get cookies.txt LOCALLY » ou yt-dlp) :
 * domaine \t sous-domaines \t chemin \t secure \t expiration \t nom \t valeur. « #HttpOnly_ » devant le domaine = httpOnly.
 */
export function parseNetscape(text: string): Read {
  const cookies: CookiesSetDetails[] = [];
  let skipped = 0;
  const now = Date.now() / 1000;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    let line = raw;
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) { httpOnly = true; line = line.slice(10); }
    if (!line.trim() || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length < 7) { skipped++; continue; }
    const [domain, sub, p, secure, expiry, name, ...rest] = f;
    const exp = Number(expiry);
    if (!domain || !name || (exp > 0 && exp < now)) { skipped++; continue; }
    const host = sub.toUpperCase() === 'TRUE' && !domain.startsWith('.') ? '.' + domain : domain;
    cookies.push(toCookie(host, name, rest.join('\t'), p, secure.toUpperCase() === 'TRUE', httpOnly, 'unspecified', exp > 0 ? exp : undefined));
  }
  return { cookies, skipped, v20: 0 };
}

/** N'importe quel fichier de cookies : cookies.txt, « Cookies » de Chromium (clé cherchée à côté) ou cookies.sqlite de Firefox. */
export function readCookieFile(file: string): Read & { kind: string } {
  if (fs.statSync(file).size > 200 * 1024 * 1024) throw new Error('fichier trop gros');
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  if (head.toString('latin1').startsWith('SQLite format 3')) {
    let tables: string[];
    try {
      const db = new DatabaseSync(file, { readOnly: true });
      tables = (db.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map(t => t.name);
      db.close();
    } catch { throw new Error('fichier verrouillé : fermez complètement le navigateur source puis réessayez'); }
    if (tables.includes('moz_cookies')) return { ...readFirefoxCookies(file), kind: 'Firefox' };
    if (tables.includes('cookies')) return { ...readChromiumCookieFile(file, findLocalState(file)), kind: 'Chromium' };
    throw new Error('base SQLite sans table de cookies');
  }
  return { ...parseNetscape(fs.readFileSync(file, 'utf8')), kind: 'cookies.txt' };
}
