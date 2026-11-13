import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrollbarCss } from '../src/main/webstyle.ts';

test('scrollbarCss : couleurs du thème sur la page, refus de tout ce qui sortirait de la déclaration', () => {
  assert.equal(scrollbarCss('#3a3a3a', 'rgb(12 12 12 / 50%)'), 'html{scrollbar-color:#3a3a3a rgb(12 12 12 / 50%)}body{scrollbar-color:auto}');
  for (const bad of ['red;}body{display:none', '#000}', '"x"', '<b>', '', 'a'.repeat(61), 42, null])
    assert.equal(scrollbarCss(bad, '#000'), '', String(bad));
});
