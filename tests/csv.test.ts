import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, passHost, toCsv } from '../src/main/csv.ts';

test('parseCsv : export Chromium standard', () => {
  const rows = parseCsv('name,url,username,password,note\nGitHub,https://github.com/,moi,secret1,\nGmail,https://mail.google.com/,moi@gmail.com,"p,a""ss",x\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { url: 'https://github.com/', user: 'moi', pass: 'secret1' });
  // Champ avec virgule et guillemet échappé.
  assert.deepEqual(rows[1], { url: 'https://mail.google.com/', user: 'moi@gmail.com', pass: 'p,a"ss' });
});

test('parseCsv : lignes sans mot de passe ignorées, ordre des colonnes libre', () => {
  const rows = parseCsv('username,password,url\na,,https://x.fr\nb,pw,https://y.fr\r\n');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { url: 'https://y.fr', user: 'b', pass: 'pw' });
});

test('parseCsv : sans colonne password → erreur', () => {
  assert.throws(() => parseCsv('url,username\nhttps://x.fr,a\n'));
});

test('passHost', () => {
  assert.equal(passHost('https://mail.google.com/x'), 'mail.google.com');
  assert.equal(passHost('pas-une-url'), 'pas-une-url');
});

test('toCsv : relu à l\'identique par parseCsv (virgules, guillemets, sauts de ligne)', () => {
  const rows = [{ name: 'x.fr', url: 'https://x.fr', user: 'a,b', pass: 'p"a\nss' }, { name: 'y.fr', url: '', user: '', pass: 'pw' }];
  assert.deepEqual(parseCsv(toCsv(rows)), rows.map(({ url, user, pass }) => ({ url, user, pass })));
});
