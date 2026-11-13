import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { argUrl } from '../src/main/openarg.ts';

const yes = () => true, cwd = process.cwd();

test('argUrl : adresses web et fichiers PDF/HTML locaux ouverts, le reste ignoré', () => {
  assert.equal(argUrl('https://a.com/x.pdf', cwd, () => false), 'https://a.com/x.pdf');
  const abs = pathToFileURL('doc final.pdf').href; // relatif à cwd, espace encodé
  assert.equal(argUrl('doc final.pdf', cwd, yes), abs);
  assert.equal(argUrl(abs, cwd, yes), abs); // file:// accepté aussi
  assert.match(argUrl('page.HTML', cwd, yes), /^file:\/\/\/.*page\.HTML$/);
  assert.match(argUrl('page.htm', cwd, yes), /^file:/);
  assert.equal(argUrl('doc.pdf', cwd, () => false), ''); // fichier absent
  for (const bad of ['.', 'virus.exe', 'notes.txt', '--flag=x.pdf', 'file://%zz/x.pdf', 'javascript:alert(1)', 'x'.repeat(5000) + '.pdf'])
    assert.equal(argUrl(bad, cwd, yes), '', bad);
});
