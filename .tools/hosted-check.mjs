import { SITE_URL, SOCIAL_IMAGE_URL, urlFor } from './site-config.mjs';

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 20000);

function fail(failures, message) {
  failures.push(message);
}

function assertIncludes(failures, text, needle, label) {
  if (!String(text || '').includes(needle)) fail(failures, `${label} missing: ${needle}`);
}

function assertEqual(failures, actual, expected, label) {
  if (actual !== expected) fail(failures, `${label} expected ${expected}, got ${actual}`);
}

function errorMessage(err) {
  if (!err) return 'unknown error';
  if (err.name && err.message) return `${err.name}: ${err.message}`;
  if (err.message) return err.message;
  return String(err);
}

function assertMetaContent(failures, index, attr, key, expected, label) {
  const re = new RegExp(`<meta\\s+${attr}=["']${key}["']\\s+content=["']([^"']+)["']`, 'i');
  const match = index.match(re);
  if (!match) {
    fail(failures, `${label} missing meta ${attr}=${key}`);
    return;
  }
  if (match[1] !== expected) {
    fail(failures, `${label} ${key} expected ${expected}, got ${match[1]}`);
  }
}

async function fetchBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      url,
      finalUrl: res.url,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      headers: Object.fromEntries(res.headers.entries()),
      bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}

function textFrom(response) {
  return new TextDecoder('utf-8', { fatal: false }).decode(response.bytes);
}

function pngSize(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('not a PNG stream');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function header(response, name) {
  return response.headers[name.toLowerCase()] || '';
}

function assertOkResponse(failures, response, label) {
  if (!response.ok || response.status !== 200) {
    fail(failures, `${label} returned HTTP ${response.status}`);
  }
}

function assertSecurityHeaders(failures, response, label) {
  assertEqual(failures, header(response, 'x-content-type-options'), 'nosniff', `${label} X-Content-Type-Options`);
  assertEqual(failures, header(response, 'referrer-policy'), 'strict-origin-when-cross-origin', `${label} Referrer-Policy`);
  const permissions = header(response, 'permissions-policy');
  for (const needle of ['camera=()', 'microphone=()', 'geolocation=()']) {
    assertIncludes(failures, permissions, needle, `${label} Permissions-Policy`);
  }
  const csp = header(response, 'content-security-policy');
  for (const needle of [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ]) {
    assertIncludes(failures, csp, needle, `${label} CSP`);
  }
}

async function main() {
  const failures = [];
  const responses = {};

  for (const [key, url] of Object.entries({
    root: SITE_URL,
    index: urlFor('index.html'),
    robots: urlFor('robots.txt'),
    sitemap: urlFor('sitemap.xml'),
    manifest: urlFor('site.webmanifest'),
    socialImage: SOCIAL_IMAGE_URL,
  })) {
    try {
      responses[key] = await fetchBytes(url);
    } catch (err) {
      responses[key] = { url, ok: false, error: errorMessage(err) };
      fail(failures, `${key} fetch failed: ${responses[key].error}`);
    }
  }

  if (responses.root?.bytes) {
    assertOkResponse(failures, responses.root, 'root page');
    assertSecurityHeaders(failures, responses.root, 'root page');
    const html = textFrom(responses.root);
    assertIncludes(failures, html, `<link rel="canonical" href="${SITE_URL}">`, 'root canonical');
    assertMetaContent(failures, html, 'property', 'og:url', SITE_URL, 'root metadata');
    assertMetaContent(failures, html, 'property', 'og:image', SOCIAL_IMAGE_URL, 'root metadata');
    assertMetaContent(failures, html, 'name', 'twitter:image', SOCIAL_IMAGE_URL, 'root metadata');
    assertIncludes(failures, html, '<meta name="twitter:card" content="summary_large_image">', 'root twitter card');
    assertIncludes(failures, html, 'class="landing-legal-note"', 'root landing legal notice');
    assertIncludes(failures, html, 'ConcernedApe', 'root ConcernedApe notice');
  }

  if (responses.index?.bytes) {
    assertOkResponse(failures, responses.index, 'index page');
    assertSecurityHeaders(failures, responses.index, 'index page');
    const cache = header(responses.index, 'cache-control');
    assertIncludes(failures, cache, 'no-cache', 'index Cache-Control');
  }

  if (responses.robots?.bytes) {
    assertOkResponse(failures, responses.robots, 'robots.txt');
    assertIncludes(failures, textFrom(responses.robots), `Sitemap: ${urlFor('sitemap.xml')}`, 'robots sitemap');
  }

  if (responses.sitemap?.bytes) {
    assertOkResponse(failures, responses.sitemap, 'sitemap.xml');
    const sitemap = textFrom(responses.sitemap);
    for (const url of [SITE_URL, urlFor('about.html'), urlFor('how-it-works.html')]) {
      assertIncludes(failures, sitemap, `<loc>${url}</loc>`, 'sitemap loc');
    }
  }

  if (responses.manifest?.bytes) {
    assertOkResponse(failures, responses.manifest, 'site.webmanifest');
    try {
      const manifest = JSON.parse(textFrom(responses.manifest));
      assertEqual(failures, manifest.name, 'Stardew Wrapped', 'manifest name');
      assertEqual(failures, manifest.short_name, 'Wrapped', 'manifest short_name');
      assertEqual(failures, manifest.start_url, '.', 'manifest start_url');
      assertEqual(failures, manifest.display, 'browser', 'manifest display');
      if (!Array.isArray(manifest.icons) || !manifest.icons.some(icon => icon.src === 'assets/favicon.svg' && icon.type === 'image/svg+xml')) {
        fail(failures, 'manifest favicon icon missing');
      }
    } catch (err) {
      fail(failures, `manifest JSON parse failed: ${err && err.message ? err.message : err}`);
    }
  }

  if (responses.socialImage?.bytes) {
    assertOkResponse(failures, responses.socialImage, 'social image');
    const contentType = header(responses.socialImage, 'content-type');
    assertIncludes(failures, contentType, 'image/png', 'social image Content-Type');
    const cache = header(responses.socialImage, 'cache-control');
    assertIncludes(failures, cache, 'max-age=31536000', 'social image Cache-Control');
    assertIncludes(failures, cache, 'immutable', 'social image Cache-Control');
    try {
      const size = pngSize(responses.socialImage.bytes);
      if (size.width !== 1200 || size.height !== 630) {
        fail(failures, `social image size expected 1200x630, got ${size.width}x${size.height}`);
      }
      responses.socialImage.pngSize = size;
    } catch (err) {
      fail(failures, `social image PNG check failed: ${err && err.message ? err.message : err}`);
    }
  }

  const summary = Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, {
    url: response.url,
    finalUrl: response.finalUrl,
    status: response.status,
    ok: response.ok,
    ms: response.ms,
    contentType: response.headers ? response.headers['content-type'] : undefined,
    cacheControl: response.headers ? response.headers['cache-control'] : undefined,
    cspPresent: Boolean(response.headers && response.headers['content-security-policy']),
    bytes: response.bytes ? response.bytes.length : undefined,
    pngSize: response.pngSize,
    error: response.error,
  }]));

  const output = {
    ok: failures.length === 0,
    siteUrl: SITE_URL,
    checkedAt: new Date().toISOString(),
    responses: summary,
    failures,
  };
  console.log(JSON.stringify(output, null, 2));
  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
