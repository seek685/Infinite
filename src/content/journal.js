import { parsePost } from './frontmatter.js';

const files = import.meta.glob('../posts/*.md', { query: '?raw', import: 'default', eager: true });
export const posts = [];
for (const [path, source] of Object.entries(files)) {
  try {
    posts.push(parsePost(path, source));
  } catch (error) {
    console.warn(`[Journal] ${path}: ${error.message}`);
  }
}
posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

export const categories = [...new Set(posts.map(post => post.category))];
export const postHref = post => `#journal/${encodeURIComponent(post.slug)}`;
export const postForAnchor = anchor => posts.find(post => post.anchor === anchor);
