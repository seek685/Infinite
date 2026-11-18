import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, parsePost } from '../src/content/frontmatter.js';

test('frontmatter preserves punctuation, quoted text and later Markdown separators on Windows', () => {
  const source = "\uFEFF---\r\ntitle: '轨道: Li''s #2' # 标题\r\ndate: 2026-11-18\r\ncategory: 实验\r\nsummary: \"相位: 01 #未舍入\"\r\nanchor: storm # 标点\r\n---\r\n正文\r\n---\r\n下一节";
  const post = parsePost('../posts/新日志.md', source);
  assert.equal(post.slug, '新日志');
  assert.equal(post.title, "轨道: Li's #2");
  assert.equal(post.summary, '相位: 01 #未舍入');
  assert.equal(post.anchor, 'storm');
  assert.equal(post.body, '正文\n---\n下一节');
});

test('multiline summaries, literal line breaks and unfeatured posts use the same authoring format', () => {
  const source = '---\ntitle: 夜航\ndate: 2026-11-12\ncategory: 实验\nsummary: >-\n  第一次经过\n  风暴眼。\nnote: |\n  一\n  二\n---\n正文';
  assert.equal(parseFrontmatter(source).fields.note, '一\n二');
  const post = parsePost('../posts/night.md', source);
  assert.equal(post.summary, '第一次经过 风暴眼。');
  assert.equal(post.anchor, '');
});

test('incomplete or ambiguous metadata identifies the error before the article enters the index', () => {
  assert.throws(() => parseFrontmatter('---\ntitle: 没有结束行'), /边界/);
  assert.throws(() => parseFrontmatter('---\ntitle: A\ntitle: B\n---'), /重复字段 title/);
  assert.throws(() => parsePost('a.md', '---\ntitle: A\n---'), /缺少字段 date/);
});
