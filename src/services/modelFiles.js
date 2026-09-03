/* IFC dosyasi secme, dogrulama ve uygulama icine kopyalama.
   Cokme yerine anlasilir hata kodlari dondurur. */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { sampleIfcUri } from './assets';

export const MODELS_DIR = `${FileSystem.documentDirectory}models/`;

export class ModelFileError extends Error {
  constructor(code, params) {
    super(code);
    this.code = code;      // errors.* sozluk anahtari
    this.params = params || {};
  }
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
}

function sanitize(name) {
  return String(name || 'model.ifc').replace(/[^\w.\-]+/g, '_').slice(-80);
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Hermes'te atob/Buffer yok; ASCII header kontrolu icin minimal base64 decode. */
function base64ToAscii(b64) {
  let out = '';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  for (let i = 0; i < clean.length - 1; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] !== undefined ? BASE64_CHARS.indexOf(clean[i + 2]) : -1;
    const c3 = clean[i + 3] !== undefined ? BASE64_CHARS.indexOf(clean[i + 3]) : -1;
    if (c0 < 0 || c1 < 0) break;
    out += String.fromCharCode(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 >= 0) out += String.fromCharCode(((c1 << 4) | (c2 >> 2)) & 0xff);
    if (c3 >= 0) out += String.fromCharCode(((c2 << 6) | c3) & 0xff);
  }
  return out;
}

/** Ilk baytlari okuyup gercekten bir STEP/IFC dosyasi mi diye bakar. */
async function verifyIfcHeader(uri) {
  let base64;
  try {
    // 256 bayt (3'un kati) yeterli: "ISO-10303-21" ilk satirdadir.
    // Base64 + kucuk decode kullaniyoruz (atob/Buffer Hermes'te yok).
    base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 256 * 3,
    });
  } catch {
    throw new ModelFileError('errors.unreadable');
  }
  const text = base64ToAscii(base64);
  if (!/ISO-10303-21/i.test(text)) throw new ModelFileError('errors.notIfc');
}

/**
 * Cihazdan bir IFC secer, uygulamanin models/ klasorune kopyalar.
 * @returns {{name, uri, size}} veya kullanici vazgectiyse null
 */
export async function pickIfcFile(maxSizeMb = 250) {
  // copyToCacheDirectory:false ONEMLI: true olursa expo-document-picker dosyayi
  // Expo Go'nun PAYLASILAN (uygulamamiza ozel olmayan) cache dizinine kopyalar ve
  // expo-file-system o yolu "isn't readable" IOException'i ile reddeder (Expo Go'ya
  // ozgu scoped-storage kisitlamasi). false birakip content:// URI'yi dogrudan
  // kullanmak hem Expo Go'da hem native build'de sorunsuz calisir.
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/x-step', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled) return null;

  const file = result.assets && result.assets[0];
  if (!file) return null;

  const name = sanitize(file.name);
  if (!/\.ifc$/i.test(name)) throw new ModelFileError('errors.notIfc');

  const info = await FileSystem.getInfoAsync(file.uri, { size: true });
  const size = info.size || file.size || 0;
  const limitBytes = maxSizeMb * 1024 * 1024;
  if (size > limitBytes) {
    throw new ModelFileError('errors.tooLarge', {
      size: (size / 1024 / 1024).toFixed(1),
      limit: maxSizeMb,
    });
  }

  await ensureDir();
  const target = `${MODELS_DIR}${Date.now()}_${name}`;
  try {
    await FileSystem.copyAsync({ from: file.uri, to: target });
  } catch {
    throw new ModelFileError('errors.unreadable');
  }

  // Basligi kendi kopyaladigimiz dosyada dogrula (kaynak content:// URI'si kopyalama
  // sonrasi zaten gecerliligini yitirmis olabilir; ayrica boylece tek bir dosya
  // uzerinde calisiriz).
  try {
    await verifyIfcHeader(target);
  } catch (e) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw e;
  }

  return { name: file.name || name, uri: target, size };
}

/** Paketlenmis ornek modeli models/ altina kopyalar (bir kez). */
export async function prepareSampleModel() {
  await ensureDir();
  const target = `${MODELS_DIR}ornek-model.ifc`;
  const info = await FileSystem.getInfoAsync(target, { size: true });
  if (info.exists && info.size > 0) {
    return { name: 'ornek-model.ifc', uri: target, size: info.size, source: 'sample' };
  }
  const source = await sampleIfcUri();
  await FileSystem.copyAsync({ from: source, to: target });
  const copied = await FileSystem.getInfoAsync(target, { size: true });
  return { name: 'ornek-model.ifc', uri: target, size: copied.size || 0, source: 'sample' };
}

export async function fileExists(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists;
  } catch {
    return false;
  }
}

export async function deleteModelFile(uri) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* dosya zaten yoksa sorun degil */
  }
}

export function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
