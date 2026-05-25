import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySiteMetadata, SITE_URL } from './site-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-full');

function assertSafeDistTarget() {
  if (path.basename(dist) !== 'dist-full' || path.dirname(dist) !== root) {
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

async function countFiles(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(abs);
    } else {
      total += 1;
    }
  }
  return total;
}

async function writeFullDocs() {
  const readme = `# Stardew Wrapped Full Asset Build

This folder is the full static deployment bundle.

- Deploy the contents of this directory as the site root.
- No build command is required after this folder is generated.
- Stardew-style image, audio, character, farmer, UI, and portrait assets are included.
- Save parsing runs locally in the browser; no backend is required.

Suggested hosts: Cloudflare Pages, GitHub Pages, Netlify, Vercel static hosting, or any static file server.
`;

  const notice = `# Notices

This project is an unofficial fan-made tool and is not affiliated with, endorsed by, or sponsored by ConcernedApe.

The full asset build includes copied Stardew Valley image/audio/portrait assets to preserve the intended Stardew-style visual experience. Stardew Valley names, marks, images, audio, and game content belong to ConcernedApe LLC and/or their respective rights holders and are not covered by this repository's MIT license.

The app runs entirely in the browser. Save files are read locally with the File API and are not uploaded.
`;

  await fs.writeFile(path.join(dist, 'README.md'), readme, 'utf8');
  await fs.writeFile(path.join(dist, 'NOTICE.md'), notice, 'utf8');
}

async function auditFullBundle() {
  const requiredDirs = [
    path.join(dist, 'assets', 'stardew'),
    path.join(dist, 'assets', 'audio'),
    path.join(dist, 'portraits'),
    path.join(dist, 'assets', 'fonts'),
    path.join(dist, 'assets', 'vendor'),
    path.join(dist, 'src', 'parser'),
  ];

  for (const dir of requiredDirs) {
    if (!await exists(dir)) throw new Error(`Required directory missing in full build: ${dir}`);
  }

  const indexPath = path.join(dist, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  if (index.includes('data-public-safe="true"')) {
    throw new Error('Full build index.html must not enable public-safe mode by default');
  }
  for (const token of ['assets/stardew', 'assets/audio', 'portraits/']) {
    if (!index.includes(token)) {
      throw new Error(`Full build index.html is missing expected original-resource reference: ${token}`);
    }
  }

  const counts = {
    stardew: await countFiles(path.join(dist, 'assets', 'stardew')),
    audio: await countFiles(path.join(dist, 'assets', 'audio')),
    portraits: await countFiles(path.join(dist, 'portraits')),
  };
  if (counts.stardew < 40 || counts.audio < 5 || counts.portraits < 20) {
    throw new Error(`Full build asset audit failed: ${JSON.stringify(counts)}`);
  }
  return counts;
}

async function main() {
  assertSafeDistTarget();
  await emptyDir(dist);

  for (const file of [
    'index.html',
    'about.html',
    'how-it-works.html',
    'LICENSE',
    'robots.txt',
    'sitemap.xml',
    'site.webmanifest',
    '_headers',
    '.nojekyll',
  ]) {
    await copyFile(file);
  }

  for (const dir of [
    path.join('src', 'parser'),
    path.join('assets', 'fonts'),
    path.join('assets', 'vendor'),
    path.join('assets', 'stardew'),
    path.join('assets', 'audio'),
    'portraits',
  ]) {
    await copyDir(dir);
  }

  await copyFile(path.join('assets', 'favicon.svg'));
  await copyFile(path.join('assets', 'social-card.svg'));
  await copyFile(path.join('assets', 'social-card.png'));
  await applySiteMetadata(dist);
  await writeFullDocs();
  const counts = await auditFullBundle();

  console.log(`Full asset bundle written to ${dist}`);
  console.log(`Site metadata URL: ${SITE_URL}`);
  console.log(`Included assets: ${counts.stardew} Stardew files, ${counts.audio} audio files, ${counts.portraits} portraits`);
}

await main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
