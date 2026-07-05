import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
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

function pageShell({ title, description, body, canonicalUrl, ogType = 'website', jsonLdSchema }) {
  const schemaHtml = jsonLdSchema 
    ? `\n    <script type="application/ld+json">\n      ${JSON.stringify(jsonLdSchema, null, 2).replace(/\n/g, '\n      ')}\n    </script>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="Shashank Shukla" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    
    <link rel="stylesheet" href="${basePath}/site.css" />${schemaHtml}
  </head>
  <body>
    <header class="site-header"><div class="wrap bar"><a class="brand" href="${basePath}/">Shashank Shukla</a><nav class="nav"><a href="${basePath}/">Home</a><a href="${basePath}/projects/">Projects</a><a href="${basePath}/blogs/">All Posts</a><a href="https://github.com/itzsshashank" target="_blank" rel="noopener noreferrer" aria-label="GitHub" style="padding: 0.5rem;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a></nav></div></header>
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
      const lastEditedAt = gitMeta?.lastEditedAt || stat.mtime;
      const historyUrl = gitMeta?.historyUrl;

      posts.push({ 
        file, slug, title, description, publishedAt, lastEditedAt, historyUrl,
        html: normalizeHtml(marked.parse(parsed.content)), 
        url: `${basePath}/blogs/${slug}/` 
      });
    }
    posts.sort((left, right) => right.publishedAt - left.publishedAt);
    return posts;
  } catch (error) {
    console.error('Error reading posts:', error);
    return [];
  }
}

function renderHome(posts) {
  const recent = posts.slice(0, 3);
  const recentHtml = recent.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('');
  const body = `<section class="hero" style="padding: 1.5rem 0 1rem;">
  <div class="wrap hero-grid">
    <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">Shashank Shukla</h1>
    <p style="margin: 0.5rem 0; font-size: 1rem; color: #6d5e4c; line-height: 1.5;">I build things and dump thoughts here. Backend systems, markets, and why people do what they do.</p>
  </div>
</section>
<section class="wrap">
  <div class="content-grid" style="padding: 0 0 2rem;">
    <!-- Left Column: Recent Posts -->
    <div class="card" style="padding: 0;">
      <div class="section-title" style="margin-bottom: 0.8rem;">
        <h2 style="margin: 0; font-size: 1.15rem;">Recent Posts</h2>
        <a href="${basePath}/blogs/" style="font-size: 0.95rem; color: var(--accent); text-decoration: none; font-weight: 500;">View all →</a>
      </div>
      <div class="archive recent-posts-list" style="gap: 0.4rem;">
        ${recentHtml}
      </div>
    </div>

    <!-- Right Column: Things I've Built -->
    <div class="card" style="padding: 0;">
      <div class="section-title" style="margin-bottom: 0.8rem;">
        <h2 style="margin: 0; font-size: 1.15rem;">Things I've Built</h2>
        <a href="${basePath}/projects/" style="font-size: 0.95rem; color: var(--accent); text-decoration: none; font-weight: 500;">View all →</a>
      </div>
      <div class="archive" style="gap: 0.4rem;">
        <!-- Project 1 -->
        <a href="https://chromewebstore.google.com/detail/xinsightai-ai-reply-assis/ngppfaclmbaaagondnfjkigkmacfphhc" target="_blank" rel="noopener noreferrer" class="archive-item" style="text-decoration: none;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
            <strong>Xinsight AI ↗</strong>
            <span class="meta" style="font-style: italic; font-size: 0.8rem;">Backend offline</span>
          </div>
          <div class="meta" style="font-size: 0.9rem; line-height: 1.4; margin-top: 0.15rem;">
            A Chrome extension that helps people reply faster and smarter on Twitter/X using AI.
          </div>
        </a>

        <!-- Project 2 -->
        <a href="https://tradeilog.vercel.app/docs#architecture" target="_blank" rel="noopener noreferrer" class="archive-item" style="text-decoration: none;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
            <strong>TRADEiLOG ↗</strong>
            <span class="meta" style="font-style: italic; font-size: 0.8rem;">Backend offline</span>
          </div>
          <div class="meta" style="font-size: 0.9rem; line-height: 1.4; margin-top: 0.15rem;">
            A private journal that tracks predictions against real outcomes to assess decision making.
          </div>
        </a>
      </div>
    </div>
  </div>
</section>`;

  return pageShell({
    title: 'Shashank Shukla',
    description: 'I build backend systems and dump thoughts here on markets, systems, and why people do what they do.',
    body,
    canonicalUrl: 'https://itzsshashank.github.io/shashankshukla/',
    ogType: 'website',
    jsonLdSchema: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Shashank Shukla",
        "url": "https://itzsshashank.github.io/shashankshukla/"
      },
      {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": "Shashank Shukla",
        "url": "https://itzsshashank.github.io/shashankshukla/",
        "sameAs": [
          "https://github.com/itzsshashank",
          "https://chromewebstore.google.com/detail/xinsightai-ai-reply-assis/ngppfaclmbaaagondnfjkigkmacfphhc"
        ],
        "jobTitle": "Backend Engineer",
        "description": "I build things and dump thoughts here. Backend systems, markets, and why people do what they do."
      }
    ]
  });
}

function renderProjects() {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>Projects</h1></div></section>
<section class="wrap">
  <div class="card">
    <div class="archive">
      <!-- Project 1 -->
      <div class="archive-item">
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
          <strong>Xinsight AI</strong>
          <span class="meta" style="font-style: italic; font-size: 0.8rem;">(Website preview available, backend currently offline)</span>
        </div>
        <div class="meta" style="font-size: 0.9rem; line-height: 1.4; margin-top: 0.15rem;">
          A Chrome extension that helps people reply faster and smarter on Twitter/X using AI. Featured on the Chrome Web Store.
        </div>
        <div style="font-size: 0.85rem; font-weight: 500; margin-top: 0.35rem; display: flex; gap: 0.8rem; flex-wrap: wrap;">
          <a href="https://chromewebstore.google.com/detail/xinsightai-ai-reply-assis/ngppfaclmbaaagondnfjkigkmacfphhc" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;">Chrome Store ↗</a>
          <span style="color: var(--line);">|</span>
          <a href="https://xinsight.vercel.app/" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;">Website Preview ↗</a>
        </div>
      </div>

      <!-- Project 2 -->
      <div class="archive-item">
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
          <strong>TRADEiLOG</strong>
          <span class="meta" style="font-style: italic; font-size: 0.8rem;">(Website preview available, backend currently offline)</span>
        </div>
        <div class="meta" style="font-size: 0.9rem; line-height: 1.4; margin-top: 0.15rem;">
          A private journal that tracks predictions against real outcomes, helping people see where their thinking went right or wrong.
        </div>
        <div style="font-size: 0.85rem; font-weight: 500; margin-top: 0.35rem; display: flex;">
          <a href="https://tradeilog.vercel.app/docs#architecture" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;">Website Preview ↗</a>
        </div>
      </div>
    </div>
  </div>
</section>`;

  return pageShell({
    title: 'Projects — Shashank Shukla',
    description: 'Things I\'ve built. Featured projects include Xinsight AI (Chrome extension) and TRADEiLOG.',
    body,
    canonicalUrl: 'https://itzsshashank.github.io/shashankshukla/projects/',
    ogType: 'website',
    jsonLdSchema: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Shashank Shukla",
      "url": "https://itzsshashank.github.io/shashankshukla/"
    }
  });
}

function renderArchive(posts) {
  const body = `<section class="hero"><div class="wrap hero-grid"><h1>All Posts</h1></div></section><section class="wrap"><div class="card"><div class="archive">${posts.map((post) => `<a class="archive-item" href="${post.url}"><strong>${escapeHtml(post.title)}</strong><span class="meta">${dateFormatter.format(post.publishedAt)}</span></a>`).join('')}</div></div></section>`;
  
  return pageShell({
    title: 'All Posts — Shashank Shukla',
    description: 'All blog posts by Shashank Shukla. Reflections on power dynamics, technology, perception, and narrative.',
    body,
    canonicalUrl: 'https://itzsshashank.github.io/shashankshukla/blogs/',
    ogType: 'website',
    jsonLdSchema: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Shashank Shukla",
      "url": "https://itzsshashank.github.io/shashankshukla/"
    }
  });
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
  
  const canonicalUrl = `https://itzsshashank.github.io/shashankshukla/blogs/${post.slug}/`;

  return pageShell({
    title: `${post.title} — Shashank Shukla`,
    description: post.description,
    body,
    canonicalUrl,
    ogType: 'article',
    jsonLdSchema: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": canonicalUrl
      },
      "headline": post.title,
      "description": post.description,
      "datePublished": post.publishedAt.toISOString(),
      "dateModified": post.lastEditedAt.toISOString(),
      "author": {
        "@type": "Person",
        "name": "Shashank Shukla",
        "url": "https://itzsshashank.github.io/shashankshukla/"
      },
      "publisher": {
        "@type": "Person",
        "name": "Shashank Shukla",
        "url": "https://itzsshashank.github.io/shashankshukla/"
      }
    }
  });
}

function generateSitemap(posts) {
  const now = new Date().toISOString();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://itzsshashank.github.io/shashankshukla/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://itzsshashank.github.io/shashankshukla/projects/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://itzsshashank.github.io/shashankshukla/blogs/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;

  for (const post of posts) {
    const lastMod = post.lastEditedAt.toISOString();
    xml += `
  <url>
    <loc>https://itzsshashank.github.io/shashankshukla/blogs/${post.slug}/</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
  }

  xml += `\n</urlset>`;
  return xml;
}

function generateRobots() {
  return `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://itzsshashank.github.io/shashankshukla/sitemap.xml
`;
}

function generateRSS(posts) {
  const now = new Date().toUTCString();
  let rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Shashank Shukla</title>
    <link>https://itzsshashank.github.io/shashankshukla/</link>
    <description>I build things and dump thoughts here. Backend systems, markets, and why people do what they do.</description>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="https://itzsshashank.github.io/shashankshukla/feed.xml" rel="self" type="application/rss+xml" />`;

  for (const post of posts) {
    const link = `https://itzsshashank.github.io/shashankshukla/blogs/${post.slug}/`;
    const pubDate = post.publishedAt.toUTCString();
    rss += `
    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${link}</link>
      <description>${escapeHtml(post.description)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid>${link}</guid>
    </item>`;
  }

  rss += `\n  </channel>\n</rss>`;
  return rss;
}

function generateLlms(posts) {
  let md = `# Shashank Shukla

I build things and dump thoughts here. Backend systems, markets, and why people do what they do.

## Key Pages
- [Home](https://itzsshashank.github.io/shashankshukla/)
- [Projects](https://itzsshashank.github.io/shashankshukla/projects/) - Features Xinsight AI (Chrome extension) and TRADEiLOG.
- [All Posts](https://itzsshashank.github.io/shashankshukla/blogs/) - Archive of all articles.

## Articles
`;

  for (const post of posts) {
    md += `- [${post.title}](https://itzsshashank.github.io/shashankshukla/blogs/${post.slug}/): ${post.description}\n`;
  }

  return md;
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
  await writePage('projects/index.html', renderProjects());
  await writePage('blogs/index.html', renderArchive(posts));
  for (const post of posts) {
    await writePage(path.join('blogs', post.slug, 'index.html'), renderPost(post));
  }
  await writePage('robots.txt', generateRobots());
  await writePage('sitemap.xml', generateSitemap(posts));
  await writePage('feed.xml', generateRSS(posts));
  await writePage('llms.txt', generateLlms(posts));
  
  await fs.copyFile(path.join(root, 'site.css'), path.join(outDir, 'site.css'));
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');
  console.log(`✓ Built ${posts.length} post(s) to /docs`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
