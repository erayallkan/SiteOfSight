# SiteOfSight - ajan notlari

Expo (React Native) tabanli mobil IFC goruntuleyici. Ayrintili mimari icin `README.md`.

## Dikkat edilecekler

- **Viewer kodu iki yerde yasar.** Kaynak `assets/viewer/js/*.js`, uygulamanin
  kullandigi ise uretilen `assets/viewer/dist/viewer.html`. Viewer JS'ini degistirdikten
  sonra mutlaka `npm run build:viewer` calistir, yoksa degisiklik uygulamaya yansimaz.
- **Viewer JS'i klasik script'tir** (ESM degil, `import`/`export` kullanma).
  Global ad alani `window.SOS`. Sebep: `file://` altinda module import CORS'a takilir.
- **`vendor/` ve `dist/` git'e girmez.** Temiz bir kopyada once `npm run bootstrap`.
- **`babel.config.js` yok** ve olmamali: SDK 57'de `babel-preset-expo` hoist edilmedigi
  icin elle yazilan babel config'i cozulemiyor, varsayilan yapilandirma dogrusu.
- **Buyuk veri kopruden base64 parcalar halinde gecer** (`ViewerCanvas.transfer`).
  Parca boyutu 3'un kati olmali, yoksa base64 parcalari bagimsiz cozulemez.
- Yeni bir viewer komutu eklerken: `assets/viewer/js/app.js` icinde `on('komut', ...)`
  ve `src/viewer/ViewerCanvas.js` icindeki `useImperativeHandle` blogu birlikte guncellenir.

## Dogrulama

- Sozdizimi: proje JS'lerini `@babel/parser` ile ayristirmak yeterli.
- IFC zinciri: Node uzerinde `web-ifc` + `three` ile `assets/sample/ornek-model.ifc`
  yuklenerek dogrulanabilir (bkz. README "Dogrulama").
- Paketleme: `npx expo export --platform android` hatasiz tamamlanmali ve cikti
  asset listesinde `viewer.html`, `web-ifc.wasm`, `ornek-model.ifc` gorunmeli.
