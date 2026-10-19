// Publie une nouvelle version de Phosphore : tests, version +1 (commit + tag), installateur envoyé sur GitHub Releases, push.
// Les Phosphore installés la trouvent au démarrage (electron-updater) et l'installent à la fermeture.
// Prérequis : arbre git propre (tout commité) et « gh auth login » fait une fois (le jeton sert à l'envoi, jamais inclus dans l'appli).
import { execSync } from 'node:child_process';

const sh = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: env ?? process.env });
let token = process.env.GH_TOKEN;
if (!token) {
  try { token = execSync('gh auth token').toString().trim(); }
  catch { console.error('Pas de jeton GitHub : lancez « gh auth login » une fois.'); process.exit(1); }
}

sh('npm test');
sh('npm version patch -m "release v%s"'); // refuse si des modifications ne sont pas commitées
sh('npm run build');
sh('npx electron-builder --win nsis --publish always', { ...process.env, GH_TOKEN: token });
sh('node scripts/sha256.mjs');
sh('git push --follow-tags');
