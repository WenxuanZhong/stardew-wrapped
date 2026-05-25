import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL, SOCIAL_IMAGE_URL, urlFor } from './site-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dists = {
  full: path.join(root, 'dist-full'),
  public: path.join(root, 'dist-public'),
};
function relFromRoot(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function countFiles(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    total += entry.isDirectory() ? await countFiles(abs) : 1;
  }
  return total;
}

async function pngSize(filePath) {
  const buf = await fs.readFile(filePath);
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error(`${relFromRoot(filePath)} is not a PNG`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

async function assertFile(filePath, label) {
  if (!await exists(filePath)) throw new Error(`${label} missing: ${relFromRoot(filePath)}`);
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error(`${label} is empty/not file: ${relFromRoot(filePath)}`);
  return stat.size;
}

async function assertDir(filePath, label, minFiles = 1) {
  if (!await exists(filePath)) throw new Error(`${label} missing: ${relFromRoot(filePath)}`);
  const stat = await fs.stat(filePath);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${relFromRoot(filePath)}`);
  const count = await countFiles(filePath);
  if (count < minFiles) throw new Error(`${label} has too few files: ${count} < ${minFiles}`);
  return count;
}

async function listTextFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listTextFiles(abs));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.md', ''].includes(ext)) {
      out.push(abs);
    }
  }
  return out;
}

async function assertLiteralRefsExist(distDir) {
  const srcHrefRe = /(?:src|href)=(["'])(.*?)\1/g;
  const cssUrlRe = /url\((['"]?)(.*?)\1\)/g;
  const imageMetaRe = /<meta\s+(?:property|name)=(["'])(?:og:image|twitter:image)\1\s+content=(["'])(.*?)\2/gi;
  const ignore = /^(?:https?:|mailto:|tel:|data:|blob:|#|javascript:)/i;
  const missing = [];
  let checked = 0;

  const htmlFiles = (await fs.readdir(distDir)).filter(file => file.endsWith('.html'));
  const check = (file, ref) => {
    ref = String(ref || '').trim();
    if (!ref || ignore.test(ref) || ref.includes('${')) return;
    ref = ref.split('#')[0].split('?')[0];
    if (!ref) return;
    if (ref.startsWith('/')) ref = ref.replace(/^\/+/, '');
    const target = path.resolve(distDir, ref);
    if (!target.startsWith(path.resolve(distDir))) return;
    checked += 1;
    if (!fsSyncExists(target)) missing.push(`${file} -> ${ref}`);
  };

  for (const file of htmlFiles) {
    const html = await readText(path.join(distDir, file));
    for (const re of [srcHrefRe, cssUrlRe, imageMetaRe]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(html))) check(file, match[3] || match[2]);
    }
  }
  if (missing.length) {
    throw new Error(`Missing literal refs in ${relFromRoot(distDir)}:\n${missing.join('\n')}`);
  }
  return checked;
}

function fsSyncExists(filePath) {
  try {
    return Boolean(requireFs.accessSync(filePath) ?? true);
  } catch {
    return false;
  }
}

// Imported lazily once to keep the rest of the script promise-oriented.
const requireFs = await import('node:fs');

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label} missing: ${needle}`);
}

function assertNotMatches(text, pattern, label) {
  const match = text.match(pattern);
  if (match) throw new Error(`${label} contains forbidden token: ${match[0]}`);
}

function assertMetaContent(index, attr, key, expected, label) {
  const re = new RegExp(`<meta\\s+${attr}=["']${key}["']\\s+content=["']([^"']+)["']`, 'i');
  const match = index.match(re);
  if (!match) throw new Error(`${label} missing meta ${attr}=${key}`);
  if (match[1] !== expected) {
    throw new Error(`${label} ${key} mismatch: expected ${expected}, got ${match[1]}`);
  }
}

function assertSiteMetadata(index, label) {
  assertIncludes(index, `<link rel="canonical" href="${SITE_URL}">`, `${label} canonical`);
  assertMetaContent(index, 'property', 'og:url', SITE_URL, label);
  assertMetaContent(index, 'property', 'og:image', SOCIAL_IMAGE_URL, label);
  assertMetaContent(index, 'property', 'og:image:width', '1200', label);
  assertMetaContent(index, 'property', 'og:image:height', '630', label);
  assertMetaContent(index, 'name', 'twitter:image', SOCIAL_IMAGE_URL, label);
  assertIncludes(index, '<meta name="twitter:card" content="summary_large_image">', `${label} twitter card`);
  assertIncludes(index, '<link rel="manifest" href="site.webmanifest">', `${label} manifest link`);
  assertIncludes(index, '<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">', `${label} favicon link`);
}

function assertLandingLegalNotice(index, label) {
  assertIncludes(index, 'class="landing-legal-note"', `${label} landing legal note`);
  assertIncludes(index, "'landing.legal'", `${label} landing legal i18n`);
  assertIncludes(index, 'ConcernedApe', `${label} ConcernedApe notice`);
  assertIncludes(index, 'Stardew Valley names, images, and audio belong to their rights holders', `${label} asset ownership notice`);
}

async function assertDeployMetadata(distDir, label) {
  const robots = await readText(path.join(distDir, 'robots.txt'));
  const sitemap = await readText(path.join(distDir, 'sitemap.xml'));
  const manifest = JSON.parse(await readText(path.join(distDir, 'site.webmanifest')));
  const headers = await readText(path.join(distDir, '_headers'));

  assertIncludes(robots, `Sitemap: ${urlFor('sitemap.xml')}`, `${label} robots sitemap`);
  for (const url of [SITE_URL, urlFor('about.html'), urlFor('how-it-works.html')]) {
    assertIncludes(sitemap, `<loc>${url}</loc>`, `${label} sitemap`);
  }
  if (manifest.name !== 'Stardew Wrapped') throw new Error(`${label} manifest name mismatch`);
  if (manifest.short_name !== 'Wrapped') throw new Error(`${label} manifest short_name mismatch`);
  if (manifest.start_url !== '.') throw new Error(`${label} manifest start_url mismatch`);
  if (manifest.display !== 'browser') throw new Error(`${label} manifest display mismatch`);
  if (!Array.isArray(manifest.icons) || !manifest.icons.some(icon => icon.src === 'assets/favicon.svg' && icon.type === 'image/svg+xml')) {
    throw new Error(`${label} manifest favicon icon missing`);
  }
  for (const needle of [
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Permissions-Policy: camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy:',
    '/assets/*',
    'Cache-Control: public, max-age=31536000, immutable',
    '/index.html',
    '/*.html',
  ]) {
    assertIncludes(headers, needle, `${label} headers`);
  }
  return {
    siteUrl: SITE_URL,
    socialImageUrl: SOCIAL_IMAGE_URL,
    sitemapUrls: 3,
    manifestIcons: manifest.icons.length,
  };
}

async function checkFullBuild() {
  const dist = dists.full;
  const index = await readText(path.join(dist, 'index.html'));
  const headers = await readText(path.join(dist, '_headers'));

  const files = {
    index: await assertFile(path.join(dist, 'index.html'), 'full index'),
    socialPng: await assertFile(path.join(dist, 'assets', 'social-card.png'), 'full social PNG'),
    clickSfx: await assertFile(path.join(dist, 'assets', 'audio', 'sfx_click.ogg'), 'full click SFX'),
    parser: await assertFile(path.join(dist, 'src', 'parser', 'sdv-save.js'), 'parser'),
    htmlToImage: await assertFile(path.join(dist, 'assets', 'vendor', 'html-to-image.min.js'), 'html-to-image'),
    qrcode: await assertFile(path.join(dist, 'assets', 'vendor', 'qrcode.min.js'), 'qrcode'),
  };
  const dirs = {
    stardew: await assertDir(path.join(dist, 'assets', 'stardew'), 'full Stardew assets', 40),
    audio: await assertDir(path.join(dist, 'assets', 'audio'), 'full audio assets', 10),
    portraits: await assertDir(path.join(dist, 'portraits'), 'full portraits', 20),
    fonts: await assertDir(path.join(dist, 'assets', 'fonts'), 'fonts', 5),
  };

  const socialSize = await pngSize(path.join(dist, 'assets', 'social-card.png'));
  if (socialSize.width !== 1200 || socialSize.height !== 630) {
    throw new Error(`social-card.png must be 1200x630, got ${socialSize.width}x${socialSize.height}`);
  }

  const ogg = await fs.readFile(path.join(dist, 'assets', 'audio', 'sfx_click.ogg'));
  if (ogg.subarray(0, 4).toString('ascii') !== 'OggS') {
    throw new Error('sfx_click.ogg is not an Ogg stream');
  }

  assertNotMatches(index, /data-public-safe="true"/, 'full index');
  assertIncludes(index, 'assets/audio/sfx_click.ogg', 'full index');
  assertIncludes(index, 'assets/stardew', 'full index');
  assertIncludes(index, 'portraits/', 'full index');
  assertSiteMetadata(index, 'full index');
  assertLandingLegalNotice(index, 'full index');
  assertIncludes(index, 'assets/vendor/html-to-image.min.js', 'full export library');

  assertNotMatches(index, /data-idx="18"|festival-board|festival-card|festival-tile|renderFestivalReview|hasFestivalSignal|guide\.festival|tag\.festival/, 'full festival removal');

  assertIncludes(headers, 'Content-Security-Policy:', 'full headers');
  assertIncludes(headers, "script-src 'self' 'unsafe-inline'", 'full CSP');
  assertIncludes(headers, "style-src 'self' 'unsafe-inline'", 'full CSP');
  assertIncludes(headers, "img-src 'self' data: blob:", 'full CSP');
  assertIncludes(headers, "font-src 'self'", 'full CSP');
  assertIncludes(headers, "connect-src 'self'", 'full CSP');
  assertIncludes(headers, "media-src 'self'", 'full CSP');
  assertIncludes(headers, '/assets/*', 'full asset caching');

  const literalRefs = await assertLiteralRefsExist(dist);
  const deployMetadata = await assertDeployMetadata(dist, 'full deploy metadata');
  return { files, dirs, socialSize, literalRefs, deployMetadata };
}

async function checkPublicBuild() {
  const dist = dists.public;
  const index = await readText(path.join(dist, 'index.html'));
  const headers = await readText(path.join(dist, '_headers'));

  const files = {
    index: await assertFile(path.join(dist, 'index.html'), 'public index'),
    socialPng: await assertFile(path.join(dist, 'assets', 'social-card.png'), 'public social PNG'),
    parser: await assertFile(path.join(dist, 'src', 'parser', 'sdv-save.js'), 'public parser'),
  };
  const dirs = {
    fonts: await assertDir(path.join(dist, 'assets', 'fonts'), 'public fonts', 5),
    vendor: await assertDir(path.join(dist, 'assets', 'vendor'), 'public vendor', 2),
  };

  assertIncludes(index, 'data-public-safe="true"', 'public-safe marker');
  assertSiteMetadata(index, 'public index');
  assertLandingLegalNotice(index, 'public index');
  assertNotMatches(index, /assets\/audio|assets\\audio|assets\/stardew|assets\\stardew|portraits\/|PORTRAIT_DATA|data:image\/png;base64/, 'public asset audit');
  assertNotMatches(index, /data-idx="18"|festival-board|festival-card|festival-tile|renderFestivalReview|hasFestivalSignal|guide\.festival|tag\.festival/, 'public festival removal');
  assertIncludes(headers, 'Content-Security-Policy:', 'public headers');
  assertIncludes(headers, "connect-src 'self'", 'public CSP');

  const forbiddenDirs = [
    path.join(dist, 'assets', 'stardew'),
    path.join(dist, 'assets', 'audio'),
    path.join(dist, 'portraits'),
  ];
  for (const dir of forbiddenDirs) {
    if (await exists(dir)) throw new Error(`Forbidden public-safe directory exists: ${relFromRoot(dir)}`);
  }

  const literalRefs = await assertLiteralRefsExist(dist);
  const deployMetadata = await assertDeployMetadata(dist, 'public deploy metadata');
  return { files, dirs, literalRefs, deployMetadata };
}

async function main() {
  const full = await checkFullBuild();
  const publicSafe = await checkPublicBuild();
  const result = {
    ok: true,
    checkedAt: new Date().toISOString(),
    full,
    publicSafe,
  };
  console.log(JSON.stringify(result, null, 2));
}

await main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
