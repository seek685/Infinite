// Posts use a flat YAML header: text fields, quoted scalars and indented | or > blocks.
function scalar(value) {
  if (value.startsWith('#')) return '';
  const quoted = value.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*(?:#.*)?$/);
  if (!quoted) return value.replace(/\s+#.*$/, '').trim();
  const text = quoted[1];
  return text.startsWith('"') ? JSON.parse(text) : text.slice(1, -1).replaceAll("''", "'");
}

export function parseFrontmatter(source) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const end = lines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line));
  if (!/^---\s*$/.test(lines[0]) || end < 1) throw new Error('缺少成对的 --- 头部边界');
  const fields = Object.create(null);
  for (let i = 1; i < end; i++) {
    if (!lines[i].trim() || /^\s*#/.test(lines[i])) continue;
    const match = /^([\w-]+):(?:\s+(.*)|\s*)$/.exec(lines[i]);
    if (!match) throw new Error(`第 ${i + 1} 行需要使用“字段: 值”格式`);
    const [, key, raw = ''] = match;
    if (Object.hasOwn(fields, key)) throw new Error(`重复字段 ${key}`);
    if (/^[|>][-+]?\s*(?:#.*)?$/.test(raw)) {
      const block = [];
      while (i + 1 < end && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim());
      fields[key] = block.join(raw[0] === '>' ? ' ' : '\n').trim();
    } else {
      fields[key] = scalar(raw);
    }
  }
  return { fields, body: lines.slice(end + 1).join('\n').trim() };
}

export function parsePost(path, source) {
  const { fields, body } = parseFrontmatter(source);
  for (const key of ['title', 'date', 'category', 'summary']) {
    if (!fields[key]) throw new Error(`缺少字段 ${key}`);
  }
  const date = new Date(fields.date + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fields.date) throw new Error('日期使用有效的 YYYY-MM-DD');
  const slug = path.split('/').pop().replace(/\.md$/, '');
  return { slug, title: fields.title, date: fields.date, category: fields.category, summary: fields.summary, anchor: fields.anchor || '', body };
}
