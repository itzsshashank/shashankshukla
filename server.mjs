import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const root = process.cwd();
const port = Number(process.env.PORT || 4321);
const blogDir = path.join(root, 'blogs');
const basePath = process.env.BASE_PATH || '/';
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripMarkdown(text) {
  return text.replace(/^#{1,6}\s+/gm, '').replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]+)`/g, '$1').replace(/\[(.*?)\]\((.*?)\)/g, '$1').replace(/[>*_~]/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugFromFile(fileName) {
  return path.basename(fileName, path.extname(fileName)).toLowerCase();
}

function resolveSlug(data, fileName) {
  return String(data.slug || slugFromFile(fileName)).trim().replace(/\s+/g, '-');
}

function firstHeading(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].replace(/[*_`]/g, '').trim() : '';
}

function excerptFrom(content) {
  const text = stripMarkdown(content);
  return text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text;
}

function pageShell({ title, description, body, pathName = '/' }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${basePath}site.css" />
  </head>
  <body>
    <header class="site-header"><div class="wrap bar"><a class="brand" href="${basePath}">Shashank Shukla</a><nav class="nav"><a href="${basePath}">Home</a><a href="${basePath}blogs/">All Posts</a><a href="https://github.com/itzsshashank" target="_blank" rel="noopener noreferrer">GitHub</a></nav></div></header>
    <main>${body}</main>
    <footer class="site-footer"><div class="wrap"></div></footer>
  </body>
</html>`;
}

function normalizeHtml(html) {
  return html.replace(/<h1>(.*?)<\/h1>/, '');
}

async function readPosts() {
  try {
    const files = await fs.readdir(blogDir);
    const posts = [];
    for (const file of files.filter((name) => name.endsWith('.md'))) {
      const fullPath = path.join(blogDir, file);
      const raw = await fs.readFile(fullPath, 'utf8');
      const parsed = matter(raw);
      const stat = await fs.stat(fullPath);
      const slug = resolveSlug(parsed.data, file);
      const title = parsed.data.title || firstHeading(parsed.content) || slug.replace(/-/g, ' ');
      const description = parsed.data.description || excerptFrom(parsed.content);
      const publishedAt = parsed.data.date ? new Date(parsed.data.date) : stat.mtime;
      posts.push({ file, slug, title, description, publishedAt, sourcePath: `/blogs/${file}`, url: `${basePath}blogs/${slug}/` });
    }
    posts.sort((left, right) => right.publishedAt - left.publishedAt);
    return posts;
  } catch (error) {
    return [];
  }
}

async function renderPostContent(slug) {
  try {
    const files = await fs.readdir(blogDir);
    const file = files.find((f) => resolveSlug({}, f) === slug && f.endsWith('.md'));
    if (!file) return null;
    const raw = await fs.readFile(path.join(blogDir, file), 'utf8');
    const parsed = matter(raw);
    const title = parsed.data.title || firstHeading(parsed.content) || slug.replace(/-/g, ' ');
    const description = parsed.data.description || excerptFrom(parsed.content);
    const publishedAt = parsed.data.date ? new Date(parsed.data.date) : new Date();
    const html = normalizeHtml(marked.parse(parsed.content));
    return { title, description, publishedAt, html, url: `/blogs/${slug}/` };
  } catch (error) {
    return null;
  }
}

function renderHome(posts) {
  const recent = posts.slice(0, 5);
  const recentHtml = recent.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('');
  const body = `<section class="hero" style="padding: 2rem 0 1rem;"><div class="wrap hero-grid"><h1 style="font-size: 3rem; margin-bottom: 1rem;">Shashank Shukla</h1></div></section><section class="wrap"><div class="card" style="padding: 1.25rem;"><h2 style="margin-top: 0; margin-bottom: 1rem; font-size: 1.3rem;">Recent Posts</h2><div class="archive" style="gap: 0.6rem;">${recentHtml}</div>${posts.length > 5 ? `<p style="text-align: center; margin-top: 1rem;"><a class="button primary" href="${basePath}blogs/">View all</a></p>` : ''}</div></section>`;
  return pageShell({ title: 'Shashank Shukla', description: 'Blog and notes.', body, pathName: '/' });
}

function renderArchive(posts) {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>All Posts</h1></div></section><section class="wrap"><div class="card"><div class="archive">${posts.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('')}</div></div></section>`;
  return pageShell({ title: 'All Posts — Shashank Shukla', description: 'All blog posts.', body, pathName: '/blogs/' });
}

function renderPost(post) {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>${escapeHtml(post.title)}</h1><p class="meta">${dateFormatter.format(post.publishedAt)}</p></div></section><section class="wrap"><article class="post prose card">${post.html}</article></section>`;
  return pageShell({ title: `${post.title} — Shashank Shukla`, description: post.description, body, pathName: post.url });
}

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

function contentType(filePath) {
  return types.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\//, '');
  const candidates = [];

  if (!clean) {
    candidates.push('index.html');
  } else {
    candidates.push(clean);
    candidates.push(path.join(clean, 'index.html'));
    if (!path.extname(clean)) {
      candidates.push(`${clean}.html`);
      candidates.push(path.join(clean, 'index.html'));
    }
  }

  for (const candidate of candidates) {
    const filePath = path.join(root, candidate);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        return filePath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  try {
    if (url === '/' || url === '/index.html') {
      const posts = await readPosts();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHome(posts));
      return;
    }

    if (url === '/blogs/' || url === '/blogs/index.html') {
      const posts = await readPosts();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderArchive(posts));
      return;
    }

    const blogMatch = url.match(/^\/blogs\/([^/]+)\/?$/);
    if (blogMatch) {
      const slug = blogMatch[1];
      const post = await renderPostContent(slug);
      if (post) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderPost(post));
        return;
      }
    }

    const filePath = await resolveFile(url);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }

    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(error));
  }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});