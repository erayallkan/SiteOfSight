/* Uygulamayla paketlenen varliklarin yerel dosya yollari.
   metro.config.js icinde html/wasm/ifc uzantilari assetExts'e eklenmistir. */
import { Asset } from 'expo-asset';

const VIEWER_HTML = require('../../assets/viewer/dist/viewer.html');
const WEB_IFC_WASM = require('../../assets/viewer/vendor/web-ifc.wasm');
const SAMPLE_IFC = require('../../assets/sample/ornek-model.ifc');

const cache = new Map();

async function localUriOf(moduleRef, key) {
  if (cache.has(key)) return cache.get(key);
  const asset = Asset.fromModule(moduleRef);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  cache.set(key, uri);
  return uri;
}

/** Tek dosyalik, kendi kendine yeten viewer sayfasi (three.js + web-ifc gomulu). */
export function viewerHtmlUri() {
  return localUriOf(VIEWER_HTML, 'viewer');
}

/** web-ifc WASM ikilisi - WebView'e base64 parcalar halinde aktarilir. */
export function webIfcWasmUri() {
  return localUriOf(WEB_IFC_WASM, 'wasm');
}

/** "Ornek Model Ac" icin paketlenmis IFC dosyasi. */
export function sampleIfcUri() {
  return localUriOf(SAMPLE_IFC, 'sample');
}
