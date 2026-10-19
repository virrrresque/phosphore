// Publie une nouvelle version de Phosphore : tests, version +1 (commit + tag), construction, push, puis release GitHub
// avec l'installateur, son .blockmap et latest.yml (lu par electron-updater). Les Phosphore installés la trouvent au démarrage.
// Prérequis : arbre git propre (tout commité) et « gh auth login » fait une fois. Aucun jeton n'entre dans l'appli.
// Relancer après un échec d'envoi : node scripts/release.mjs --upload (renvoie les fichiers de la version actuelle).
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';

const sh = cmd => execSync(cmd, { stdio: 'inherit' });
const gh = (...args) => execFileSync('gh', args, { stdio: 'inherit' });
try { execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' }); }
catch { console.error('GitHub CLI absent ou non connecté : lancez « gh auth login » une fois.'); process.exit(1); }

if (!process.argv.includes('--upload')) {
  sh('npm test');
  sh('npm version patch -m "release v%s"'); // refuse si des modifications ne sont pas commitées
  sh('npm run build');
  sh('npx electron-builder --win nsis --publish never');
  sh('node scripts/sha256.mjs');
  sh('git push --follow-tags');
}

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const exe = `release/Phosphore-Setup-${version}.exe`;
const files = [exe, exe + '.blockmap', 'release/latest.yml', 'release/SHA256SUMS.txt'];
for (const f of files) if (!fs.existsSync(f)) { console.error('Fichier manquant : ' + f + ' (npm run dist ?)'); process.exit(1); }
// latest.yml doit annoncer cette version, sinon l'auto-update installerait un autre fichier.
if (!fs.readFileSync('release/latest.yml', 'utf8').includes(`version: ${version}`)) { console.error('release/latest.yml ne correspond pas à ' + version); process.exit(1); }

const tag = 'v' + version;
let exists = true;
try { execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' }); } catch { exists = false; }
if (exists) gh('release', 'upload', tag, ...files, '--clobber');
else gh('release', 'create', tag, ...files, '--title', version, '--notes', `Phosphore ${version}`, '--latest');
console.log(`Release ${tag} publiée avec ${files.length} fichiers.`);
