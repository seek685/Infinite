import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(source) {
  const html = marked.parse(source, { gfm: true, async: false });
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p','h1','h2','h3','h4','h5','h6','a','img','em','strong','del','br','hr','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','sup','sub','kbd'],
    ALLOWED_ATTR: ['href','src','alt','title','align','start','class'],
    ALLOW_DATA_ATTR: false,
  });
}
