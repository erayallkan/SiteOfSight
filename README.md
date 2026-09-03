# SiteOfSight

Mobil IFC/BIM goruntuleyici. Tek kod tabanindan iOS + Android (Expo / React Native).
Sunucu yok, hesap yok: modeller, olcumler ve gecmis yalnizca cihazda saklanir.

---

## Hizli baslangic

```bash
npm run bootstrap    # bagimliliklar + vendor indirme + ornek model + viewer paketi
npm run ios          # veya: npm run android
```

`bootstrap` sirasiyla sunlari yapar:

| Adim | Komut | Ne yapar |
| --- | --- | --- |
| 1 | `npm install` | JS bagimliliklari |
| 2 | `npm run setup` | `expo install` ile native modullerin SDK'ya uygun surumleri |
| 3 | `npm run vendor` | `three.min.js`, `web-ifc-api-iife.js`, `web-ifc.wasm` indirir |
| 4 | `npm run sample` | `assets/sample/ornek-model.ifc` uretir |
| 5 | `npm run build:viewer` | Hepsini tek dosyaya gomer: `assets/viewer/dist/viewer.html` |

> `assets/viewer/vendor/` ve `assets/viewer/dist/` uretilen dosyalardir, git'e girmez.
> Viewer JS kaynagini (`assets/viewer/js/*.js`) her degistirdiginde `npm run build:viewer` calistir.

---

## Teknoloji secimi ve gerekcesi

### 3B render: WebView + three.js + web-ifc (secilen yol)

| | WebView + three.js + web-ifc | Native (Filament / SceneKit) + glTF |
| --- | --- | --- |
| IFC ayristirma | `web-ifc` (WASM) dogrudan cihazda, ek servis yok | IFC parser'i yok; sunucuda veya ayri bir native kutuphane ile glTF'e cevirmek gerekir |
| Kod tabani | Tek (JS), iki platform | Android + iOS icin ayri render katmani |
| Ham GPU performansi | ~%10-25 daha dusuk (WebGL + WebView katmani) | En yuksek |
| Ozellik zenginligi | Kesit duzlemi, instancing, raycast, ViewCube hazir | Hepsi elle yazilir |
| Gelistirme hizi | Yuksek | Dusuk |

**Karar:** WebView + three.js + web-ifc. Belirleyici olan **IFC'nin cihazda ayristirilabilmesi**;
`web-ifc` bunu yapan tek olgun tasinabilir kutuphane ve WASM olarak calistigi icin native tarafta
karsiligi yok. Ham GPU farki, asagidaki optimizasyonlarla 30 FPS hedefinin altina dusurmuyor.
Ileride tek bir ekran (walkthrough gibi) native render isterse, glTF cikisi alinip
Filament/SceneKit'e devredilebilecek sekilde katman ayrik tutuldu.

### Performans onlemleri (`assets/viewer/js/`)

- **Instancing** — ayni `geometryExpressID` + ayni renk tek `InstancedMesh`'e toplanir.
  Bir binadaki yuzlerce ayni pencere tek draw call olur (`ifc.js`).
- **Frustum culling** — her instance grubu icin bounding sphere hesaplanir, three.js
  gorunmeyen gruplari cizmez.
- **Ekran alani LOD** — 250 ms'de bir, ekranda 2 pikselden kucuk gorunen gruplar
  render disi birakilir (`app.js: updateLod`).
- **Adaptif cozunurluk** — FPS 28'in altina duserse `pixelRatio` kademeli dusurulur,
  52'nin ustune cikinca geri yukseltilir (`app.js: adaptQuality`).
- **Talep uzerine render** — kamera veya sahne degismedikce yeni kare cizilmez.
- **Gizleme sifir maliyetli** — eleman gizleme, instance matrisini sifir olceklendirerek
  yapilir; geometri yeniden yuklenmez (`tools.js: VisibilityTool`).
- **Interleaved buffer** — pozisyon + normal tek `Float32Array`'de tutulur (web-ifc'nin
  cikis formatiyla ayni), kopyalama ve bellek yarisa iner.

Hedef: orta seviye telefonda 50 MB+ IFC dosyasinda >= 30 FPS.
Ayarlar > "FPS gostergesi" ile canli olcebilirsin.

### Neden tek dosyalik `viewer.html`?

WebView sayfayi `file://` uzerinden acar. Bu kaynakta `origin` **null** oldugu icin
ES module import'lari ve `fetch`/`XHR` istekleri CORS'a takilir (ozellikle iOS/WKWebView).
Cozum: `scripts/build-viewer.mjs` three.js, web-ifc ve tum viewer kodunu **tek HTML'e gomer**.
Sayfanin hicbir alt kaynak istegi kalmaz -> iki platformda da ayni sekilde calisir.

WASM ikilisi ve IFC dosyasi da ayni sebeple diskten okunmaz; RN tarafindan
**base64 parcalar halinde** (her parca sonrasi `ack` beklenerek) kopruden gecirilir
(`src/viewer/ViewerCanvas.js`). WASM, WebView icinde `Blob` + `URL.createObjectURL`
ile web-ifc'ye verilir (`ifc.js: init`).

---

## Mimari

```
assets/viewer/
  index.html            Kaynak sablon (gelistirme icin)
  js/util.js            Base64/renk/birim yardimcilari
  js/bridge.js          RN <-> WebView mesaj protokolu, global hata yakalama
  js/controls.js        Dokunmatik kamera (1 parmak orbit, 2 parmak pan + pinch)
  js/viewcube.js        Revit tarzi ViewCube (yuze dokun -> ortografik gecis)
  js/ifc.js             web-ifc -> InstancedMesh + mekansal agac + Pset okuma
  js/tools.js           Kesit, gizle/izole, tel kafes, patlatma, olcum (snap+undo/redo)
  js/app.js             Sahne, render dongusu, secim, komut isleyicileri
  vendor/               (uretilir) three.min.js, web-ifc-api-iife.js, web-ifc.wasm
  dist/viewer.html      (uretilir) hepsi gomulu tek dosya

src/
  viewer/ViewerCanvas.js   WebView sarmalayici + parcali dosya aktarimi + imperative API
  screens/                 Onboarding, Home (gecmis), Viewer, Settings
  components/              BottomSheet/Slider/Segmented, ModelTree, Properties, Measure, Display
  db/database.js           SQLite: models, measurements
  services/                assets (paketli dosyalar), modelFiles (secme/dogrulama/kopyalama)
  store/AppContext.js      Tema + dil + birim + onboarding (AsyncStorage)
  i18n/                    Turkce (varsayilan) / Ingilizce
  theme/                   Koyu + acik palet
```

### Kopru protokolu

RN -> WebView (`injectJavaScript` ile `SOS.bridge.cmd(json)`):
`wasmChunk`, `wasmEnd`, `ifcBegin`, `ifcChunk`, `ifcEnd`, `fit`, `resetView`,
`viewDirection`, `setTheme`, `section`, `clearSection`, `hide`, `show`, `isolate`,
`showAll`, `wireframe`, `xray`, `explode`, `layerSeparate`, `select`, `measureMode`,
`measureUnit`, `measureUndo`, `measureRedo`, `measureClear`, `showHud`,
`walkEnter`, `walkExit`, `walkMove`, `walkLook`, `showStorey`, `showAllStoreys`,
`timelineBuild`, `timelineSet`, `timelineClear`

WebView -> RN (`postMessage`):
`ready`, `ack`, `booted`, `progress`, `loaded`, `selection`, `measurement`,
`measureState`, `viewCube`, `fps`, `log`, `error`, `timelineReady`

---

## Ozellikler

- **Model agaci** — Proje > Saha > Bina > Kat > Eleman; isim/tip/GUID aramasi, "Tip" sekmesi,
  eleman bazli gizle/izole.
- **Parametrik inceleme** — modele dokun: GUID, IFC tipi, malzeme, sinir kutusu boyutlari,
  miktarlar ve tum Property Set'ler kaydirilabilir panelde.
- **Kesit** — X/Y/Z duzlemi, kaydirici ile konum, yon cevirme.
- **ViewCube** — sol altta; bir yuze dokununca kamera o yone **ortografik** gecer,
  serbest gezinmede perspektif kamera kullanilir.
- **Olcum** — kose / kenar orta noktasi / yuzey merkezi yakalama (her zaman acik),
  mesafe ve aci, undo/redo, gecmis SQLite'a yazilir.
- **Patlatma** — radyal (merkezden disari) veya katman katman (kat bazinda) ayirma.
- **X-Ray** — modelin tamami yari saydamlasir, secili eleman opak vurguyla one cikar.
- **Kat gecisi** — birden fazla `IfcBuildingStorey` iceren modellerde yukari/asagi
  butonlariyla tek bir kati izole edip ona sigdirir (bkz. `FloorNav.js`).
- **Zaman tuneli (4D)** — Pset'lerinde ISO tarih (`YYYY-MM-DD`) tasiyan elemanlar
  taranir, kaydiracla secilen tarihe kadar olanlar gosterilir; tarih tasimayan
  elemanlar (cogu model) her zaman gorunur kalir. Modelde tarih verisi yoksa
  bos durum mesaji gosterilir.
- **Disaridan dosya acma** — baska bir uygulamadan "birlikte ac" / paylas ile
  gelen `.ifc` dosyalari dogrudan modeller gecmisine eklenip acilir (bkz.
  `app.json` `ios.infoPlist.CFBundleDocumentTypes` / `android.intentFilters`
  ve `App.js` `Linking` isleyicisi).
- **Tema ve dil** — koyu/acik/sistem, Turkce/Ingilizce, ayarlardan degistirilir.
- **Gecmis** — son acilan modeller yerel veritabanindan listelenir (uzun basip sil).

## Hata yonetimi

Cokme yerine anlasilir mesaj gosterilir:

| Durum | Mesaj anahtari |
| --- | --- |
| Dosya boyut sinirini asiyor (varsayilan 750 MB) | `errors.tooLarge` |
| Uzanti `.ifc` degil veya basligi `ISO-10303-21` icermiyor | `errors.notIfc` |
| Dosya okunamadi / aktarim koptu | `errors.unreadable` |
| web-ifc dosyayi ayristiramadi | `errors.parseFailed` |
| Geometri uretilemedi | `errors.noGeometry` |
| WebView render sureci oldu (bellek) | `errors.lowMemory` |

Viewer icindeki tum `window.onerror` ve `unhandledrejection` olaylari da kopruden
RN'e tasinir; sahne asla sessizce bos kalmaz.

---

## Dogrulama

IFC zinciri (ayristirma -> geometri -> agac -> Pset -> raycast) Node uzerinde
gercek `web-ifc` + `three` ile calistirilarak dogrulandi. Ornek modelde:
8 eleman, 96 ucgen, 8 instanced grup, dogru mekansal hiyerarsi, `Pset_WallCommon`
degerleri ve 8000 x 200 x 3000 mm boyut okumasi.

Metro paketleme (`npx expo export --platform android`) hatasiz tamamlaniyor;
`viewer.html`, `web-ifc.wasm` ve `ornek-model.ifc` asset olarak pakete giriyor.

## Bilinenler / sonraki adimlar

- Buyuk dosyalarda `StreamAllMeshes` senkron calisir; bu asamada ilerleme yuzdesi yerine
  islenen eleman sayisi gosterilir.
- Zaman tuneli, tarih bilgisini yalniz `Pset` `NominalValue` degerlerinde ISO
  formatinda (`YYYY-MM-DD...`) arar; `IfcTask`/`IfcWorkSchedule` gibi yapim
  programi verisi ayrica islenmez.
- Deep link (disaridan dosya acma) icin `app.json` degisiklikleri native
  build'de (`expo prebuild` / EAS) etkin olur; Expo Go'da sinirli test edilebilir.
- Hesap gerekiyorsa Firebase Auth gibi bir BaaS eklenebilir; mevcut akista
  hicbir veri cihazdan cikmadigi icin bu tamamen opsiyoneldir.
