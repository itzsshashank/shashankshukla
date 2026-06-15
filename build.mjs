import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const root = process.cwd();
const blogDir = path.join(root, 'blogs');
const outDir = path.join(root, 'docs');
const basePath = process.env.BASE_PATH || '/shashankshukla';
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

function pageShell({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${basePath}/site.css" />
  </head>
  <body>
    <header class="site-header"><div class="wrap bar"><a class="brand" href="${basePath}/">Shashank Shukla</a><nav class="nav"><a href="${basePath}/">Home</a><a href="${basePath}/blogs/">All Posts</a><a href="https://github.com/itzsshashank" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: middle;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2.27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg></a></nav></div></header>
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
      posts.push({ file, slug, title, description, publishedAt, html: normalizeHtml(marked.parse(parsed.content)), url: `${basePath}/blogs/${slug}/` });
    }
    posts.sort((left, right) => right.publishedAt - left.publishedAt);
    return posts;
  } catch (error) {
    return [];
  }
}

function renderHome(posts) {
  const recent = posts.slice(0, 3);
  const recentHtml = recent.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('');
  const body = `<section class="hero" style="padding: 1.5rem 0 1rem;"><div class="wrap hero-grid"><h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">Shashank Shukla</h1><p style="margin: 0.5rem 0; font-size: 1rem; color: #6d5e4c; line-height: 1.5;">I build things and dump thoughts here. Backend systems, markets, and why people do what they do.</p></div></section><section class="wrap"><div class="card" style="padding: 1rem;"><h2 style="margin: 0 0 0.8rem 0; font-size: 1.15rem;">Recent Posts</h2><div class="archive" style="gap: 0.4rem;">${recentHtml}</div>${posts.length > 3 ? `<p style="text-align: center; margin: 0.8rem 0 0 0;"><a class="button primary" href="${basePath}/blogs/">View all</a></p>` : ''}</div></section>`;
  return pageShell({ title: 'Shashank Shukla', description: 'Blog and notes.', body });
}

function renderArchive(posts) {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>All Posts</h1></div></section><section class="wrap"><div class="card"><div class="archive">${posts.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('')}</div></div></section>`;
  return pageShell({ title: 'All Posts — Shashank Shukla', description: 'All blog posts.', body });
}

function renderPost(post) {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>${escapeHtml(post.title)}</h1><p class="meta">${dateFormatter.format(post.publishedAt)}</p></div></section><section class="wrap"><article class="post prose card">${post.html}</article></section>`;
  return pageShell({ title: `${post.title} — Shashank Shukla`, description: post.description, body });
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writePage(relativePath, html) {
  const filePath = path.join(outDir, relativePath);
  await ensureDir(filePath);
  await fs.writeFile(filePath, html, 'utf8');
}

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  const posts = await readPosts();
  await writePage('index.html', renderHome(posts));
  await writePage('blogs/index.html', renderArchive(posts));
  for (const post of posts) {
    await writePage(path.join('blogs', post.slug, 'index.html'), renderPost(post));
  }
  await fs.copyFile(path.join(root, 'site.css'), path.join(outDir, 'site.css'));
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');
  console.log(`✓ Built ${posts.length} post(s) to /docs`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
