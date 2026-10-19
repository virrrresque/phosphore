import assert from 'node:assert/strict';
import { test } from 'node:test';
import { domainListed, parseHostList } from '../src/main/blocklists.ts';

test('parseHostList : formats hosts et domaine simple, commentaires et IP ignorés', () => {
  const set = parseHostList([
    '# commentaire',
    '0.0.0.0 ads.example.com',
    '127.0.0.1 localhost', // ignoré (localhost)
    'tracker.net',
    '0.0.0.0 www.pub.fr', // www. retiré
    '8.8.8.8', // IP seule : ignorée
    '',
  ].join('\n'));
  assert.ok(set.has('ads.example.com'));
  assert.ok(set.has('tracker.net'));
  assert.ok(set.has('pub.fr'));
  assert.ok(!set.has('localhost'));
  assert.equal(set.size, 3);
});

test('domainListed : le domaine et ses sous-domaines, pas les voisins', () => {
  const set = parseHostList('doubleclick.net\nexample.com');
  assert.ok(domainListed('doubleclick.net', set));
  assert.ok(domainListed('ads.doubleclick.net', set)); // sous-domaine
  assert.ok(domainListed('www.example.com', set));
  assert.ok(!domainListed('notdoubleclick.net', set)); // voisin : pas bloqué
  assert.ok(!domainListed('example.org', set));
  assert.equal(domainListed('anything.com', new Set()), false); // liste vide
});
