import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { chromiumBrowsers, decryptV10, parseNetscape, toCookie } from '../src/main/cookies.ts';
import { parse } from '../src/shared/command.ts';

// Faux cookie chiffré comme Chromium : "v10" + nonce 12 octets + AES-256-GCM(sha256(domaine) + valeur) + tag.
function fake(key: Buffer, host: string, value: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(Buffer.concat([createHash('sha256').update(host).digest(), Buffer.from(value)])), c.final()]);
  return Buffer.concat([Buffer.from('v10'), iv, body, c.getAuthTag()]);
}

test('decryptV10 retrouve la valeur et retire le hash du domaine', () => {
  const key = randomBytes(32);
  assert.equal(decryptV10(key, fake(key, '.google.com', 'abc=1'), true), 'abc=1');
  assert.throws(() => decryptV10(randomBytes(32), fake(key, '.google.com', 'x'), true)); // mauvaise clé
});

test('import cookies est reconnu, avec ou sans navigateur', () => {
  assert.deepEqual(parse('import cookies'), { type: 'import-cookies', browser: '' });
  assert.deepEqual(parse('import cookies chrome'), { type: 'import-cookies', browser: 'chrome' });
});

test('cookies import : commande reconnue (fenêtre de choix, ou chemin donné)', () => {
  assert.deepEqual(parse('cookies import'), { type: 'import-cookie-file', file: '' });
  assert.deepEqual(parse('cookies import "C:\\a b\\cookies.txt"'), { type: 'import-cookie-file', file: 'C:\\a b\\cookies.txt' });
  assert.deepEqual(parse('import cookies file C:\\x\\Cookies'), { type: 'import-cookie-file', file: 'C:\\x\\Cookies' });
});

test('cookies.txt (Netscape) : domaine, httpOnly, secure, expirés ignorés', () => {
  const later = Math.floor(Date.now() / 1000) + 86400;
  const r = parseNetscape([
    '# Netscape HTTP Cookie File',
    `.youtube.com\tTRUE\t/\tTRUE\t${later}\tSID\tabc`,
    `#HttpOnly_.google.com\tTRUE\t/\tTRUE\t${later}\t__Secure-3PSID\txyz`,
    `www.site.fr\tFALSE\t/\tFALSE\t0\tsess\tv`, // cookie de session (expiration 0)
    `.old.com\tTRUE\t/\tFALSE\t1000\tx\ty`, // expiré
    'ligne cassée',
  ].join('\n'));
  assert.equal(r.cookies.length, 3);
  assert.equal(r.skipped, 2);
  const [yt, g, s] = r.cookies;
  assert.equal(yt.domain, '.youtube.com');
  assert.equal(yt.url, 'https://youtube.com/');
  assert.equal(g.httpOnly, true);
  assert.equal(g.secure, true);
  assert.equal(s.domain, undefined); // hôte seul
  assert.equal(s.expirationDate, undefined);
});

test('toCookie : __Host- sans domaine, SameSite=None sans secure refusé', () => {
  assert.equal(toCookie('.a.com', '__Host-x', 'v', '/', true, false, 'lax').domain, undefined);
  assert.equal(toCookie('.a.com', 'y', 'v', '/', false, false, 'no_restriction').sameSite, 'unspecified');
});

test('liste des navigateurs Chromium : identifiants attendus, chemins Windows absolus', () => {
  const ids = chromiumBrowsers().map(b => b.id);
  for (const id of ['chrome', 'edge', 'brave', 'opera', 'operagx', 'vivaldi']) assert.ok(ids.includes(id), id);
  if (process.env.LOCALAPPDATA) for (const b of chromiumBrowsers()) assert.match(b.dir, /^[A-Za-z]:\\/); // chemins Windows absolus
});
