import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySiteMetadata, SITE_URL } from './site-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-public');

function assertSafeDistTarget() {
  if (path.basename(dist) !== 'dist-public' || path.dirname(dist) !== root) {
    throw new Error(`Refusing to write unexpected dist target: ${dist}`);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(relPath) {
  const src = path.join(root, relPath);
  const dst = path.join(dist, relPath);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

async function copyDir(relPath) {
  const src = path.join(root, relPath);
  const dst = path.join(dist, relPath);
  await fs.cp(src, dst, { recursive: true });
}

async function emptyDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
  }
}

function makePublicSafeIndex(html) {
  html = html.replace('<body>', '<body data-public-safe="true">');

  const portraitBlock = /\/\/ NPC 头像内联[\s\S]*?const PORTRAIT_DATA = \{[\s\S]*?\r?\n\};\r?\n/;
  html = html.replace(
    portraitBlock,
    '// Public-safe build: official portrait sprite sheets are removed.\n'
  );
  html = html.replace(/portrait:\s*PORTRAIT_DATA\.[A-Za-z0-9_.]+/g, "portrait: ''");

  html = html.replace(/url\((['"]?)assets\/stardew\/[^)]*\)/g, 'none');
  html = html.replace(/(['"])assets\/stardew\/[^'"]+\1/g, "''");
  html = html.replace(/(['"])assets\/audio\/[^'"]+\1/g, "''");
  html = html.replace(/assets\\\/stardew\\\//g, 'public-safe-disabled\\/');
  html = html.replace(/assets\\\/audio\\\//g, 'public-safe-disabled\\/');
  html = html.replace(
    /原版镇民头像保存在 <code>portraits\/<\/code> 文件夹（解自 Stardew Valley 的 \.xnb），跟 index\.html 一起部署即可显示。/g,
    '公开发布版使用 emoji 和 CSS fallback，不包含游戏头像素材。'
  );
  html = html.replace(/portraits\//g, 'public-safe-portraits-removed/');

  return html;
}

async function writePublicHeaders() {
  const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/*.html
  Cache-Control: no-cache
`;
  await fs.writeFile(path.join(dist, '_headers'), headers, 'utf8');
}

async function writePublicDocs() {
  const notice = `# Notices

This project is an unofficial fan-made tool and is not affiliated with, endorsed by, or sponsored by ConcernedApe.

The public-safe build excludes copied Stardew Valley image and audio assets. Stardew Valley names, marks, and game content belong to ConcernedApe LLC and/or their respective rights holders and are not covered by this repository's MIT license.

The app runs entirely in the browser. Save files are read locally with the File API and are not uploaded.
`;
  const readme = `# Stardew Wrapped Public Build

This folder is a static, public-safe deployment bundle.

- Deploy the contents of this directory as the site root.
- No build command is required after this folder is generated.
- Official Stardew Valley image/audio asset copies are not included.
- Save parsing runs locally in the browser; no backend is required.

Suggested hosts: Cloudflare Pages, GitHub Pages, Netlify, Vercel static hosting, or any static file server.
`;
  await fs.writeFile(path.join(dist, 'NOTICE.md'), notice, 'utf8');
  await fs.writeFile(path.join(dist, 'README.md'), readme, 'utf8');
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

async function auditPublicBundle() {
  const forbiddenDirs = [
    path.join(dist, 'assets', 'stardew'),
    path.join(dist, 'assets', 'audio'),
    path.join(dist, 'portraits'),
  ];
  for (const dir of forbiddenDirs) {
    if (await exists(dir)) throw new Error(`Forbidden directory in public build: ${dir}`);
  }

  const forbidden = [
    'assets/stardew',
    'assets\\\\stardew',
    'assets/audio',
    'assets\\\\audio',
    'portraits/',
    'PORTRAIT_DATA',
    'data:image/png;base64',
  ];
  const offenders = [];
  for (const file of await listTextFiles(dist)) {
    const text = await fs.readFile(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) {
        offenders.push(`${path.relative(dist, file)} contains ${token}`);
      }
    }
  }
  if (offenders.length) {
    throw new Error(`Public bundle audit failed:\n${offenders.join('\n')}`);
  }
}

async function main() {
  assertSafeDistTarget();
  await emptyDir(dist);

  const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  await fs.writeFile(path.join(dist, 'index.html'), makePublicSafeIndex(index), 'utf8');

  for (const file of [
    'about.html',
    'how-it-works.html',
    'LICENSE',
    'robots.txt',
    'sitemap.xml',
    'site.webmanifest',
    '.nojekyll',
  ]) {
    await copyFile(file);
  }

  await copyDir(path.join('src', 'parser'));
  await copyDir(path.join('assets', 'fonts'));
  await copyDir(path.join('assets', 'vendor'));
  await copyFile(path.join('assets', 'favicon.svg'));
  await copyFile(path.join('assets', 'social-card.svg'));
  await copyFile(path.join('assets', 'social-card.png'));
  await writePublicHeaders();
  await applySiteMetadata(dist);
  await writePublicDocs();
  await auditPublicBundle();

  console.log(`Public-safe bundle written to ${dist}`);
  console.log(`Site metadata URL: ${SITE_URL}`);
}

await main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
