import './reader.css';
import { categories, posts, postHref } from '../content/journal.js';

const sections = new Set(['journal', 'projects', 'about']);

function routeFrom(hash) {
  const [section, ...rest] = hash.slice(1).split('/');
  if (!sections.has(section)) return null;
  let slug = rest.join('/');
  try { slug = decodeURIComponent(slug); } catch { /* An incomplete pasted URL gets the missing-post view. */ }
  return { section, slug };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function title(text, className = 'reader-title') {
  const heading = element('h2', className, text);
  heading.id = 'reader-title';
  heading.tabIndex = -1;
  return heading;
}

function metadata(post) {
  const line = element('div', 'entry-meta reader-meta');
  const date = element('time', '', post.date);
  date.dateTime = post.date;
  line.append(date, element('span', 'entry-category', post.category));
  return line;
}

function articleLink(post) {
  const link = element('a', 'journal-entry');
  link.href = postHref(post);
  const arrow = element('span', 'entry-arrow', '→');
  arrow.setAttribute('aria-hidden', 'true');
  link.append(metadata(post), element('h3', 'entry-title', post.title), element('p', 'entry-summary', post.summary), arrow);
  const item = element('li');
  item.append(link);
  return item;
}

function journalView(page, selectedCategory, selectCategory) {
  const heading = element('div', 'reader-heading');
  const count = element('span', 'reader-meta');
  count.setAttribute('aria-live', 'polite');
  heading.append(title('航行日志'), count);
  const filters = element('div', 'journal-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', '按日志分类筛选');
  const list = element('ul', 'journal-list');
  const update = category => {
    selectCategory(category);
    const visible = category ? posts.filter(post => post.category === category) : posts;
    for (const button of filters.children) button.setAttribute('aria-pressed', String(button.value === category));
    count.textContent = `${visible.length} 篇日志`;
    list.replaceChildren(...visible.map(articleLink));
  };
  for (const category of ['', ...categories]) {
    const button = element('button', '', category || '全部');
    button.type = 'button';
    button.value = category;
    button.addEventListener('click', () => update(category));
    filters.append(button);
  }
  page.append(heading, filters, list);
  update(selectedCategory);
}

function articleView(page, post) {
  const back = element('a', 'reader-back', '← 日志目录');
  back.href = '#journal';
  page.append(back);
  if (!post) {
    page.append(title('找不到这篇日志'), element('p', 'article-deck', '可以返回目录查看已发布的文章。'));
    return;
  }
  const article = element('article');
  const header = element('header', 'article-header');
  header.append(metadata(post), title(post.title, 'journal-title'), element('p', 'article-deck', post.summary));
  const body = element('div', 'prose', '正在载入正文…');
  article.append(header, body);
  page.append(article);
  async function loadBody() {
    body.setAttribute('aria-busy', 'true');
    try {
      const { renderMarkdown } = await import('../content/markdown.js');
      if (body.isConnected) body.replaceChildren(renderMarkdown(post.body));
    } catch {
      const retry = element('button', 'reader-back', '正文载入失败，点击重试');
      retry.addEventListener('click', loadBody, { once: true });
      body.replaceChildren(retry);
    } finally {
      body.removeAttribute('aria-busy');
    }
  }
  loadBody();
}

export function createReader(onReadingChange) {
  const dialog = document.querySelector('#reader');
  const page = dialog.querySelector('#reader-page');
  const scroll = dialog.querySelector('#reader-scroll');
  const closeButton = dialog.querySelector('#reader-close');
  const sectionLinks = document.querySelectorAll('.site-navigation a, .reader-toolbar a');
  const baseTitle = document.title;
  let currentHash = '', selectedCategory = '', indexScroll = 0, opener, dismissPending = false;
  const events = new AbortController();
  const listen = (node, type, handler) => node.addEventListener(type, handler, { signal: events.signal });

  async function hide() {
    if (!dialog.open) return;
    dialog.classList.add('is-closing');
    const slide = dialog.getAnimations().find(animation => animation.animationName === 'reader-out');
    if (slide) await slide.finished.catch(() => {});
    if (currentHash || !dialog.open) return;
    dialog.close();
    dialog.classList.remove('is-closing');
    document.documentElement.classList.remove('reading-open');
    onReadingChange(false);
    document.title = baseTitle;
    page.replaceChildren();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  function sync() {
    const route = routeFrom(location.hash);
    const nextHash = route ? location.hash : '';
    if (currentHash === nextHash) return;
    dismissPending = false;
    if (currentHash === '#journal') indexScroll = scroll.scrollTop;
    currentHash = nextHash;
    for (const link of sectionLinks) {
      if (link.hash === '#' + route?.section) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (!route) { hide(); return; }
    dialog.classList.remove('is-closing');
    if (!dialog.open) {
      opener = document.activeElement;
      onReadingChange(true);
      document.documentElement.classList.add('reading-open');
      dialog.showModal();
    }
    page.replaceChildren();
    if (route.section === 'journal') {
      if (route.slug) articleView(page, posts.find(post => post.slug === route.slug));
      else journalView(page, selectedCategory, category => { selectedCategory = category; });
    } else {
      page.append(document.querySelector(`#${route.section}-view`).content.cloneNode(true));
    }
    const heading = page.querySelector('#reader-title');
    document.title = `${heading.textContent} | Infinite Li`;
    scroll.scrollTop = route.section === 'journal' && !route.slug ? indexScroll : 0;
    heading.focus({ preventScroll: true });
  }

  function dismiss() {
    if (!currentHash || dismissPending) return;
    dismissPending = true;
    const depth = history.state?.orbitalReaderDepth || 0;
    if (depth) history.go(-depth);
    else {
      history.replaceState(history.state, '', location.pathname + location.search);
      sync();
    }
  }

  function open(hash, returnFocus) {
    if (!routeFrom(hash)) return;
    const wasOpen = dialog.open;
    if (hash !== location.hash) {
      const depth = (history.state?.orbitalReaderDepth || 0) + 1;
      history.pushState({ ...history.state, orbitalReaderDepth: depth }, '', hash);
    }
    sync();
    if (!wasOpen && dialog.open && returnFocus?.isConnected) opener = returnFocus;
  }

  // A direct article link also has a local return destination for the close button.
  if (routeFrom(location.hash) && !history.state?.orbitalReaderDepth) {
    const entry = location.href;
    history.replaceState(history.state, '', location.pathname + location.search);
    history.pushState({ ...history.state, orbitalReaderDepth: 1 }, '', entry);
  }
  listen(document, 'click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || !routeFrom(link.hash) || link.target === '_blank') return;
    event.preventDefault();
    open(link.hash);
  });
  listen(window, 'popstate', sync);
  listen(window, 'hashchange', sync);
  listen(closeButton, 'click', dismiss);
  listen(dialog, 'keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) dismiss();
  });
  listen(dialog, 'cancel', event => { event.preventDefault(); dismiss(); });
  listen(dialog, 'click', event => {
    if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) dismiss();
  });
  sync();
  return { open, dispose: () => events.abort() };
}
