/**
 * Viewer icin vendor dosyalarini indirir (bir kez calistirilir):
 *   assets/viewer/vendor/three.min.js            -> global THREE (UMD, ESM DEGIL)
 *   assets/viewer/vendor/web-ifc-api-iife.js     -> global WebIFC (IIFE, ESM DEGIL)
 *   assets/viewer/vendor/web-ifc.wasm            -> RN tarafindan WebView'e aktarilir
 *
 * ESM yerine klasik script kullaniyoruz: WebView file:// altinda module import
 * "origin null" CORS hatasi verir, klasik <script src> vermez.
 *
 * Kullanim: npm run vendor
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'viewer', 'vendor');

// three r159 = UMD build iceren son surumlerden biri (r160+ UMD'yi kaldirdi)
const THREE_VERSION = '0.159.0';
const WEBIFC_VERSION = '0.0.57';

const FILES = [
  {
    name: 'three.min.js',
    urls: [
      `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.min.js`,
      `https://unpkg.com/three@${THREE_VERSION}/build/three.min.js`,
    ],
  },
  {
    name: 'web-ifc-api-iife.js',
    urls: [
      `https://cdn.jsdelivr.net/npm/web-ifc@${WEBIFC_VERSION}/web-ifc-api-iife.js`,
      `https://unpkg.com/web-ifc@${WEBIFC_VERSION}/web-ifc-api-iife.js`,
    ],
  },
  {
    name: 'web-ifc.wasm',
    urls: [
      `https://cdn.jsdelivr.net/npm/web-ifc@${WEBIFC_VERSION}/web-ifc.wasm`,
      `https://unpkg.com/web-ifc@${WEBIFC_VERSION}/web-ifc.wasm`,
    ],
  },
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(file) {
  const target = join(OUT, file.name);
  if (await exists(target) && !process.argv.includes('--force')) {
    console.log(`  = ${file.name} (mevcut, atlandi)`);
    return;
  }
  let lastError;
  for (const url of file.urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`beklenenden kucuk (${buf.length} B)`);
      await writeFile(target, buf);
      console.log(`  + ${file.name} (${(buf.length / 1024).toFixed(0)} KB) <- ${url}`);
      return;
    } catch (err) {
      lastError = err;
      console.log(`  ! ${url} basarisiz: ${err.message}`);
    }
  }
  throw new Error(`${file.name} indirilemedi: ${lastError?.message}`);
}

await mkdir(OUT, { recursive: true });
console.log(`Vendor dosyalari indiriliyor -> ${OUT}`);
for (const f of FILES) await download(f);
console.log('Tamamlandi.');
