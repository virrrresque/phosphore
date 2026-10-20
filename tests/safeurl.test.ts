import assert from 'node:assert/strict';
import { test } from 'node:test';
import { externalScheme, isLocalHost, suspiciousUrl } from '../src/shared/safeurl.ts';

test('adresses piégées détectées', () => {
  assert.ok(suspiciousUrl('https://paypal.com@phishing.ru/login')); // identifiant dans l'URL
  assert.ok(suspiciousUrl('http://93.184.216.34/')); // IP brute
  assert.ok(suspiciousUrl('https://xn--pple-43d.com/')); // punycode (аpple)
  assert.ok(suspiciousUrl('https://pаypal.com/')); // « а » cyrillique mêlé à du latin
});

test('adresses normales non signalées', () => {
  for (const u of ['https://www.youtube.com/', 'https://github.com/a/b?x=1', 'http://localhost:3000/', 'https://accounts.google.com/signin'])
    assert.equal(suspiciousUrl(u), null, u);
});

test('protocoles non web ignorés', () => {
  assert.equal(suspiciousUrl('app://ui/index.html'), null);
});

test('adresses locales / réseau privé reconnues (exemptées de https-only)', () => {
  for (const h of ['localhost', '127.0.0.1', '::1', '10.0.0.5', '192.168.1.1', '172.16.0.9', 'nas', 'routeur.localhost'])
    assert.equal(isLocalHost(h), true, h);
  for (const h of ['youtube.com', 'www.google.com', '8.8.8.8', '172.15.0.1', '172.32.0.1'])
    assert.equal(isLocalHost(h), false, h);
});

test('externalScheme : applications externes, jamais les schémas internes ou dangereux', () => {
  assert.equal(externalScheme('mailto:a@b.c'), 'mailto');
  assert.equal(externalScheme('zoommtg://zoom.us/join?x=1'), 'zoommtg');
  for (const u of ['https://a.com', 'http://a.com', 'chrome-extension://x/p.html', 'file:///C:/a.exe', 'javascript:alert(1)', 'search-ms:query=x', 'ms-msdt:/id', 'app://ui/index.html', 'about:blank', 'pas une url'])
    assert.equal(externalScheme(u), '', u);
});
