import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_SITE_URL = 'https://stardew-wrapped.pages.dev/';
export const SOCIAL_IMAGE_PATH = 'assets/social-card.png';

export function normalizeSiteUrl(value = process.env.SITE_URL || DEFAULT_SITE_URL) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

export const SITE_URL = normalizeSiteUrl();
export const SOCIAL_IMAGE_URL = new URL(SOCIAL_IMAGE_PATH, SITE_URL).toString();

export function urlFor(pathname, siteUrl = SITE_URL) {
  return new URL(pathname, siteUrl).toString();
}

export function renderRobots(siteUrl = SITE_URL) {
  return `User-agent: *
Allow: /

Sitemap: ${urlFor('sitemap.xml', siteUrl)}
`;
}

export function renderSitemap(siteUrl = SITE_URL) {
  const urls = [
    { loc: siteUrl, priority: '1.0' },
    { loc: urlFor('about.html', siteUrl), priority: '0.5' },
    { loc: urlFor('how-it-works.html', siteUrl), priority: '0.5' },
  ];
  const body = urls.map(({ loc, priority }) => `  <url>
    <loc>${loc}</loc>
    <priority>${priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function rewriteIndexMetadata(html, siteUrl = SITE_URL) {
  const socialImageUrl = new URL(SOCIAL_IMAGE_PATH, siteUrl).toString();
  return html
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${siteUrl}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${siteUrl}">`)
    .replace(/<meta property="og:image" content="[^"]*">/i, `<meta property="og:image" content="${socialImageUrl}">`)
    .replace(/<meta name="twitter:image" content="[^"]*">/i, `<meta name="twitter:image" content="${socialImageUrl}">`);
}

export async function applySiteMetadata(distDir, siteUrl = SITE_URL) {
  const indexPath = path.join(distDir, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  await fs.writeFile(indexPath, rewriteIndexMetadata(index, siteUrl), 'utf8');
  await fs.writeFile(path.join(distDir, 'robots.txt'), renderRobots(siteUrl), 'utf8');
  await fs.writeFile(path.join(distDir, 'sitemap.xml'), renderSitemap(siteUrl), 'utf8');
}
