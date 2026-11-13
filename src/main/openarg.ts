// Argument de ligne de commande → adresse à ouvrir dans un onglet (« Ouvrir avec » de Windows, navigateur par défaut).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Fichiers locaux qu'un onglet peut afficher : tout autre fichier (exe, script…) est ignoré. */
export const LOCAL_PAGE = /\.(pdf|html?)$/i;

/** Adresse http(s) telle quelle ; chemin (absolu, relatif à cwd, ou file://) d'un PDF/HTML existant → file:// ; sinon ''. */
export function argUrl(arg: string, cwd: string, exists: (p: string) => boolean): string {
  if (arg.length > 4096 || arg.startsWith('-')) return '';
  if (/^https?:\/\//i.test(arg)) return arg;
  try {
    const p = path.resolve(cwd, /^file:/i.test(arg) ? fileURLToPath(arg) : arg);
    return LOCAL_PAGE.test(p) && exists(p) ? pathToFileURL(p).href : '';
  } catch { return ''; } // file:// mal formé
}
