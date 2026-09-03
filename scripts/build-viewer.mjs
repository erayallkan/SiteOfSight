/**
 * Viewer'i TEK bir self-contained HTML dosyasina paketler:
 *   assets/viewer/dist/viewer.html
 *
 * Neden: WebView'de sayfa file:// uzerinden acilir. Harici <script src> ve
 * ESM import'lari "origin null" CORS kisitina takilabilir. Her seyi tek dosyaya
 * gomunce hicbir alt kaynak istegi kalmaz -> iOS ve Android'de ayni sekilde calisir.
 *
 * Kullanim: npm run build:viewer   (once "npm run vendor")
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = join(ROOT, 'assets', 'viewer');
const DIST = join(VIEWER, 'dist');

const SCRIPTS = [
  'vendor/three.min.js',
  'vendor/web-ifc-api-iife.js',
  'js/util.js',
  'js/bridge.js',
  'js/controls.js',
  'js/viewcube.js',
  'js/ifc.js',
  'js/tools.js',
  'js/app.js',
];

/** Inline script icinde </script> dizisi sayfayi erken kapatir. */
function escapeForInline(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

async function ensure(path, hint) {
  try {
    await stat(path);
  } catch {
    throw new Error(`Eksik dosya: ${path}\n  -> ${hint}`);
  }
}

const html = await readFile(join(VIEWER, 'index.html'), 'utf8');

const parts = [];
for (const rel of SCRIPTS) {
  const abs = join(VIEWER, rel);
  await ensure(abs, rel.startsWith('vendor/') ? 'Once "npm run vendor" calistirin.' : 'Kaynak dosya bulunamadi.');
  const code = await readFile(abs, 'utf8');
  parts.push(`<!-- ${rel} -->\n<script>\n${escapeForInline(code)}\n</script>`);
}

// index.html icindeki <script src="..."> etiketlerini gomulu bloklarla degistir
// DIKKAT: replace'e replacement STRING verilirse, gomulen minified kodda gecen
// $&, $', $` gibi diziler ozel desen sayilip kodu bozar (three.js bu yuzden kirilmisti).
// Bu nedenle replacement olarak fonksiyon veriyoruz.
const withoutTags = html.replace(/[ \t]*<script src="[^"]*"><\/script>\r?\n?/g, '');
const inlined = `${parts.join('\n')}\n</body>`;
const output = withoutTags.replace('</body>', () => inlined);

await mkdir(DIST, { recursive: true });
const target = join(DIST, 'viewer.html');
await writeFile(target, output, 'utf8');

const size = (Buffer.byteLength(output) / 1024 / 1024).toFixed(2);
console.log(`viewer.html olusturuldu (${size} MB): assets/viewer/dist/viewer.html`);
console.log(`  gomulu script sayisi: ${parts.length}`);
