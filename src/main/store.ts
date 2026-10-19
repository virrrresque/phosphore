import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const file = (name: string) => path.join(app.getPath('userData'), name + '.json');

/** Lit un fichier JSON. S'il est illisible, il est mis de côté (jamais écrasé sans copie). */
export function load(name: string): unknown {
  const f = file(name);
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      try { fs.renameSync(f, f.replace(/\.json$/, `.corrompu-${Date.now()}.json`)); } catch { /* rien à sauver */ }
    }
    return undefined;
  }
}

/** Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un fichier à moitié écrit. */
export function save(name: string, data: unknown): void {
  const f = file(name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(data));
  fs.renameSync(f + '.tmp', f);
}
