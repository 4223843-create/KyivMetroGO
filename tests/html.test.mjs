import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, richText } from '../src/ui/html.js';

test('escapeHtml екранує все', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(5), '5');
});

test('richText лишає <br> і сутності з даних, решту екранує', () => {
  assert.equal(richText('вул.&nbsp;Хрещатик<br>вихід 2'), 'вул.&nbsp;Хрещатик<br>вихід 2');
  assert.equal(richText('a<BR/>b<br />c'), 'a<br>b<br>c');
  assert.equal(richText('<b>"x"</b> & y'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y');
  assert.equal(richText('<br onclick=x>'), '&lt;br onclick=x&gt;');
});
