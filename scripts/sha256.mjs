// Écrit release/SHA256SUMS.txt : empreinte SHA-256 de chaque installateur (.exe) produit par electron-builder.
// Vérification côté utilisateur (PowerShell) : Get-FileHash ".\Phosphore Setup X.Y.Z.exe" -Algorithm SHA256
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = 'release';
let files;
try { files = readdirSync(dir).filter(f => f.endsWith('.exe')); }
catch { console.error('release/ introuvable : lancez d\'abord le build.'); process.exit(0); }
if (!files.length) { console.error('Aucun .exe dans release/.'); process.exit(0); }

const lines = files.map(f => {
  const hash = createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex');
  return `${hash}  ${f}`;
});
writeFileSync(path.join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log('release/SHA256SUMS.txt écrit :\n' + lines.join('\n'));
