// Installation d'une extension du Chrome Web Store : téléchargement du .crx, puis extraction de l'archive zip qu'il contient.
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

/** Identifiant d'extension (32 lettres a-p), tiré d'un lien du Web Store ou tapé tel quel. */
export function storeId(input: string): string | null {
  return /(?:^|[/=])([a-p]{32})(?:$|[/?#&])/.exec(input.trim())?.[1] ?? null;
}

export const storeUrl = (id: string, chromeMajor: string) =>
  `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${chromeMajor}.0.0.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;

/** Retire l'en-tête CRX (v2 ou v3) : il reste un zip ordinaire. */
export function crxToZip(b: Buffer): Buffer {
  if (b.toString('latin1', 0, 4) !== 'Cr24') throw new Error('fichier reçu invalide (pas un .crx)');
  const v = b.readUInt32LE(4);
  if (v === 3) return b.subarray(12 + b.readUInt32LE(8));
  if (v === 2) return b.subarray(16 + b.readUInt32LE(8) + b.readUInt32LE(12));
  throw new Error('version de .crx inconnue : ' + v);
}

export type ZipEntry = { method: number; compSize: number; size: number; local: number };

/** Table des fichiers d'un zip (sans rien décompresser). Dossiers et `_metadata` (signature du Store) ignorés. */
export function zipIndex(zip: Buffer, maxEntries = 10_000): Map<string, ZipEntry> {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('archive zip illisible');
  const count = zip.readUInt16LE(eocd + 10);
  if (count > maxEntries) throw new Error(`archive : ${count} fichiers (${maxEntries} au plus)`);
  const out = new Map<string, ZipEntry>();
  let p = zip.readUInt32LE(eocd + 16);
  for (let k = count; k > 0; k--) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('archive zip abîmée');
    const method = zip.readUInt16LE(p + 10), compSize = zip.readUInt32LE(p + 20), size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28), local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    if (!name.endsWith('/') && !name.startsWith('_metadata/')) out.set(name, { method, compSize, size, local });
  }
  return out;
}

/** Contenu d'un fichier du zip. La taille annoncée borne la décompression (une « bombe zip » ne gonfle pas au-delà). */
export function zipRead(zip: Buffer, e: ZipEntry, name = ''): Buffer {
  if (e.method !== 0 && e.method !== 8) throw new Error('compression non gérée dans ' + name);
  const start = e.local + 30 + zip.readUInt16LE(e.local + 26) + zip.readUInt16LE(e.local + 28);
  const data = zip.subarray(start, start + e.compSize);
  const out = e.method === 8 ? inflateRawSync(data, { maxOutputLength: e.size + 1 }) : data;
  if (out.length !== e.size) throw new Error('taille incohérente dans ' + name);
  return out;
}

/** Extrait un zip dans `dir`. Chemins hors du dossier refusés. */
export function unzip(zip: Buffer, dir: string): number {
  const root = path.resolve(dir);
  let n = 0;
  for (const [name, e] of zipIndex(zip)) {
    const out = path.resolve(root, name);
    if (!out.startsWith(root + path.sep)) throw new Error('chemin interdit dans l\'archive : ' + name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zipRead(zip, e, name));
    n++;
  }
  return n;
}

/** Télécharge et extrait l'extension dans `<base>/<id>` (remplace une version précédente). Renvoie le dossier. */
export async function installFromStore(id: string, base: string, chromeMajor: string, fetcher: (url: string) => Promise<Response>): Promise<string> {
  const res = await fetcher(storeUrl(id, chromeMajor));
  if (!res.ok) throw new Error(`Web Store : réponse ${res.status} (extension introuvable ?)`);
  const zip = crxToZip(Buffer.from(await res.arrayBuffer()));
  const dir = path.join(base, id);
  fs.rmSync(dir, { recursive: true, force: true });
  unzip(zip, dir);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('pas de manifest.json dans l\'extension');
  return dir;
}
