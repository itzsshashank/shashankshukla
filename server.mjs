import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
    <header class="site-header"><div class="wrap bar"><a class="brand" href="${basePath}">Shashank Shukla</a><nav class="nav"><a href="${basePath}">Home</a><a href="${basePath}blogs/">All Posts</a><a href="https://github.com/itzsshashank" target="_blank" rel="noopener noreferrer" aria-label="GitHub" style="padding: 0.5rem;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a></nav></div></header>
    <main>${body}</main>
    <footer class="site-footer"><div class="wrap"></div></footer>
  </body>
</html>`;
}

function normalizeHtml(html) {
  return html.replace(/<h1>(.*?)<\/h1>/, '');
}

function getGitMetadata(file) {
  const relativePath = path.join('blogs', file);
  try {
    const log = execSync(`git log --follow --format=%aI -- "${relativePath}"`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (log.length === 0) return null;
    const lastEditedAt = new Date(log[0]);
    const publishedAt = new Date(log[log.length - 1]);
    const gitPath = relativePath.replace(/\\/g, '/');
    const historyUrl = `https://github.com/itzsshashank/shashankshukla/commits/main/${gitPath}`;
    return { publishedAt, lastEditedAt, historyUrl };
  } catch (error) {
    return null;
  }
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
      
      const gitMeta = getGitMetadata(file);
      const publishedAt = parsed.data.date ? new Date(parsed.data.date) : (gitMeta?.publishedAt || stat.birthtime);

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
    const fullPath = path.join(blogDir, file);
    const raw = await fs.readFile(fullPath, 'utf8');
    const parsed = matter(raw);
    const stat = await fs.stat(fullPath);
    const title = parsed.data.title || firstHeading(parsed.content) || slug.replace(/-/g, ' ');
    const description = parsed.data.description || excerptFrom(parsed.content);
    
    const gitMeta = getGitMetadata(file);
    const publishedAt = parsed.data.date ? new Date(parsed.data.date) : (gitMeta?.publishedAt || stat.birthtime);
    const lastEditedAt = gitMeta?.lastEditedAt || stat.mtime;
    const historyUrl = gitMeta?.historyUrl;

    const html = normalizeHtml(marked.parse(parsed.content));
    return { title, description, publishedAt, lastEditedAt, historyUrl, html, url: `/blogs/${slug}/` };
  } catch (error) {
    return null;
  }
}

function renderHome(posts) {
  const recent = posts.slice(0, 3);
  const recentHtml = recent.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('');
  const body = `<section class="hero" style="padding: 1.5rem 0 1rem;"><div class="wrap hero-grid"><h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">Shashank Shukla</h1><p style="margin: 0.5rem 0; font-size: 1rem; color: #6d5e4c; line-height: 1.5;">I build things and dump thoughts here. Backend systems, markets, and why people do what they do.</p></div></section><section class="wrap"><div class="card" style="padding: 1rem;"><h2 style="margin: 0 0 0.8rem 0; font-size: 1.15rem;">Recent Posts</h2><div class="archive" style="gap: 0.4rem;">${recentHtml}</div>${posts.length > 3 ? `<p style="text-align: center; margin: 0.8rem 0 0 0;"><a class="button primary" href="${basePath}blogs/">View all</a></p>` : ''}</div></section>`;
  return pageShell({ title: 'Shashank Shukla', description: 'Blog and notes.', body, pathName: '/' });
}

function renderArchive(posts) {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>All Posts</h1></div></section><section class="wrap"><div class="card"><div class="archive">${posts.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('')}</div></div></section>`;
  return pageShell({ title: 'All Posts — Shashank Shukla', description: 'All blog posts.', body, pathName: '/blogs/' });
}

function renderPost(post) {
  const isEdited = post.lastEditedAt && post.publishedAt && post.lastEditedAt.getTime() > post.publishedAt.getTime();
  const historyHtml = post.historyUrl ? `
    <footer style="margin-top: 5rem; padding-top: 1rem; border-top: 1px solid var(--line); opacity: 0.4; transition: opacity 0.2s; font-size: 0.75rem; color: var(--muted);" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <span>Published ${dateFormatter.format(post.publishedAt)}</span>
          ${isEdited ? `<span style="margin-left: 0.8rem;">Edited ${dateFormatter.format(post.lastEditedAt)}</span>` : ''}
        </div>
        <a href="${post.historyUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s;" onmouseover="this.style.borderColor='inherit'" onmouseout="this.style.borderColor='transparent'">History ↗</a>
      </div>
    </footer>
  ` : '';

  const body = `<section class="hero"><div class="wrap hero-grid"><h1>${escapeHtml(post.title)}</h1><p class="meta">${dateFormatter.format(post.publishedAt)}</p></div></section><section class="wrap"><article class="post prose card">${post.html}${historyHtml}</article></section>`;
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