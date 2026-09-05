/* SiteOfSight viewer - sahne kurulumu, render dongusu, secim ve RN komut isleyicileri */
(function (SOS) {
  'use strict';

  var post = SOS.bridge.post;
  var on = SOS.bridge.on;

  var canvas = document.getElementById('gl');
  var overlay = document.getElementById('overlay');
  var hud = document.getElementById('hud');
  var crosshairEl = document.getElementById('crosshair');

  var renderer, scene, perspCamera, orthoCamera, camera, controls, cube;
  var model = null;
  var section, visibility, explode, measure;
  var timelineTintedIds = new Set(); // 4D zaman tunelinde "devam ediyor" olarak boyanan expressID'ler
  var selectionMesh = null;
  var selectedId = null;
  var needsRender = true;

  /* Yurume (walkthrough) modu: 2 sanal joystick ile ilk sahis gezinme. */
  var walk = {
    active: false,
    position: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    speed: 3,                // hiz carpani - sabit 3x
    vy: 0,                   // dusey hiz (m/s, asagi yonlu pozitif) - yercekimi/dusme icin
    falling: false
  };
  var WALK_MOVE_MPS = 1.4;   // insan yuruyus hizi (m/s)
  var WALK_LOOK_RATE = 2.2;  // tam kuvvette radyan/s
  var walkTapDown = null;    // {x,y,t,moved,id} - yurume modunda (controls.enabled=false oldugu
                              // icin TouchControls.onTap calismiyor) elemana dokunarak secim
                              // yapabilmek icin ayri, hafif bir dokunma algilayici
  var walkPicking = false;   // true iken bir sonraki dokunma yurume baslangic noktasidir
  var walkArmedAt = 0;       // walkPicking'in true oldugu an (ms) - armadan ONCE baslamis
                              // (parmak zaten ekrandayken yurume butonuna basilmasi gibi) bir
                              // dokunusun kalinti "tap"ini yurume baslangici saymamak icin
  var WALK_FOV_WIDE = 90;    // yurume modunda her zaman kullanilan genis-aci FOV
  var WALK_GROUND_PROBE_UP_M = 0.45;  // ayaklarin bu kadar ustunden taranmaya baslar (m) - normal basamagi kapsar, tavana degmez
  var WALK_GROUND_PROBE_DOWN_M = 1.2; // oradan asagi bu mesafeye kadar taranir (m) - bundan buyuk kot farklari "bosluk" sayilip dusmeye birakilir
  var WALK_GRAVITY_MPS2 = 9.8;  // yercekimi ivmesi (m/s^2)
  var WALK_TERMINAL_MPS = 14;   // dusme hizi bu degerde sabitlenir (m/s)
  var WALK_FALL_FLOOR_MARGIN_M = 2; // modelin en alt noktasinin bu kadar altinda "taban" varsayilir - sonsuza dusmeyi onler
  var minimapCam = null;
  var minimapMarker = null;
  var MINIMAP_LAYER = 1;
  var MINIMAP_RADIUS_M = 9; // minimap'in gosterdigi yaricap (m), gercek dunya olcusunde

  /* Bolunmus ekran: ustte kat plani, altta 3B - aralarinda suruklenebilir bir
   *  ayirici. Ayni WebGL context/sahne icinde ikinci bir ortografik (ustten,
   *  kuzey-yukari) kamera; minimap'teki scissor-viewport teknigi
   *  genellestirilerek her zaman (yurume modu disinda) acilabilir, pan/zoom
   *  edilebilir, dokunulabilir hale getirildi. Model IKINCI kez yuklenmez -
   *  tek WebView/tek sahne uzerinden iki viewport cizilir. 3B viewport artik
   *  tam ekran degil (mainRect) oldugu icin kamera aspect'i, pick/toScreen ve
   *  ViewCube de mainRect'e gore hesaplanir (asagida applyMainRectToCameras,
   *  pick, toScreen, handleTap). */
  var planCam = null;
  var planMarker = null;
  var PLAN_LAYER = 2;
  var splitMode = false;
  var currentStoreyId = null; // showStorey ile secilen kat - plani ona gore cerceveler
  var mainRect = { x: 0, y: 0, w: 0, h: 0 }; // 3B viewport, CSS px, DOM ust-orijin
  var planRect = { x: 0, y: 0, w: 0, h: 0 }; // plan viewport, CSS px, DOM ust-orijin
  var DIVIDER_PX = 22; // suruklenebilir ayiricinin dokunma yuksekligi
  var planSplitFrac = 0.42; // plan panosunun ekran yuksekligine orani (ayiriciyla degisir)
  var PLAN_SPLIT_MIN = 0.18, PLAN_SPLIT_MAX = 0.72;
  var planPan = { x: 0, z: 0 };  // kullanicinin plan uzerinde kaydirdigi ek ofset (dunya birimi)
  var planZoom = 1;              // otomatik cerceveye ek carpan (1 = binaya/kata tam sigdir)
  var planViewState = null;      // son cizilen plan karesinin {halfW, halfH} - pan/tap donusumleri icin
  var planEdgesMesh = null;      // binanin "pafta" cizgileri - bkz. rebuildPlanEdgesGeometry()
  var planEdgesDirty = true;     // true iken bir sonraki plan karesinden once yeniden birlestirilir
  var PLAN_EDGE_ANGLE_DEG = 25;  // bu acidan DUSUK komsu yuz farkli kenarlar (ör. ucgenlestirme capraz cizgileri) ATLANIR
  var PLAN_EDGE_MAX_INSTANCES = 15000; // asiri buyuk modellerde tek seferde birlestirilecek instance sinirlaması

  /** Yurume modunda kamerayi her zaman genis-aci FOV'a ayarlar (hizdan bagimsiz). */
  function updateWalkFov() {
    if (!perspCamera) return;
    if (perspCamera.fov !== WALK_FOV_WIDE) {
      perspCamera.fov = WALK_FOV_WIDE;
      perspCamera.updateProjectionMatrix();
      needsRender = true;
    }
  }

  /* Olcumde hassas capraz-imlec (crosshair) modu: parmagi surukleme ANINDA
   *  (bekleme suresi olmadan) acilir, boylece basit bir dokunus hala aninda
   *  nokta koyar, ama surukleyerek getirilen dokunuslar dogrudan koseye/
   *  kenara hassas hizalanabilir. */
  var CROSSHAIR_DRAG_PX = 10; // bu kadar hareket = surukleme (tap degil)
  var CROSSHAIR_LIFT = 90;    // px, parmagin ustunde gorunsun diye
  var chPress = null;         // { x, y, id }
  var chActive = false;
  var chEditRef = null;       // surukleme tamamlanmis bir olcum ucunu mu tasiyor: { item, pointIndex } | null
  // Mobil GPU'larda ilk cizim, shader derlemesi arka planda oldugu icin sessizce
  // "bos kare" verebilir (WebGL programlari lazy/async compile edilir - suresi
  // cihaza gore degisir, sabit kare sayisi yetersiz kalabilir). Model her
  // yuklendiginde veya malzemeler yeniden derlenmesi gerektiren bir degisiklikte
  // (kesit acma/kapama gibi) belirli bir SURE boyunca (kare sayisi degil) art
  // arda zorla render edilir; boylece kullanici dokunmadan da model gorunur olur.
  var warmupUntil = 0;
  function warmup(ms) { warmupUntil = Math.max(warmupUntil, performance.now() + (ms || 1200)); needsRender = true; }

  /** Model listesinde gosterilecek kucuk onizleme goruntusu; RN tarafi bunu
   *  base64 olarak dogrudan modelin thumbnail_data sutununa kaydeder (dosya
   *  YOK - bkz. src/screens/ViewerScreen.js handleThumbnail).
   *  NOT: ilk surum, tam ekran boyutundaki ana canvas'i AYRI bir offscreen 2D
   *  canvas'a drawImage ile kopyalayip oradan okuyordu - hata vermeden
   *  calisiyordu ama sonuc bos/arka plan rengi gibi gorunuyordu (muhtemelen
   *  WebGL tamponunun drawImage anindaki dolayli okumasi guvenilir degildi).
   *  Simdi renderer GECICI olarak kucuk hedef boyuta alinip DOGRUDAN o anda
   *  tek bir kare ciziliyor ve AYNI (ana) canvas'tan okunuyor - araya baska
   *  bir canvas girmiyor. Bu birkac kare surer; RN tarafinin yukleme katmani
   *  bu sirada hala ekranda oldugu icin (bkz. ViewerScreen 1600ms gecikmesi)
   *  gorsel bir titreme yasanmaz. */
  function captureThumbnail() {
    var prevW = window.innerWidth, prevH = window.innerHeight;
    var prevRatio = renderer.getPixelRatio();
    var prevAspect = camera.isPerspectiveCamera ? camera.aspect : null;
    try {
      var THUMB_W = 320;
      var THUMB_H = Math.max(1, Math.round(THUMB_W * (prevH / prevW)));

      renderer.setPixelRatio(1);
      renderer.setSize(THUMB_W, THUMB_H, false); // false: canvas'in CSS boyutu degismez, sadece cizim tamponu
      renderer.setViewport(0, 0, THUMB_W, THUMB_H);
      if (camera.isPerspectiveCamera) {
        camera.aspect = THUMB_W / THUMB_H;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera); // ViewCube/HUD YOK - sadece 3B sahne

      var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      post('thumbnail', { dataUrl: dataUrl });
    } catch (e) {
      post('log', { message: 'thumbnail yakalama basarisiz: ' + (e && e.message ? e.message : e) });
    } finally {
      // Eski boyuta/kamera oranina geri don - bir sonraki normal kare
      // dogru gorunsun diye.
      renderer.setPixelRatio(prevRatio);
      renderer.setSize(prevW, prevH, false);
      renderer.setViewport(0, 0, prevW, prevH);
      if (prevAspect !== null) {
        camera.aspect = prevAspect;
        camera.updateProjectionMatrix();
      }
      needsRender = true;
    }
  }
  var lodTimer = 0;
  var quality = { pixelRatio: 1, target: 1, frames: 0, acc: 0, fps: 0 };
  var bg = 0x20232A;

  /* ---------------- Kurulum ---------------- */

  function init() {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      // Buyuk binalarda near/far araligi (fit() bkz.) birkac milyon:1 orana
      // ulasabiliyor; standart derinlik tamponu bu oranda coker ve genis
      // duz yuzeylerde (tavan/doseme) z-fighting sonucu "bulanik"/benekli
      // gorunum olusuyordu. Logaritmik derinlik tamponu bu orani sorun
      // olmaktan cikarir.
      logarithmicDepthBuffer: true,
      // Model onizleme gorseli (thumbnail) icin canvas.toDataURL cizim
      // tamamlandiktan hemen sonra okunabilsin diye framebuffer korunur.
      preserveDrawingBuffer: true
    });
    quality.target = Math.min(window.devicePixelRatio || 1, 2);
    quality.pixelRatio = quality.target;
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setClearColor(bg, 1);
    // Kesit araci kapaliyken de plan panosunun yatay "kesit" kirpma duzlemi
    // (renderPlanPane) calissin diye global olarak acik birakilir - SectionTool
    // artik kendi enabled durumuna gore bunu KAPATMIYOR (bkz. tools.js _apply).
    renderer.localClippingEnabled = true;

    scene = new THREE.Scene();

    var aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    perspCamera = new THREE.PerspectiveCamera(55, aspect, 0.05, 20000);
    orthoCamera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, -20000, 20000);
    camera = perspCamera;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x606070, 1.15));
    var key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(1, 2, 1.5);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1.5, 0.6, -1);
    scene.add(fill);

    controls = new SOS.TouchControls(camera, canvas);
    controls.onTap = handleTap;
    controls.onChange = function () { needsRender = true; };

    // RN ust baslik cubugunun (geri/baslik/sigdir) altinda kalmasin diye sag-uste,
    // ekranin tepesinden belirgin bosluklu yerlestirilir.
    cube = new SOS.ViewCube({ size: 78, marginRight: 16, marginTop: 112, dark: true });
    setupMinimap();
    setupPlanPane();
    setupPlanDivider();

    var env = makeEnv();
    section = new SOS.SectionTool(env);
    visibility = new SOS.VisibilityTool(env);
    explode = new SOS.ExplodeTool(env);
    measure = new SOS.MeasureTool(env);

    window.addEventListener('resize', resize);
    canvas.addEventListener('pointermove', function (e) {
      if (measure.mode !== 'none' && !chActive) measure.hover(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerdown', function (e) {
      if (measure.mode === 'none') return;
      if (chPress) {
        // ikinci parmak indi (olasi pinch): bekleyen surukleme adayini,
        // yarim kalmis olcum noktalarini VE (varsa) surdurulmekte olan
        // uc duzenlemesini iptal et - kullanici iki parmakla dokunarak
        // yanlis baslanmis bir islemi kolayca basa sarabilsin diye.
        if (chActive && chEditRef) measure.cancelEditPoint();
        if (chActive) { crosshairEl.style.display = 'none'; controls.enabled = true; }
        chPress = null;
        chActive = false;
        chEditRef = null;
        measure.cancelPending();
        return;
      }
      // Var olan bir olcumun (distance/angle) ucuna yakin basildiysa, yeni
      // nokta eklemek yerine o ucu suruklenerek yeniden konumlandirma
      // moduna gecilir - surukleme esigi asilana kadar henuz kesin degil.
      chEditRef = measure.hitTestPoint(e.clientX, e.clientY);
      chPress = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }, { passive: true });
    canvas.addEventListener('pointermove', function (e) {
      if (!chPress || chPress.id !== e.pointerId) return;
      if (!chActive) {
        var dx = e.clientX - chPress.x, dy = e.clientY - chPress.y;
        if (Math.hypot(dx, dy) < CROSSHAIR_DRAG_PX) return; // henuz surukleme sayilmiyor
        chActive = true;
        controls.enabled = false;
        if (measure.snapDot) measure.snapDot.style.display = 'none';
        if (chEditRef) measure.beginEditPoint(chEditRef);
      }
      crosshairShow(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', function (e) { crosshairEnd(e); });
    canvas.addEventListener('pointercancel', function (e) { crosshairEnd(e, true); });

    // Yurume modunda secim: TouchControls yurume sirasinda devre disi
    // (controls.enabled=false, kamera walk.position/yaw'a gore kontrol edilir),
    // bu yuzden onTap tetiklenmez. Ayni "hizli/az hareketli dokunus = tap"
    // mantigi (bkz. controls.js _down/_up) burada bagimsizca uygulanir.
    canvas.addEventListener('pointerdown', function (e) {
      if (!walk.active) return;
      walkTapDown = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0, id: e.pointerId };
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!walk.active || !walkTapDown || walkTapDown.id !== e.pointerId) return;
      walkTapDown.moved += Math.abs(e.clientX - walkTapDown.x) + Math.abs(e.clientY - walkTapDown.y);
      walkTapDown.x = e.clientX; walkTapDown.y = e.clientY;
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!walk.active || !walkTapDown || walkTapDown.id !== e.pointerId) { walkTapDown = null; return; }
      var quick = Date.now() - walkTapDown.t < 350 && walkTapDown.moved < 12;
      walkTapDown = null;
      if (!quick) return;
      var hit = pick(e.clientX, e.clientY);
      if (hit) selectElement(hit.expressID, false, e.clientX, e.clientY);
      else { clearSelection(); post('selection', null); }
    });
    canvas.addEventListener('pointercancel', function () { walkTapDown = null; });

    /* WebGL baglami kaybi (buyuk modellerde GPU bellek baskisi altinda
     *  tetiklenebilir) COGU ZAMAN GECICIDIR - preventDefault() cagirilirsa
     *  tarayici/WebView kisa surede baglami kendiliginden GERI YUKLER
     *  (webglcontextrestored). ONCEDEN ilk kayip anda dogrudan RN'e fatal
     *  'error' gonderiliyordu; bu, baglam bir-iki saniye icinde kendiliginden
     *  geri gelse bile kullaniciya GEREKSIZ YERE tam ekran hata (ve yanlislikla
     *  "IFC dosyasi ayristirilamadi" gibi alakasiz bir mesaj - cunku GL_CONTEXT_LOST
     *  RN tarafindaki hata haritasinda yoktu) gosteriyordu. Simdi bir sure
     *  (GL_RESTORE_GRACE_MS) geri gelmesi beklenir; gelirse RN hic haberdar
     *  edilmez, gelmezse GERCEKTEN fatal kabul edilip bildirilir. */
    // NOT: bazi cihazlarda GPU zaten sinirin ucundayken baglam KAYBOLUP KISA
    // SURE SONRA GERI GELIP HEMEN TEKRAR KAYBOLUYOR - ayni yuk hala orada
    // oldugu icin dongu bir turlu stabillesmiyor. Sadece "6sn icinde geri
    // gelmedi mi" bakmak bu durumda YANLIS: her kayip kendi 6sn'lik suresi
    // icinde restore oldugundan fatal HICBIR ZAMAN tetiklenmiyor - kullanici
    // ekranin surekli kararip acilmasini ("goz kirpma") ve donmus gibi
    // gorunen bir uygulamayla bas basa kaliyor. Bu yuzden ayrica bir PENCERE
    // icindeki ART ARDA kayip SAYISI da izlenir; kisa surede cok sik kayip
    // GERCEKTEN kararsiz demektir ve tek seferlik gecikmeli kayip kadar
    // "iyi huylu" degildir - o durumda beklemeden fatal kabul edilir.
    var GL_RESTORE_GRACE_MS = 6000;
    var GL_FLAP_WINDOW_MS = 20000;
    var GL_FLAP_LIMIT = 3;
    var glLostTimer = null;
    var glLossTimes = [];
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      var now = performance.now();
      glLossTimes.push(now);
      glLossTimes = glLossTimes.filter(function (t) { return now - t < GL_FLAP_WINDOW_MS; });
      if (glLostTimer) clearTimeout(glLostTimer);
      if (glLossTimes.length >= GL_FLAP_LIMIT) {
        glLostTimer = null;
        post('error', { code: 'GL_CONTEXT_LOST', message: 'WebGL baglami kisa surede tekrar tekrar kayboluyor (GPU bellegi yetersiz olabilir - model cok buyuk).' });
        return;
      }
      post('log', { message: 'WebGL context kayboldu, geri gelmesi bekleniyor' });
      glLostTimer = setTimeout(function () {
        glLostTimer = null;
        post('error', { code: 'GL_CONTEXT_LOST', message: 'WebGL baglami geri gelmedi (GPU bellegi yetersiz olabilir - model cok buyuk).' });
      }, GL_RESTORE_GRACE_MS);
    });
    canvas.addEventListener('webglcontextrestored', function () {
      if (glLostTimer) { clearTimeout(glLostTimer); glLostTimer = null; }
      post('log', { message: 'WebGL context geri geldi' });
      warmup(1500);
    });

    resize();
    animate();
    post('ready', { ua: navigator.userAgent });
  }

  function makeEnv() {
    return {
      get renderer() { return renderer; },
      get scene() { return scene; },
      get camera() { return camera; },
      get model() { return model; },
      get dom() { return canvas; },
      requestRender: function () { needsRender = true; },
      forEachMaterial: forEachMaterial,
      pick: pick,
      pickAlongRay: pickAlongRay,
      toScreen: toScreen,
      pixelWorldScale: pixelWorldScale
    };
  }

  /** Model malzemeleri + secim vurgusu. Vurgu da dahil edilmezse kesit
   *  uygulandiginda secili eleman kesilmeden cizilmeye devam eder. */
  function forEachMaterial(fn) {
    if (model) {
      for (var i = 0; i < model.groups.length; i++) fn(model.groups[i].mesh.material);
    }
    if (selectionMesh && selectionMesh.userData.highlightMaterial) {
      fn(selectionMesh.userData.highlightMaterial);
    }
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    computeLayout();
    positionMinimapFrame();
    needsRender = true;
  }

  /** 3B (mainRect) ve plan (planRect) viewport dikdortgenlerini, split
   *  modu/yon/ayirici konumuna gore yeniden hesaplar; DOM dokunma
   *  katmanlarini (#planPane, #planDivider) da ayni dikdortgenlere tasir.
   *  splitMode kapaliysa 3B viewport tam ekrandir. splitMode ACIKKEN yurume
   *  moduna gecilse BILE plan panosu gorunur kalir (kullanici plani gorerek
   *  yururken nerede oldugunu takip edebilsin diye) - walk.active burada
   *  ARTIK bir istisna degil. */
  function computeLayout() {
    var w = window.innerWidth, h = window.innerHeight;
    var planEl = document.getElementById('planPane');
    var divEl = document.getElementById('planDivider');
    if (!splitMode) {
      mainRect = { x: 0, y: 0, w: w, h: h };
      planRect.w = 0; planRect.h = 0;
      if (planEl) planEl.style.display = 'none';
      if (divEl) divEl.style.display = 'none';
      applyMainRectToCameras();
      return;
    }

    var planH = Math.round(SOS.util.clamp(h * planSplitFrac, h * PLAN_SPLIT_MIN, h * PLAN_SPLIT_MAX));
    planRect = { x: 0, y: 0, w: w, h: planH };
    mainRect = { x: 0, y: planH + DIVIDER_PX, w: w, h: Math.max(h - planH - DIVIDER_PX, 40) };

    if (planEl) {
      planEl.style.display = 'block';
      planEl.style.left = '0px'; planEl.style.top = '0px';
      planEl.style.width = w + 'px'; planEl.style.height = planH + 'px';
    }
    if (divEl) {
      divEl.style.display = 'block';
      divEl.style.left = '0px'; divEl.style.top = planH + 'px';
      divEl.style.width = w + 'px'; divEl.style.height = DIVIDER_PX + 'px';
    }
    applyMainRectToCameras();
  }

  /** perspCamera.aspect ve ortografik cerceveyi TAM EKRAN yerine mainRect'in
   *  (3B viewport) olcusune gore ayarlar - splitMode acikken goruntu bozulmasin diye. */
  function applyMainRectToCameras() {
    var aspect = mainRect.w / Math.max(mainRect.h, 1);
    perspCamera.aspect = aspect;
    perspCamera.updateProjectionMatrix();
    updateOrthoFrustum();
    needsRender = true;
  }

  function updateOrthoFrustum() {
    var aspect = mainRect.w / Math.max(mainRect.h, 1);
    // Ortografik cerceve modelin sinir kuresine gore sabitlenir; yakinlastirma
    // camera.zoom ile yapilir. Portre ekranda genislik dar kaldigi icin aspect'e bolunur.
    var half;
    if (model && !model.bbox.isEmpty()) {
      var r = model.bbox.getSize(new THREE.Vector3()).length() * 0.5;
      half = (aspect < 1 ? r / aspect : r) * 1.15;
    } else {
      half = controls ? controls.spherical.radius * 0.55 : 10;
    }
    orthoCamera.left = -half * aspect;
    orthoCamera.right = half * aspect;
    orthoCamera.top = half;
    orthoCamera.bottom = -half;
    orthoCamera.updateProjectionMatrix();
  }

  /* ---------------- Yardimcilar ---------------- */

  function toScreen(v) {
    var p = v.clone().project(camera);
    return {
      x: mainRect.x + (p.x * 0.5 + 0.5) * mainRect.w,
      y: mainRect.y + (-p.y * 0.5 + 0.5) * mainRect.h,
      z: p.z
    };
  }

  /** Verilen dunya noktasinda 1 pikselin dunya birimi karsiligi. */
  function pixelWorldScale() {
    var h = Math.max(mainRect.h, 1);
    if (camera.isOrthographicCamera) {
      var s = (camera.top - camera.bottom) / camera.zoom / h;
      return function () { return s; };
    }
    var k = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) / h;
    var camPos = camera.position;
    return function (pos) { return camPos.distanceTo(pos) * k; };
  }

  function activeClipPlanes() {
    var list = [];
    ['x', 'y', 'z'].forEach(function (a) { if (section.active[a]) list.push(section.planes[a]); });
    return list;
  }

  var raycaster = new THREE.Raycaster();
  var rayFromPoint = new THREE.Raycaster();

  function visibleMeshes() {
    var meshes = [];
    for (var i = 0; i < model.groups.length; i++) {
      if (model.groups[i].mesh.visible) meshes.push(model.groups[i].mesh);
    }
    return meshes;
  }

  /** hits (raycaster ciktisi) icinden kesit duzlemleriyle kirpilmamis ve
   *  gorunur (isolate/hide sonrasi da) ilk gecerli vurusu secer, expressID'yi
   *  ekler. excludeObject/excludeInstanceId verilirse o instance atlanir
   *  (ör. lazer'in normal yonundeki isini, dokundugu elemanin kendi diger
   *  yuzune hemen carpmasin diye). */
  function resolveHit(hits, excludeObject, excludeInstanceId) {
    if (!hits.length) return null;
    var planes = activeClipPlanes();
    for (var h = 0; h < hits.length; h++) {
      var hit = hits[h];
      var idx = hit.instanceId === undefined ? 0 : hit.instanceId;
      if (excludeObject && hit.object === excludeObject && idx === excludeInstanceId) continue;
      var clipped = false;
      for (var p = 0; p < planes.length; p++) {
        if (planes[p].distanceToPoint(hit.point) < 0) { clipped = true; break; }
      }
      if (clipped) continue;
      var g = model.groups[hit.object.userData.groupIndex];
      if (!g) continue;
      if (!g.visibleFlags[idx]) continue;
      hit.expressID = g.expressIDs[idx];
      return hit;
    }
    return null;
  }

  function pick(x, y) {
    if (!model) return null;
    var ndc = new THREE.Vector2(
      ((x - mainRect.x) / mainRect.w) * 2 - 1,
      -((y - mainRect.y) / mainRect.h) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    return resolveHit(raycaster.intersectObjects(visibleMeshes(), false));
  }

  /** Dunya uzayinda bir noktadan bir yon boyunca isin ("lazer") atar; ör.
   *  bir dosemenin ust yuzeyinden normal yonunde (yukari) atilan isin bir
   *  sonraki yuzeye (tavan) kadar olan mesafeyi bulmak icin - bkz.
   *  assets/viewer/js/tools.js MeasureTool._commitLaser. */
  function pickAlongRay(origin, direction, excludeObject, excludeInstanceId) {
    if (!model) return null;
    rayFromPoint.set(origin, direction.clone().normalize());
    rayFromPoint.near = 1e-4;
    return resolveHit(rayFromPoint.intersectObjects(visibleMeshes(), false), excludeObject, excludeInstanceId);
  }

  function handleTap(x, y) {
    // ViewCube once kontrol edilir
    var faceHit = cube.hitTest(x, y, mainRect);
    if (faceHit) {
      goToDirection(faceHit.dir, true);
      post('viewCube', { face: faceHit.key });
      return;
    }
    if (walkPicking) {
      // Yurume mod'u silahlandirilmadan ONCE baslamis bir dokunusun (parmak
      // zaten ekrandayken yurume butonuna basilmasi gibi) kalinti "tap"ini
      // yok say - yoksa yurume, kullanicinin hic dokunmadigi rastgele bir
      // noktada baslar.
      if (controls._downTime < walkArmedAt) return;
      var walkHit = pick(x, y);
      if (walkHit) {
        walkPicking = false;
        // Tiklanan yuzey cati/ust duvar gibi yuksek bir nokta olabilir; asagiya
        // ikinci bir isinla gercek tabani ara (bkz. planTap ayni mantik icin).
        var walkDown = pickAlongRay(walkHit.point, new THREE.Vector3(0, -1, 0), walkHit.object, walkHit.instanceId);
        var walkFloorY = walkDown ? walkDown.point.y : walkHit.point.y;
        enterWalkthroughAtPoint(new THREE.Vector3(walkHit.point.x, walkFloorY, walkHit.point.z));
        post('walkStarted', {});
      }
      return;
    }
    if (measure.mode !== 'none') {
      measure.tap(x, y);
      return;
    }
    var hit = pick(x, y);
    if (!hit) { clearSelection(); post('selection', null); return; }
    selectElement(hit.expressID, false, x, y);
  }

  /* ---------------- Olcumde surukleme ile capraz-imlec ---------------- */

  /** Capraz-imleci parmagin bir miktar ustunde konumlandirir ve o noktadaki
   *  kose/kenar yakalama adayini onizler (yakalanmissa vurgulu gosterilir). */
  function crosshairShow(x, y) {
    var cy = y - CROSSHAIR_LIFT;
    var snapped = false;

    if (chEditRef) {
      // Var olan bir olcum ucu suruklenerek tasiniyor: nokta dogrudan yeni
      // konuma (koseye/kenara yakalanarak) tasinir ve olcum aninda yeniden
      // cizilir - o ucun kendisi zaten gorsel geri bildirim oldugu icin ayrica
      // mavi yakalama noktasina gerek yok.
      var cand0 = measure.updateEditPoint(x, cy);
      snapped = !!(cand0 && cand0.snapped);
      if (measure.snapDot) measure.snapDot.style.display = 'none';
    } else {
      var hit = pick(x, cy);
      // Lazer disindaki modlarda (distance/angle) en yakin kose/kenar-orta
      // adayi surukleme SIRASINDA da onizlenir (mavi nokta) - onceden bu sadece
      // parmak kaldirildiginda SESSIZCE uygulaniyordu, kullanici nereye
      // "kilitleneceğini" goremiyordu.
      if (hit && measure.mode !== 'laser') {
        var cand = measure._snapCandidate(hit);
        snapped = cand.snapped;
        if (cand.point && measure.snapDot) {
          var s = toScreen(cand.point);
          measure.snapDot.style.display = 'block';
          measure.snapDot.style.left = s.x + 'px';
          measure.snapDot.style.top = s.y + 'px';
        }
        measure.previewTo(cand.point);
      } else {
        if (measure.snapDot) measure.snapDot.style.display = 'none';
        measure.previewTo(null);
      }
    }

    crosshairEl.style.left = x + 'px';
    crosshairEl.style.top = cy + 'px';
    crosshairEl.style.display = 'block';
    crosshairEl.classList.toggle('snapped', snapped);
    crosshairEl.dataset.x = x;
    crosshairEl.dataset.y = cy;
    needsRender = true;
  }

  function crosshairEnd(e, cancelled) {
    if (!chPress || chPress.id !== e.pointerId) return;
    if (chActive && chEditRef) {
      if (cancelled) measure.cancelEditPoint();
      else measure.endEditPoint();
    } else if (chActive && !cancelled) {
      measure.tap(parseFloat(crosshairEl.dataset.x), parseFloat(crosshairEl.dataset.y));
    }
    if (chActive) {
      crosshairEl.style.display = 'none';
      if (measure.snapDot) measure.snapDot.style.display = 'none';
      controls.enabled = true;
      chActive = false;
    }
    chPress = null;
    chEditRef = null;
  }

  /* ---------------- Secim ---------------- */

  function clearSelection() {
    if (selectionMesh) {
      scene.remove(selectionMesh);
      selectionMesh.geometry = null;
      selectionMesh.material.dispose();
      selectionMesh = null;
    }
    selectedId = null;
    needsRender = true;
  }

  var SELECTION_BASE_OPACITY = 0.55;
  var SELECTION_PULSE_MS = 2200;

  function highlight(expressID, pulse) {
    clearSelection();
    if (!model) return;
    var refs = model.elementIndex.get(expressID);
    if (!refs || !refs.length) return;

    var group = new THREE.Group();
    var planes = activeClipPlanes();
    var mat = new THREE.MeshBasicMaterial({
      color: 0x4C6FE0, transparent: true, opacity: SELECTION_BASE_OPACITY,
      depthTest: false, side: THREE.DoubleSide,
      clippingPlanes: planes.length ? planes : null
    });
    var m = new THREE.Matrix4();
    for (var i = 0; i < refs.length; i++) {
      var g = model.groups[refs[i].g];
      if (!g || !g.visibleFlags[refs[i].i]) continue;
      g.mesh.getMatrixAt(refs[i].i, m);
      var mesh = new THREE.Mesh(g.mesh.geometry, mat);
      mesh.applyMatrix4(new THREE.Matrix4().multiplyMatrices(g.mesh.matrixWorld, m));
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 998;
      group.add(mesh);
    }
    group.userData.highlightMaterial = mat;
    if (pulse) group.userData.pulseStart = performance.now();
    selectionMesh = group;
    selectionMesh.material = mat;
    scene.add(group);
    selectedId = expressID;
    needsRender = true;
  }

  /** Arama sonucu gibi dogrudan (dokunmadan) yapilan secimlerde, kullaniciyi
   *  modelde gozle bulmasi kolaylassin diye vurgu birkac saniye "nabiz gibi"
   *  atar (opacity sinuzoidal olarak degisir); normal dokunmali secimde
   *  eleman zaten parmagin altinda oldugu icin bu gerekmez. */
  function updateSelectionPulse(now) {
    if (!selectionMesh || !selectionMesh.userData.pulseStart) return;
    var elapsed = now - selectionMesh.userData.pulseStart;
    if (elapsed >= SELECTION_PULSE_MS) {
      selectionMesh.userData.highlightMaterial.opacity = SELECTION_BASE_OPACITY;
      selectionMesh.userData.pulseStart = 0;
      return;
    }
    var wave = (Math.sin(elapsed / 130) + 1) / 2; // 0..1
    selectionMesh.userData.highlightMaterial.opacity = SELECTION_BASE_OPACITY * (0.45 + 0.55 * wave);
    needsRender = true;
  }

  function selectElement(expressID, focus, tapX, tapY, pulse) {
    highlight(expressID, pulse);
    var props = null;
    try { props = model.getProperties(expressID); }
    catch (e) { post('error', { code: 'PROPS_FAILED', message: String(e && e.message || e) }); }
    if (focus) focusOn(expressID);
    if (props && tapX !== undefined) { props.tapX = tapX; props.tapY = tapY; }
    post('selection', props);
  }

  function focusOn(expressID) {
    var dims = model.getDimensions(expressID);
    if (!dims) return;
    var center = new THREE.Vector3().fromArray(dims.center);
    var radius = Math.max(dims.x, dims.y, dims.z) / model._lengthScaleToMm * 0.5 || 1;
    controls.target.copy(center);
    controls.spherical.radius = Math.max(radius * 4, 1.5);
    updateOrthoFrustum();
    needsRender = true;
  }

  /** Kat planinda tiklanan (veya RN'den gelen) rastgele bir dunya noktasina
   *  kamerayi ceker - focusOn'un elemana degil, serbest noktaya odaklanan
   *  hali. Radius modelin genel olcegine gore makul bir "yakinlik" secer. */
  function flyToPoint(x, y, z) {
    if (!model) return;
    controls.target.set(x, y, z);
    var span = model.bbox.getSize(new THREE.Vector3()).length() || 10;
    controls.spherical.radius = Math.max(span * 0.05, (controls.minDistance || 0.01) * 4);
    updateOrthoFrustum();
    needsRender = true;
  }

  /* ---------------- Kamera ---------------- */

  function fit(padding, targetBox) {
    if (!model || model.bbox.isEmpty()) return;
    var box = (targetBox && !targetBox.isEmpty()) ? targetBox : model.bbox;
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var radius = size.length() * 0.5 || 1;

    // Mevcut bakis yonunun kamera eksenleri
    var forward = new THREE.Vector3().setFromSpherical(controls.spherical).normalize();
    var worldUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(forward.dot(worldUp)) > 0.999) worldUp.set(0, 0, 1);
    var right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
    var up = new THREE.Vector3().crossVectors(forward, right).normalize();

    // Sinir kutusunun 8 kosesini kamera duzlemine izdusur -> sikica cercevele
    var halfW = 0, halfH = 0, halfD = 0;
    var corner = new THREE.Vector3();
    for (var i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      ).sub(center);
      halfW = Math.max(halfW, Math.abs(corner.dot(right)));
      halfH = Math.max(halfH, Math.abs(corner.dot(up)));
      halfD = Math.max(halfD, Math.abs(corner.dot(forward)));
    }

    // Portre ekranda yatay FOV dikeyden cok daha dardir; ikisi de saglanmali
    var fovV = perspCamera.fov * Math.PI / 180;
    var fovH = 2 * Math.atan(Math.tan(fovV / 2) * perspCamera.aspect);
    var dist = Math.max(
      halfH / Math.tan(fovV / 2),
      halfW / Math.tan(fovH / 2)
    ) * (padding || 1.1) + halfD;

    controls.target.copy(center);
    controls.spherical.radius = dist;
    controls.minDistance = radius * 0.0003;
    controls.maxDistance = radius * 60;
    perspCamera.near = Math.max(radius * 0.0001, 0.003);
    perspCamera.far = radius * 200;
    perspCamera.updateProjectionMatrix();
    orthoCamera.near = -radius * 200;
    orthoCamera.far = radius * 200;
    orthoCamera.zoom = 1;
    updateOrthoFrustum();
    needsRender = true;
  }

  function setProjection(mode) {
    var wasOrtho = camera.isOrthographicCamera;
    var isOrtho = mode === 'orthographic';
    if (wasOrtho === isOrtho) return;
    camera = isOrtho ? orthoCamera : perspCamera;
    if (isOrtho) { orthoCamera.zoom = 1; updateOrthoFrustum(); }
    controls.camera = camera;
    warmup(800);
    post('projection', { mode: isOrtho ? 'orthographic' : 'perspective' });
  }

  /** ViewCube yuzeyine gecis: ortografik + eksen hizali. */
  function goToDirection(dir, ortho) {
    var d = controls.spherical.radius;
    controls.setDirection(dir, d);
    if (ortho) setProjection('orthographic');
    needsRender = true;
  }

  /* ---------------- Yurume (walkthrough) modu ---------------- */

  function walkEyeHeightWorld() {
    var mmPerUnit = (model && model._lengthScaleToMm) || 1000;
    return 1750 / mmPerUnit; // 1.75m insan goz yuksekligi, dunya birimine cevrilir
  }

  /** Tiklanan noktada (herhangi bir yuzeyde) yurumeye baslar - mahal/IFCSPACE
   *  verisine bagimli degildir, boylece bu veriyi icermeyen IFC dosyalarinda
   *  da calisir. */
  function enterWalkthroughAtPoint(point) {
    if (!model) return;
    walk.position.set(point.x, point.y + walkEyeHeightWorld(), point.z);
    walk.yaw = controls.spherical.theta;
    walk.pitch = 0;
    walk.moveX = 0; walk.moveY = 0; walk.lookX = 0; walk.lookY = 0;
    walk.vy = 0; walk.falling = false;
    clearSelection();
    post('selection', null);
    setProjection('perspective');
    camera = perspCamera;
    controls.camera = camera;
    controls.enabled = false;
    walk.active = true;
    updateWalkFov();
    setMinimapFrameVisible(true);
    computeLayout(); // mainRect (perspCamera aspect) yurume icin yeniden hesaplanir - splitMode aciksa plan gorunur kalir
    needsRender = true;
  }

  function exitWalkthrough() {
    if (!walk.active) return;
    walk.active = false;
    controls.enabled = true;
    if (perspCamera) {
      perspCamera.fov = 55;
      perspCamera.updateProjectionMatrix();
    }
    setMinimapFrameVisible(false);
    computeLayout();
    fit(1.12);
  }

  /** Yurunen noktanin XZ konumunda, AYAKLARIN (goz degil) bir miktar ustunden
   *  asagi dogru isin atarak altindaki en yakin yuzeyi bulur - merdiven/kot
   *  farki olan yerlerde goz yuksekligini o yuzeye gore otomatik ayarlamak
   *  icindir. Bulunamazsa (bosluk/veri disi alan) null doner ve mevcut
   *  yukseklik korunur.
   *  NOT: probe orijini onceden GOZ yuksekliginden (~1.75m) baslayip 1m daha
   *  yukari cikiyordu (~2.75m) - alcak tavanli/dar katli modellerde bu, ust
   *  katin doseme plakasinin ICINE denk gelip isinin oradan asagi baslamasina
   *  ve "aniden ust kata/catiya zipliyor" hatasina yol aciyordu. Ayaklarin
   *  hemen ustunden (WALK_GROUND_PROBE_UP_M kadar - normal bir basamak
   *  yuksekligini karsilayacak kadar kucuk) baslamak bu sorunu ortadan
   *  kaldirir; tavan/ust kat asla bu araligin icine girmez. */
  function walkGroundY(x, z, mmPerUnit) {
    var toUnit = function (m) { return (m * 1000) / mmPerUnit; };
    var feetY = walk.position.y - walkEyeHeightWorld();
    var origin = new THREE.Vector3(x, feetY + toUnit(WALK_GROUND_PROBE_UP_M), z);
    var hit = pickAlongRay(origin, new THREE.Vector3(0, -1, 0));
    if (!hit) return null;
    var dist = origin.y - hit.point.y;
    if (dist > toUnit(WALK_GROUND_PROBE_UP_M + WALK_GROUND_PROBE_DOWN_M)) return null;
    return hit.point.y;
  }

  /** Ayaklarin GERCEK altindaki yuzeyi (WALK_GROUND_PROBE_* penceresiyle
   *  sinirlanmadan) arar - dusme sirasinda "nihayet zemine indik mi" testi
   *  icindir. Bulunamazsa null doner. */
  function walkFallLandingY(x, z, feetY) {
    var hit = pickAlongRay(new THREE.Vector3(x, feetY + 1e-3, z), new THREE.Vector3(0, -1, 0));
    return hit ? hit.point.y : null;
  }

  /** Yercekimi/dusme: her karede (hareket joystick'i birakili olsa BILE -
   *  oyuncu bir bosluga girip dururken de dusmeli) calisir. Once kucuk kot
   *  farklari icin "basamak takibi" denenir (walkGroundY, mevcut basamak/
   *  merdiven davranisi - aninda yapisir). Bulunamazsa (buyuk bosluk/uctan
   *  dusme) ivmelenerek dusme baslar; asagida gercek bir zemine ulasilinca
   *  hiz sifirlanip oraya oturulur. Model disina dusulurse sonsuza kadar
   *  dusmesin diye modelin en alt noktasinin biraz altinda hayali bir
   *  "taban" varsayilir. */
  function applyWalkGravity(dt, mmPerUnit) {
    var toUnit = function (m) { return (m * 1000) / mmPerUnit; };
    var feetY = walk.position.y - walkEyeHeightWorld();

    var stepGround = walkGroundY(walk.position.x, walk.position.z, mmPerUnit);
    if (stepGround !== null) {
      walk.position.y = stepGround + walkEyeHeightWorld();
      walk.vy = 0;
      walk.falling = false;
      return;
    }

    walk.vy = Math.min(walk.vy + WALK_GRAVITY_MPS2 * dt, WALK_TERMINAL_MPS);
    var newFeetY = feetY - toUnit(walk.vy * dt);

    var landingY = walkFallLandingY(walk.position.x, walk.position.z, feetY);
    var fallFloorY = model && !model.bbox.isEmpty()
      ? model.bbox.min.y - toUnit(WALK_FALL_FLOOR_MARGIN_M)
      : newFeetY;
    if (landingY === null || landingY < fallFloorY) landingY = fallFloorY;

    if (newFeetY <= landingY) {
      walk.position.y = landingY + walkEyeHeightWorld();
      walk.vy = 0;
      walk.falling = false;
    } else {
      walk.position.y = newFeetY + walkEyeHeightWorld();
      walk.falling = true;
    }
  }

  function updateWalk(dtMs) {
    var dt = Math.min(dtMs, 100) / 1000;
    var moved = Math.abs(walk.moveX) > 0.02 || Math.abs(walk.moveY) > 0.02;
    var looked = Math.abs(walk.lookX) > 0.02 || Math.abs(walk.lookY) > 0.02;

    if (looked) {
      walk.yaw -= walk.lookX * WALK_LOOK_RATE * dt;
      walk.pitch = SOS.util.clamp(walk.pitch - walk.lookY * WALK_LOOK_RATE * dt, -1.4, 1.4);
    }

    var mmPerUnit = (model && model._lengthScaleToMm) || 1000;
    if (moved) {
      var mps = WALK_MOVE_MPS * walk.speed * (1000 / mmPerUnit);
      var forward = new THREE.Vector3(Math.sin(walk.yaw), 0, Math.cos(walk.yaw));
      // NOT: kamera-sagi = forward x up (Y-up, sag-elli sistem). Onceki
      // (forward.z, 0, -forward.x) bunun TERSIYDI (aslinda sol yon) - bu yuzden
      // hareket joystick'ini saga cekmek karakteri sola kaydiriyordu.
      var right = new THREE.Vector3(-forward.z, 0, forward.x);
      walk.position.addScaledVector(forward, -walk.moveY * mps * dt);
      walk.position.addScaledVector(right, walk.moveX * mps * dt);
    }

    // Dusey takip + yercekimi: hareket etmese bile (bosluk uzerinde durunca
    // da dussun diye) her karede calisir.
    applyWalkGravity(dt, mmPerUnit);

    camera.position.copy(walk.position);
    var lookDir = new THREE.Vector3(
      Math.sin(walk.yaw) * Math.cos(walk.pitch),
      Math.sin(walk.pitch),
      Math.cos(walk.yaw) * Math.cos(walk.pitch)
    );
    walk.lookTarget.copy(walk.position).add(lookDir);
    camera.lookAt(walk.lookTarget);
    return moved || looked || walk.falling;
  }

  /* ---------------- Yurume modu mini haritasi ---------------- */

  // NOT: bu degerler src/components/WalkthroughOverlay.js'deki joystick
  // geometrisiyle (SIZE, bottomRow paddingHorizontal/paddingBottom) BIREBIR
  // AYNI olmali - minimap'i iki joystick arasindaki bosluga tam oturtmak icin
  // buradan (RN native tarafindan erisilemeyen WebView) o yerlesimi yeniden
  // hesapliyoruz. Biri degisirse digeri de guncellenmeli.
  var JOY_SIZE_CSS = 118;
  var JOY_PAD_H_CSS = 24;      // bottomRow paddingHorizontal
  var JOY_PAD_BOTTOM_CSS = 76; // bottomRow paddingBottom
  var MINIMAP_GAP_CSS = 8;     // minimap KARTI ile her bir joystick arasinda birakilacak bosluk
  var MINIMAP_PAD_CSS = 7;     // kartin cercevesi (border) kalinligi - index.html'deki .frame border'iyla AYNI olmali
  var MINIMAP_MIN_CSS = 40;    // GL icerigi bu genislikten kucuk kalacaksa minimap tamamen gizlenir
  var MINIMAP_MAX_CSS = 108;   // GL icerigi (cerceve haric) icin ust sinir

  var safeBottomCss = 0;       // RN guvenli alan (home indicator vb.) - 'layout' komutuyla gelir
  var minimapSizeCss = 0;      // GL viewport'unun (harita icerigi) kare boyutu - CERCEVE HARIC
  var minimapMarginCss = 0;    // GL viewport'un ekran altindan uzakligi - CERCEVE HARIC

  /** Minimap kartinin (cerceve + icindeki GL harita karesi) boyutunu/konumunu,
   *  iki joystick arasindaki GERCEK bosluga (ekran genisligi + guvenli alan)
   *  gore her seferinde yeniden hesaplar - boylece dar telefonlarda
   *  joystick'lerle cakismaz, genis telefonlarda da asiri kucuk kalmaz.
   *  Kart, GL karesinden MINIMAP_PAD_CSS kadar daha genis/yuksek tutulur ki
   *  harita icerigi cercevenin TAM ICINE sigsin, kenara/kenardan tasmasin. */
  function positionMinimapFrame() {
    var gap = window.innerWidth - 2 * (JOY_PAD_H_CSS + JOY_SIZE_CSS);
    var size = SOS.util.clamp(gap - 2 * MINIMAP_GAP_CSS - 2 * MINIMAP_PAD_CSS, 0, MINIMAP_MAX_CSS);
    minimapSizeCss = size;
    var joyCenterFromBottom = safeBottomCss + JOY_PAD_BOTTOM_CSS + JOY_SIZE_CSS / 2;
    minimapMarginCss = Math.max(0, joyCenterFromBottom - size / 2);

    var el = document.getElementById('minimap');
    if (!el) return;
    if (size < MINIMAP_MIN_CSS) { el.style.display = 'none'; return; }
    var cardSize = size + 2 * MINIMAP_PAD_CSS;
    el.style.width = cardSize + 'px';
    el.style.height = cardSize + 'px';
    el.style.marginLeft = (-cardSize / 2) + 'px';
    el.style.bottom = (minimapMarginCss - MINIMAP_PAD_CSS) + 'px';
    if (walk.active) el.style.display = 'block';
  }

  function setupMinimap() {
    minimapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    minimapCam.up.set(0, 0, -1); // kuzey-yukari sabit (oyuncu donse de harita donmez)
    minimapCam.layers.enable(MINIMAP_LAYER);

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 1,        // ucu ("ileri" yon, +Z)
      -0.55, 0, -0.65,
      0.55, 0, -0.65
    ], 3));
    geo.setIndex([0, 1, 2]);
    var mat = new THREE.MeshBasicMaterial({ color: 0xFF5A36, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    minimapMarker = new THREE.Mesh(geo, mat);
    minimapMarker.renderOrder = 9999;
    minimapMarker.layers.set(MINIMAP_LAYER);
    minimapMarker.frustumCulled = false;
    scene.add(minimapMarker);
  }

  function setMinimapFrameVisible(visible) {
    if (visible) { positionMinimapFrame(); return; }
    var el = document.getElementById('minimap');
    if (el) el.style.display = 'none';
  }

  /* ---------------- Bolunmus ekran: kat plani panosu (ustte) ---------------- */

  /** Plan panosunun DOM dokunma alanini (#planPane) olusturur; tek parmak
   *  suruklemeyi PAN, iki parmagi PINCH-ZOOM, hareketsiz hizli dokunusu ise
   *  "3B'ye isinlan" (flyToPoint) olarak yorumlar. Panonun GORSEL icerigi ayni
   *  <canvas>'a renderPlanPane() ile scissor/viewport'la cizilir; bu div
   *  sadece o bolgedeki dokunuslari yakalayip TouchControls'un (orbit)
   *  canvas'taki dinleyicilerine ulasmasini engellemek icin uzerine binen
   *  SEFFAF bir katmandir. */
  /** Duz (Y=0 duzleminde, +Z = "ileri") bir yelpaze/pasta-dilimi geometrisi -
   *  plan panosundaki "bakis yonu" konisini cizmek icin. Tepe noktasi
   *  origin'de; acisi disinda kalir. */
  function makeConeFanGeometry(halfAngleRad, segments, radius) {
    var positions = [0, 0, 0];
    for (var i = 0; i <= segments; i++) {
      var a = -halfAngleRad + (2 * halfAngleRad) * (i / segments);
      positions.push(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    }
    var indices = [];
    for (var i = 1; i <= segments; i++) indices.push(0, i, i + 1);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }

  function setupPlanPane() {
    planCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1e6);
    planCam.up.set(0, 0, -1); // kuzey-yukari sabit
    // .set() (enable DEGIL): planCam SADECE PLAN_LAYER'i gorur, varsayilan
    // katmandaki (0) duz-dolgulu model meshleri planCam'a HIC girmez - "pafta"
    // gorunumu icin bunlarin yerine planEdgesMesh (asagida) cizilir.
    planCam.layers.set(PLAN_LAYER);

    // Binanin "pafta" cizgileri: her instance icin EdgesGeometry (sadece
    // siluet/kirisim kenarlari - ic ucgenlestirme capraz cizgileri HARIC)
    // dunya uzayina donusturulup TEK bir LineSegments'ta birlestirilir - bkz.
    // rebuildPlanEdgesGeometry(). Boylece InstancedMesh'in normal tel-kafes
    // modunda gorulen "gereksiz capraz cizgiler" ortadan kalkar.
    var planEdgesMat = new THREE.LineBasicMaterial({
      color: 0xAFE0FF, transparent: true, opacity: 0.92
    });
    planEdgesMesh = new THREE.LineSegments(new THREE.BufferGeometry(), planEdgesMat);
    planEdgesMesh.layers.set(PLAN_LAYER);
    planEdgesMesh.frustumCulled = false;
    planEdgesMesh.visible = false;
    scene.add(planEdgesMesh);

    // "Sen buradasin" isaretcisi: merkezde bir nokta + one dogru acilan
    // yari-saydam bir bakis-yonu konisi (dolgu + net kenar cizgisi) - 3B
    // kameranin o an nereye ve HANGI YONE baktigini plan uzerinde gosterir.
    planMarker = new THREE.Group();
    planMarker.renderOrder = 9999;
    planMarker.visible = false;

    var dotMat = new THREE.MeshBasicMaterial({
      color: 0x4C6FE0, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.95, side: THREE.DoubleSide
    });
    var dot = new THREE.Mesh(new THREE.CircleGeometry(1, 24), dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.layers.set(PLAN_LAYER);
    dot.frustumCulled = false;
    planMarker.add(dot);

    var coneGeo = makeConeFanGeometry(THREE.MathUtils.degToRad(34), 20, 3.4);
    var coneFillMat = new THREE.MeshBasicMaterial({
      color: 0x4C6FE0, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.28, side: THREE.DoubleSide
    });
    var coneFill = new THREE.Mesh(coneGeo, coneFillMat);
    coneFill.layers.set(PLAN_LAYER);
    coneFill.frustumCulled = false;
    planMarker.add(coneFill);

    var coneEdgeMat = new THREE.LineBasicMaterial({
      color: 0xBFD4FF, depthTest: false, transparent: true, opacity: 0.95
    });
    var coneEdge = new THREE.LineSegments(new THREE.EdgesGeometry(coneGeo), coneEdgeMat);
    coneEdge.layers.set(PLAN_LAYER);
    coneEdge.frustumCulled = false;
    planMarker.add(coneEdge);

    scene.add(planMarker);

    var el = document.getElementById('planPane');
    if (!el) return;
    var DRAG_PX = 10;
    var TAP_MS = 350;
    // Iki parmakla baslayan bir jest, ilk belirgin harekete kadar "kararsiz"dir:
    // parmaklar birbirinden uzaklasip/yaklasiyorsa PINCH-ZOOM, aralarindaki
    // mesafe sabit kalip ikisi BIRLIKTE dikey kayiyorsa KAT GECISI sayilir.
    // Boylece tek elle yakinlastirma ile iki parmakla kat degistirme ayni
    // dokunma alaninda cakismadan bir arada calisir.
    var FLOOR_SWIPE_LOCK_PX = 16; // bu kadar hareketten sonra jest turu kilitlenir
    var FLOOR_SWIPE_STEP_PX = 70; // bu kadar ek dikey kaydirma = bir kat daha
    var pointers = [];   // {id, x, y}
    var press = null;    // {x, y, moved, t} - tek parmakla baslayan basinc (tap/pan ayrimi)
    var pinchDist0 = 0;
    var zoom0 = 1;
    var pinchCY0 = 0;      // iki parmagin baslangictaki dikey ortalamasi
    var twoFingerMode = null; // null (henuz belirsiz) | 'pinch' | 'floor'

    function idx(id) { for (var i = 0; i < pointers.length; i++) if (pointers[i].id === id) return i; return -1; }
    function dist() { var a = pointers[0], b = pointers[1]; return Math.hypot(a.x - b.x, a.y - b.y); }
    function centerY() { return (pointers[0].y + pointers[1].y) / 2; }

    el.addEventListener('pointerdown', function (e) {
      pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (pointers.length === 1) {
        press = { x: e.clientX, y: e.clientY, moved: false, t: Date.now() };
      } else if (pointers.length === 2) {
        press = null; // ikinci parmak: tap adayi iptal, pinch/kat-gecisi basliyor
        pinchDist0 = dist();
        zoom0 = planZoom;
        pinchCY0 = centerY();
        twoFingerMode = null;
      }
    });
    el.addEventListener('pointermove', function (e) {
      var i = idx(e.pointerId);
      if (i < 0) return;
      var prev = { x: pointers[i].x, y: pointers[i].y };
      pointers[i].x = e.clientX; pointers[i].y = e.clientY;

      if (pointers.length === 1) {
        var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) press.moved = true;
        if (!press || press.moved) planPanByPixels(dx, dy);
      } else if (pointers.length === 2) {
        var d = dist();
        var cy = centerY();
        var distDelta = pinchDist0 > 0 ? Math.abs(d - pinchDist0) : 0;
        var cyDelta = Math.abs(cy - pinchCY0);
        if (!twoFingerMode) {
          if (Math.max(distDelta, cyDelta) < FLOOR_SWIPE_LOCK_PX) return; // henuz kilitlenmedi
          twoFingerMode = (distDelta >= cyDelta) ? 'pinch' : 'floor';
        }
        if (twoFingerMode === 'pinch') {
          if (pinchDist0 > 0) {
            planZoom = SOS.util.clamp(zoom0 * (d / pinchDist0), 0.2, 25);
            needsRender = true;
          }
        } else { // 'floor'
          var dy = cy - pinchCY0;
          if (dy <= -FLOOR_SWIPE_STEP_PX) { switchStorey(1); pinchCY0 = cy; }
          else if (dy >= FLOOR_SWIPE_STEP_PX) { switchStorey(-1); pinchCY0 = cy; }
        }
      }
    });
    el.addEventListener('pointerup', function (e) {
      var wasTap = pointers.length === 1 && press && !press.moved && (Date.now() - press.t) < TAP_MS;
      var i = idx(e.pointerId);
      if (i >= 0) pointers.splice(i, 1);
      if (wasTap) planTap(e.clientX, e.clientY);
      if (pointers.length < 2) { pinchDist0 = 0; twoFingerMode = null; }
      if (pointers.length === 0) press = null;
    });
    el.addEventListener('pointercancel', function (e) {
      var i = idx(e.pointerId);
      if (i >= 0) pointers.splice(i, 1);
      press = null; pinchDist0 = 0; twoFingerMode = null;
    });
  }

  /** Suruklenebilir ayirici (#planDivider): dikey surukleme plan panosunun
   *  ekran yuksekligindeki payini (planSplitFrac) degistirir. Surukleme
   *  sirasinda '.dragging' sinifi eklenir (bkz. index.html - tutamac buyur/
   *  vurgulanir, tutuldugu belli olsun diye). */
  function setupPlanDivider() {
    var el = document.getElementById('planDivider');
    if (!el) return;
    var dragging = false;
    var startY = 0, startFrac = 0;
    el.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; startFrac = planSplitFrac;
      el.classList.add('dragging');
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var h = window.innerHeight;
      planSplitFrac = SOS.util.clamp(startFrac + (e.clientY - startY) / h, PLAN_SPLIT_MIN, PLAN_SPLIT_MAX);
      computeLayout();
    });
    function end() { dragging = false; el.classList.remove('dragging'); }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Uygulamanin (RN tarafinin) tema renklerini ayiriciya uygular - bkz.
   *  on('setTheme'). WebView'in kendi CSS renkleri sadece ilk boyama/geri
   *  dususu icindir; asil renkler RN'den gelir ki acik/koyu temada ve marka
   *  rengiyle tutarli görünsün. */
  function styleDivider(surfaceHex, accentHex, borderHex) {
    var el = document.getElementById('planDivider');
    if (!el) return;
    var handle = el.querySelector('.handle');
    if (surfaceHex) el.style.background = surfaceHex;
    if (borderHex) { el.style.borderTopColor = borderHex; el.style.borderBottomColor = borderHex; }
    if (handle && accentHex) handle.style.background = accentHex;
  }

  /** Ekran piksel-farkini (surukleme) plan panosunun dunya-birimi ek
   *  ofsetine (planPan) cevirir - kaydirarak (pan) gezinme. Isaretler,
   *  TouchControls._pan ile ayni "icerik parmagi takip eder" kuralini
   *  kullanir. */
  function planPanByPixels(dxPx, dyPx) {
    if (!planViewState || planRect.h < 10) return;
    var worldPerPxX = (2 * planViewState.halfW) / planRect.w;
    var worldPerPxY = (2 * planViewState.halfH) / planRect.h;
    planPan.x -= dxPx * worldPerPxX;
    planPan.z -= dyPx * worldPerPxY;
    needsRender = true;
  }

  // IFC dosyalarinda (ozellikle Revit disa aktariminda) bir elemanin
  // IFCRELCONTAINEDINSPATIALSTRUCTURE iliskisi yanlislikla baska bir kata
  // (ör. bir temel padi "Level 2"ye) atanmis olabilir. Byle bir "aykiri"
  // eleman kat kutusuna dahil edilirse box.min.y cok asagi cekilir ve buna
  // bagli hesaplanan kesit/kadraj o katin GERCEK elemanlarini tamamen disarida
  // birakip plani bombos gosterebilir. Bu yuzden kat kutusu, IFCBUILDINGSTOREY
  // Elevation degerinden cok asagida kalan elemanlari (toleransla) disler.
  var STOREY_OUTLIER_TOLERANCE_M = 0.75;

  /** Bir katin elemanlarinin sinir kutusunu, o katin Elevation degerine gore
   *  aykiri (yanlis atanmis) elemanlari disleyerek hesaplar. Elevation verisi
   *  yoksa (bazi IFC dosyalarinda olmayabilir) filtre uygulanmaz. */
  function storeyBoxFromIds(ids, storeyId) {
    if (!ids || !ids.length) return null;
    var elev = model.storeyElevations && model.storeyElevations.get(storeyId);
    var hasElev = typeof elev === 'number' && isFinite(elev);
    var box = new THREE.Box3();
    var included = 0;
    for (var i = 0; i < ids.length; i++) {
      var b = model.getElementBox(ids[i]);
      if (!b) continue;
      if (hasElev && b.min.y < elev - STOREY_OUTLIER_TOLERANCE_M) continue;
      box.union(b);
      included++;
    }
    if (included && !box.isEmpty()) return box;
    // Filtre her seyi eledi (Elevation verisi guvenilmez olabilir) - guvenli
    // tarafta kal, filtresiz kutuya don.
    if (hasElev) {
      var raw = new THREE.Box3();
      for (var j = 0; j < ids.length; j++) {
        var rb = model.getElementBox(ids[j]);
        if (rb) raw.union(rb);
      }
      if (!raw.isEmpty()) return raw;
    }
    return null;
  }

  /** Plan panosunun cerceveleyecegi kutu: bir kat secilmisse (showStorey) o
   *  katin elemanlari, aksi halde tum modelin sinir kutusu. */
  function currentPlanBox() {
    if (!model || model.bbox.isEmpty()) return null;
    if (currentStoreyId != null && model.storeyElements) {
      var box = storeyBoxFromIds(model.storeyElements.get(currentStoreyId), currentStoreyId);
      if (box) return box;
    }
    return model.bbox;
  }

  var PLAN_CUT_HEIGHT_M = 1.2; // mimari pafta gelenegi: taban+~1.2m'de yatay kesit
  var planCutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  var PLAN_BG = 0x0B1622; // "pafta" hissi icin plan panosuna ozel koyu lacivert zemin

  /** Gorunur (isolate/hide sonrasi da) her instance icin, o instance'in baz
   *  geometrisinin EdgesGeometry'sini (SADECE siluet/kirisim kenarlari -
   *  komsu iki ucgenin yuz normali PLAN_EDGE_ANGLE_DEG'den AZ farkliysa o
   *  kenar atlanir; ör. duz bir duvar yuzeyini ikiye bolen ucgenlestirme
   *  capraz cizgisi boylece hic uretilmez) dunya uzayina tasiyip TEK bir
   *  LineSegments'ta (planEdgesMesh) birlestirir. Sadece floor/visibility
   *  degisince (planEdgesDirty) yeniden hesaplanir - her karede DEGIL. */
  function rebuildPlanEdgesGeometry() {
    planEdgesDirty = false;
    if (!model || !model.groups.length) {
      planEdgesMesh.geometry.dispose();
      planEdgesMesh.geometry = new THREE.BufferGeometry();
      planEdgesMesh.visible = false;
      return;
    }

    var edgesCache = new Map(); // base geometry -> edge pozisyon dizisi (Float32Array | null)
    var chunks = [];
    var totalLen = 0;
    var used = 0;
    var v = new THREE.Vector3();

    outer:
    for (var gi = 0; gi < model.groups.length; gi++) {
      var g = model.groups[gi];
      var mesh = g.mesh;
      var baseGeo = mesh.geometry;
      var edgePos = edgesCache.get(baseGeo);
      if (edgePos === undefined) {
        var eg = new THREE.EdgesGeometry(baseGeo, PLAN_EDGE_ANGLE_DEG);
        var posAttr = eg.getAttribute('position');
        edgePos = posAttr ? posAttr.array : null;
        eg.dispose();
        edgesCache.set(baseGeo, edgePos);
      }
      if (!edgePos || !edgePos.length) continue;

      var meshWorld = mesh.matrixWorld;
      for (var i = 0; i < g.expressIDs.length; i++) {
        if (!g.visibleFlags[i]) continue;
        if (used >= PLAN_EDGE_MAX_INSTANCES) break outer;
        used++;
        var world = new THREE.Matrix4().multiplyMatrices(meshWorld, g.base[i]);
        var out = new Float32Array(edgePos.length);
        for (var p = 0; p < edgePos.length; p += 3) {
          v.set(edgePos[p], edgePos[p + 1], edgePos[p + 2]).applyMatrix4(world);
          out[p] = v.x; out[p + 1] = v.y; out[p + 2] = v.z;
        }
        chunks.push(out);
        totalLen += out.length;
      }
    }

    planEdgesMesh.geometry.dispose();
    if (!chunks.length) {
      planEdgesMesh.geometry = new THREE.BufferGeometry();
      planEdgesMesh.visible = false;
      return;
    }
    var merged = new Float32Array(totalLen);
    var offset = 0;
    for (var c = 0; c < chunks.length; c++) { merged.set(chunks[c], offset); offset += chunks[c].length; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(merged, 3));
    planEdgesMesh.geometry = geo;
    planEdgesMesh.visible = true;
  }

  /** Ana kareden SONRA, ayni canvas'in ust seridine (scissor ile
   *  sinirlanmis) ustten bakan ikinci bir viewport olarak cizilir - minimap
   *  ile ayni teknik, ama her zaman acik/tiklanabilir, pan/zoom edilebilir ve
   *  tum kati/binayi kapsar. Binayi, gercek bir mimari pafta gibi okunsun diye
   *  planEdgesMesh (SADECE siluet/kirisim cizgileri - ic ucgenlestirme
   *  YOKTUR) taban kotunun ~1.2m ustunden yatay bir "kesit" duzlemiyle
   *  kirpilarak cizilir (cati/ust kat gorusu engellemez). */
  function renderPlanPane() {
    if (!splitMode || !planCam || planRect.w < 10 || planRect.h < 10) return;
    var box = currentPlanBox();
    if (!box) return;
    if (planEdgesDirty) rebuildPlanEdgesGeometry();

    var baseCenter = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var half = Math.max((Math.max(size.x, size.z) * 0.5 * 1.08 || 1) / planZoom, 1e-3);
    var aspect = planRect.w / Math.max(planRect.h, 1);
    var halfW, halfH;
    if (aspect >= 1) { halfW = half * aspect; halfH = half; }
    else { halfW = half; halfH = half / aspect; }
    planCam.left = -halfW; planCam.right = halfW;
    planCam.top = halfH; planCam.bottom = -halfH;

    var cx = baseCenter.x + planPan.x;
    var cz = baseCenter.z + planPan.z;
    var height = Math.max(size.x, size.y, size.z, 1) * 3;
    planCam.position.set(cx, box.max.y + height, cz);
    planCam.near = 0.1;
    planCam.far = height * 2 + 10;
    planCam.lookAt(cx, box.min.y, cz);
    planCam.updateProjectionMatrix();
    planViewState = { halfW: halfW, halfH: halfH };

    // Yatay kesit: taban kotunun ~1.2m ustunde - catiyi/ust yapiyi disarida
    // birakip alttaki oda duzenini gorunur kilar (gercek bir kat plani gibi).
    var mmPerUnit = (model && model._lengthScaleToMm) || 1000;
    var cutY = Math.min(box.min.y + (PLAN_CUT_HEIGHT_M * 1000) / mmPerUnit, box.min.y + size.y * 0.92);
    planCutPlane.constant = cutY;
    planEdgesMesh.material.clippingPlanes = activeClipPlanes().concat([planCutPlane]);

    // "Sen buradasin" isaretcisi: YURUME MODUNDA gercek oyuncu konumu/yonunu
    // (walk.position/walk.yaw) izler - orbit modunda ise 3B kameranin baktigi
    // noktayi (controls.target) ve bakis yonunu gosterir. Boylece 3B'de
    // yururken plan uzerindeki isaretci de AYNI ANDA, ayni yonde hareket eder.
    var markerX, markerZ, heading;
    if (walk.active) {
      markerX = walk.position.x; markerZ = walk.position.z;
      heading = walk.yaw;
    } else {
      markerX = controls.target.x; markerZ = controls.target.z;
      var lookDir = new THREE.Vector3(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z);
      heading = lookDir.lengthSq() > 1e-8 ? Math.atan2(lookDir.x, lookDir.z) : 0;
    }
    planMarker.visible = true;
    planMarker.position.set(markerX, cutY + 1e-3, markerZ);
    planMarker.rotation.y = heading;
    planMarker.scale.setScalar(Math.max(halfW, halfH) * 0.022 || 0.15);

    var x = Math.round(planRect.x);
    var yGl = Math.round(window.innerHeight - planRect.y - planRect.h); // DOM ust-orijin -> GL alt-orijin
    var w = Math.round(planRect.w), hh = Math.round(planRect.h);
    renderer.setClearColor(PLAN_BG, 1);
    renderer.setScissorTest(true);
    renderer.setScissor(x, yGl, w, hh);
    renderer.setViewport(x, yGl, w, hh);
    renderer.render(scene, planCam);
    renderer.setScissorTest(false);
    renderer.setClearColor(bg, 1);

    updatePlanRoomLabels(cutY);
  }

  /** Plan panosu uzerindeki DOM etiket katmani (#planLabels) - MeasureTool'un
   *  DOM etiketleriyle ayni teknik (bkz. tools.js _drawPreview), ama planCam/
   *  planRect'e gore projekte edilir. Havuzdaki elemanlar yeniden kullanilir;
   *  fazla olanlar gizlenir (her karede DOM olusturup yok etmemek icin). */
  var planLabelsEl = null;
  var planLabelPool = []; // { el, nameEl, areaEl }
  var PLAN_LABEL_MARGIN_PX = 40; // gorunur alanin bu kadar disina tasan etiketler gizlenir

  function planWorldToScreen(x, y, z) {
    var p = new THREE.Vector3(x, y, z).project(planCam);
    return {
      x: planRect.x + (p.x * 0.5 + 0.5) * planRect.w,
      y: planRect.y + (-p.y * 0.5 + 0.5) * planRect.h
    };
  }

  function acquirePlanLabel(i) {
    var item = planLabelPool[i];
    if (!item) {
      var el = document.createElement('div');
      el.className = 'room-label';
      var nameEl = document.createElement('div');
      nameEl.className = 'name';
      var areaEl = document.createElement('div');
      areaEl.className = 'area';
      el.appendChild(nameEl);
      el.appendChild(areaEl);
      planLabelsEl.appendChild(el);
      item = { el: el, nameEl: nameEl, areaEl: areaEl };
      planLabelPool[i] = item;
    }
    return item;
  }

  /** Sadece TEK bir kat seciliyken (currentStoreyId) o katin oda/alan
   *  etiketlerini gosterir - "tum katlar" gorunumunde ust uste binen
   *  etiketler karisikliga yol acacagi icin orada hic cizilmez. */
  function updatePlanRoomLabels(cutY) {
    if (!planLabelsEl) planLabelsEl = document.getElementById('planLabels');
    if (!planLabelsEl) return;
    var rooms = (model && currentStoreyId != null && model.roomLabels)
      ? model.roomLabels.get(currentStoreyId) : null;
    if (!rooms || !rooms.length) {
      for (var i = 0; i < planLabelPool.length; i++) planLabelPool[i].el.style.display = 'none';
      return;
    }
    for (var j = 0; j < rooms.length; j++) {
      var r = rooms[j];
      var item = acquirePlanLabel(j);
      var s = planWorldToScreen(r.x, cutY, r.z);
      if (s.x < planRect.x - PLAN_LABEL_MARGIN_PX || s.x > planRect.x + planRect.w + PLAN_LABEL_MARGIN_PX ||
          s.y < planRect.y - PLAN_LABEL_MARGIN_PX || s.y > planRect.y + planRect.h + PLAN_LABEL_MARGIN_PX) {
        item.el.style.display = 'none';
        continue;
      }
      item.el.style.display = 'block';
      item.el.style.left = s.x + 'px';
      item.el.style.top = s.y + 'px';
      item.nameEl.textContent = r.name || 'Mahal';
      item.areaEl.textContent = (Math.round(r.area * 10) / 10).toFixed(1) + ' m²';
    }
    for (var k = rooms.length; k < planLabelPool.length; k++) planLabelPool[k].el.style.display = 'none';
  }

  /** Plan panosunda tiklanan ekran noktasini planCam ile isinlayip alttaki
   *  dunya noktasindaki (x,z) konumu bulur; bulunursa 3B YURUME MODUNA
   *  gecilir ve kullanici o noktada "yerde durur" halde baslar (dalux tarzi
   *  "plandan 3B'ye isinlanma"). Eleman SECILMEZ. Ustten bakan isinin Y'si
   *  CATI/TAVAN gibi bir ust yuzey olabileceginden (kus bakisi ilk isabet),
   *  o noktadan asagiya IKINCI bir isin atilarak gercek TABAN yuzeyi aranir.
   *  ONCEDEN "tum katlar" gorunumunde binanin EN ALT (Y) noktasi kullaniliyordu;
   *  bu, ust kat planinda tiklandiginda yurumeyi gercek zeminin kat sayisi
   *  kadar altinda baslatip (yer-takip probu bu kadar buyuk bir farki
   *  kapsamadigindan) oyuncunun boslukta/havada asili kalmasina yol aciyordu -
   *  asagi dogru isin, tiklanan (x,z) altindaki GERCEK tabani (hangi kat
   *  olursa olsun) bulur. */
  function planTap(clientX, clientY) {
    if (!model || planRect.w < 10) return;
    var ndc = new THREE.Vector2(
      ((clientX - planRect.x) / planRect.w) * 2 - 1,
      -((clientY - planRect.y) / planRect.h) * 2 + 1
    );
    raycaster.setFromCamera(ndc, planCam);
    var hit = resolveHit(raycaster.intersectObjects(visibleMeshes(), false));
    if (!hit) return;

    var down = pickAlongRay(hit.point, new THREE.Vector3(0, -1, 0), hit.object, hit.instanceId);
    var floorY = down ? down.point.y : hit.point.y;
    walkPicking = false;
    enterWalkthroughAtPoint(new THREE.Vector3(hit.point.x, floorY, hit.point.z));
    post('walkStarted', {});
  }

  /** Ana kareden SONRA, ayni canvas'in kucuk bir kosesine (scissor ile
   *  sinirlanmis) ikinci bir viewport olarak cizilir - ek render hedefi
   *  (render target) gerektirmez. Sadece MINIMAP_LAYER'daki mermer/model
   *  (layer 0, kamera ikisini de gordugu icin) ve oyuncu isaretcisi (layer 1)
   *  gorunur; joystick'lerin RN tarafindaki dokunma alanlarini kapmamasi icin
   *  ekranin alt-ortasinda, iki joystick arasindaki bosluga yerlestirilir. */
  function renderMinimap() {
    if (!minimapCam || !model || model.bbox.isEmpty() || minimapSizeCss < MINIMAP_MIN_CSS) return;
    var mmPerUnit = model._lengthScaleToMm || 1000;
    var r = (MINIMAP_RADIUS_M * 1000) / mmPerUnit;
    minimapCam.left = -r; minimapCam.right = r; minimapCam.top = r; minimapCam.bottom = -r;

    var span = model.bbox.getSize(new THREE.Vector3()).length() || 10;
    var height = span + r;
    minimapCam.position.set(walk.position.x, walk.position.y + height, walk.position.z);
    minimapCam.near = 0.1;
    minimapCam.far = height * 2 + r;
    minimapCam.lookAt(walk.position.x, walk.position.y, walk.position.z);
    minimapCam.updateProjectionMatrix();

    minimapMarker.position.copy(walk.position);
    minimapMarker.rotation.y = walk.yaw;
    minimapMarker.scale.setScalar(r * 0.12);

    // NOT: three.js setViewport/setScissor, renderer.setSize()'a verilenle AYNI
    // (CSS) birimi bekler ve pixelRatio carpimini KENDI icinde yapar (ana kare
    // de yukarida window.innerWidth/innerHeight'i HAM kullaniyor) - burada
    // AYRICA ratio ile carpmak degerleri ikiye katlayip mini haritayi ekran
    // disina/yanlis koseye kaydiriyordu.
    var size = Math.round(minimapSizeCss);
    var x = Math.round((window.innerWidth - size) / 2);
    var y = Math.round(minimapMarginCss); // WebGL viewport/scissor y=0 ekranin ALTI

    renderer.setScissorTest(true);
    renderer.setScissor(x, y, size, size);
    renderer.setViewport(x, y, size, size);
    renderer.render(scene, minimapCam);
    renderer.setScissorTest(false);
  }

  /* ---------------- Render dongusu ---------------- */

  function updateLod() {
    if (!model || model.groups.length < 150) return;
    var scale = pixelWorldScale();
    var pos = camera.position;
    for (var i = 0; i < model.groups.length; i++) {
      var mesh = model.groups[i].mesh;
      var sphere = mesh.boundingSphere;
      if (!sphere) { mesh.visible = true; continue; }
      var worldCenter = sphere.center.clone().applyMatrix4(mesh.matrixWorld);
      var dist = pos.distanceTo(worldCenter);
      var pixels = (sphere.radius * 2) / Math.max(scale(worldCenter), 1e-9);
      // 2 pikselden kucuk gorunen gruplar cizilmez
      mesh.visible = pixels > 2 || dist < sphere.radius * 2;
    }
  }

  function adaptQuality(dt) {
    quality.acc += dt;
    quality.frames++;
    if (quality.acc < 500) return;
    quality.fps = Math.round(quality.frames * 1000 / quality.acc);
    quality.frames = 0;
    quality.acc = 0;
    if (quality.fps < 28 && quality.pixelRatio > 0.6) {
      quality.pixelRatio = Math.max(0.6, quality.pixelRatio - 0.2);
      renderer.setPixelRatio(quality.pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    } else if (quality.fps > 52 && quality.pixelRatio < quality.target) {
      quality.pixelRatio = Math.min(quality.target, quality.pixelRatio + 0.2);
      renderer.setPixelRatio(quality.pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    if (hud.style.display === 'block') {
      hud.textContent = quality.fps + ' FPS  |  ' + Math.round(quality.pixelRatio * 100) / 100 + 'x';
    }
    post('fps', { fps: quality.fps, pixelRatio: quality.pixelRatio });
  }

  var lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);
    var now = performance.now();
    var dt = now - lastTime;
    lastTime = now;

    var moving = walk.active ? updateWalk(dt) : controls.update();
    if (!walk.active && camera.isOrthographicCamera && moving) updateOrthoFrustum();

    var warmingUp = now < warmupUntil;
    var pulsing = !!(selectionMesh && selectionMesh.userData.pulseStart);
    if (moving) needsRender = true;
    if (warmingUp) needsRender = true;
    if (pulsing) needsRender = true;
    if (!needsRender) { adaptQuality(dt); return; }

    lodTimer += dt;
    if (lodTimer > 250) { lodTimer = 0; updateLod(); }

    measure.update();
    updateSelectionPulse(now);
    cube.sync(camera, walk.active ? walk.lookTarget : controls.target);

    try {
      // Tum canvas once temizlenir (splitMode acikken ayirici seridinde eski
      // piksel kalmasin diye); asil 3B ise ardindan mainRect'e scissor'lanir.
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      renderer.clear();
      var mainGlY = window.innerHeight - mainRect.y - mainRect.h;
      renderer.setScissorTest(true);
      renderer.setScissor(mainRect.x, mainGlY, mainRect.w, mainRect.h);
      renderer.setViewport(mainRect.x, mainGlY, mainRect.w, mainRect.h);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      cube.render(renderer, mainRect);
      if (walk.active) renderMinimap();
      if (splitMode) renderPlanPane();
    } catch (e) {
      // Bir kare cizimi patlarsa (ör. clipping ile shader recompile hatasi) render
      // dongusunu ASLA durdurma; hatayi bildirip devam et, sahne tamamen kaybolmasin.
      post('error', { code: 'RENDER_FRAME_FAILED', message: String(e && e.message || e) });
    }

    needsRender = moving || pulsing || (performance.now() < warmupUntil);
    // Kat gecisi/kesit/model yukleme gibi yapisal degisikliklerden hemen sonraki
    // warmup penceresi, tek seferlik kurulum maliyeti (ör. hayalet mesh olusturma)
    // yuzunden gercekci olmayan dusuk FPS gosterebilir. Bu pencere olcume HIC
    // katilmazsa tek bir yavas kare kalici bir pixelRatio dususune (bulanik
    // gorunum) yol acmaz; warmup bitince olcum sifirdan, kararli sahneyle baslar.
    if (warmingUp) { quality.acc = 0; quality.frames = 0; } else { adaptQuality(dt); }
  }

  /* ---------------- RN -> WebView komutlari ---------------- */

  var wasmChunks = [];
  var ifcChunks = [];
  var wasmBytes = null;
  var booted = false;

  on('wasmChunk', function (p) {
    wasmChunks.push(p.data);
    post('ack', { kind: 'wasm', index: p.index });
  });

  on('wasmEnd', async function () {
    try {
      wasmBytes = SOS.util.joinBase64Chunks(wasmChunks);
      wasmChunks = [];
      model = new SOS.IFCModel();
      await model.init(wasmBytes);
      booted = true;
      post('booted', { bytes: wasmBytes.length });
    } catch (e) {
      post('error', { code: 'WASM_INIT_FAILED', message: String(e && e.message || e) });
    }
  });

  on('ifcBegin', function (p) {
    ifcChunks = [];
    post('progress', { phase: 'transfer', percent: 0 });
    post('ack', { kind: 'ifcBegin', name: p.name });
  });

  on('ifcChunk', function (p) {
    ifcChunks.push(p.data);
    post('ack', { kind: 'ifc', index: p.index });
    if (p.total) post('progress', { phase: 'transfer', percent: Math.round(100 * (p.index + 1) / p.total) });
  });

  on('ifcEnd', async function () {
    if (!booted) { post('error', { code: 'NOT_BOOTED', message: 'web-ifc hazir degil' }); return; }
    var bytes;
    try {
      bytes = SOS.util.joinBase64Chunks(ifcChunks);
      ifcChunks = [];
    } catch (e) {
      post('error', { code: 'TRANSFER_FAILED', message: String(e && e.message || e) });
      return;
    }

    try {
      if (model.modelID >= 0) {
        // onceki modeli temizle
        scene.remove(model.root);
        model.dispose();
        var api = model.api;
        model = new SOS.IFCModel();
        model.api = api;
        model.typeNames = model._buildTypeNames();
      }
      scene.add(model.root);
      model.root.updateMatrixWorld(true);

      var stats = await model.open(bytes);
      model.root.updateMatrixWorld(true);
      model.bbox.setFromObject(model.root);

      // Buyuk modellerde GPU yuku ilk andan (renderer.compile + warmup'in
      // zorla art arda cizdirdigi kareler) itibaren yuksektir - bu tam da
      // WebGL baglaminin kaybolma ihtimalinin en yuksek oldugu andir.
      // adaptQuality() FPS DUSTUKTEN SONRA (reaktif) pixelRatio'yu azaltir;
      // buyuk bir model icin bunu BEKLEMEDEN, ucgen sayisina gore ONCEDEN
      // dusuk baslatmak GPU'yu baslangicta rahatlatir ve "az buyuyunce
      // baglam kaybi / donma" esigini yukseklir.
      if (stats && stats.triangles > 2000000) {
        var scaleDown = stats.triangles > 6000000 ? 0.6 : (stats.triangles > 3500000 ? 0.75 : 0.9);
        quality.target = Math.min(quality.target, scaleDown);
        quality.pixelRatio = quality.target;
        renderer.setPixelRatio(quality.pixelRatio);
      }

      walk.active = false;
      walkPicking = false;
      setMinimapFrameVisible(false);
      currentStoreyId = null;
      planPan.x = 0; planPan.z = 0; planZoom = 1;
      planEdgesDirty = true;
      controls.enabled = true;
      visibility.showAll();
      visibility.setXray(false);
      timelineTintedIds = new Set();
      explode.reset();
      setProjection('perspective');
      // Once bakis yonu, sonra o yone gore sikica cerceveleme
      goToDirection(new THREE.Vector3(1, 0.75, 1).normalize(), false);
      fit(1.12);

      // Yeni InstancedMesh malzemeleri icin shader programlarini simdiden derle;
      // aksi halde ilk gorunur karede mobil GPU'da derleme gecikmesi yasanabilir.
      renderer.compile(scene, camera);
      warmup(1500);

      post('loaded', {
        stats: stats,
        tree: model.tree,
        unitScaleToMm: model._lengthScaleToMm,
        bbox: { min: model.bbox.min.toArray(), max: model.bbox.max.toArray() },
        storeys: model.storeysInfo
      });
      // Onizleme gorseli: warmup penceresi ac.ken (frame'ler zorla cizildigi
      // icin framebuffer taze) ama ilk kompozisyon (fit + isik) yerlesmis
      // olsun diye kisa bir gecikmeyle yakalanir.
      setTimeout(captureThumbnail, 1400);
    } catch (e) {
      post('error', { code: 'IFC_LOAD_FAILED', message: String(e && e.message || e) });
    }
  });

  on('fit', function () { fit(1.12); });
  on('viewDirection', function (p) {
    goToDirection(new THREE.Vector3(p.x, p.y, p.z), p.orthographic !== false);
  });
  on('resetView', function () {
    walk.active = false;
    walkPicking = false;
    setMinimapFrameVisible(false);
    currentStoreyId = null;
    planPan.x = 0; planPan.z = 0; planZoom = 1;
    planEdgesDirty = true;
    controls.enabled = true;
    visibility.showAll();
    visibility.setXray(false);
    clearSelection();
    post('selection', null);
    section.clear();
    explode.reset();
    measure.clear();
    visibility.setWireframe(false);
    setProjection('perspective');
    goToDirection(new THREE.Vector3(1, 0.75, 1).normalize(), false);
    fit(1.12);
    warmup(800);
  });

  on('setTheme', function (p) {
    bg = parseInt(String(p.background || '#20232A').replace('#', ''), 16);
    renderer.setClearColor(bg, 1);
    cube.setLabels(p.cubeLabels || null, p.dark !== false);
    styleDivider(p.surface, p.accent, p.border);
    needsRender = true;
  });

  on('showHud', function (p) { hud.style.display = p.visible ? 'block' : 'none'; needsRender = true; });

  /* RN tarafinin guvenli alan (safe area) alt bosluğu - yurume modu joystick'leri
   *  bu kadar ekstra yukari kayar (bkz. WalkthroughOverlay SafeAreaView), minimap'i
   *  onlarla ayni hizada tutmak icin gerekli. */
  on('layout', function (p) {
    safeBottomCss = (p && p.safeBottom) || 0;
    positionMinimapFrame();
  });

  on('section', function (p) { section.set(p.axis, p.t, p.flipped); warmup(800); });
  on('clearSection', function (p) { section.clear(p && p.axis); warmup(800); });

  on('hide', function (p) { visibility.hide(p.ids); planEdgesDirty = true; });
  on('show', function (p) { visibility.show(p.ids); planEdgesDirty = true; });
  on('isolate', function (p) { visibility.isolate(p.ids); planEdgesDirty = true; });
  on('showAll', function () { visibility.showAll(); clearSelection(); planEdgesDirty = true; });
  on('wireframe', function (p) { visibility.setWireframe(p.enabled); });
  on('explode', function (p) { explode.setRadial(p.factor || 0); });
  on('layerSeparate', function (p) { explode.setLayer(p.axis, p.factor || 0); });
  on('xray', function (p) { visibility.setXray(!!p.enabled); });

  /* Kat gecisi: secilen kat gorunur kalir, diger tum katlar 3B'de tamamen
   *  gizlenir (bkz. VisibilityTool.showFloorGhost). applyStorey hem RN'den
   *  gelen showStorey komutu hem de plan panosundaki iki-parmak dikey
   *  kaydirma jesti (bkz. setupPlanPane) tarafindan kullanilir. */
  function applyStorey(id) {
    if (!model || !model.storeyElements) return;
    currentStoreyId = id;
    planPan.x = 0; planPan.z = 0; planZoom = 1;
    planEdgesDirty = true;
    var ids = model.storeyElements.get(id) || [];
    visibility.showFloorGhost(ids);
    clearSelection();
    post('selection', null);
    var fitBox = storeyBoxFromIds(ids, id);
    if (fitBox) fit(1.3, fitBox);
    warmup(600);
  }

  /** currentStoreyId'yi model.storeys sirasina (yukseklige) gore bir sonraki/
   *  onceki kata tasir - plan panosunda iki-parmak dikey kaydirma jesti icin.
   *  Kat secili degilken (currentStoreyId null) ilk jest en alt/ust kata gider.
   *  RN tarafinin kat secici UI'sinin (FloorNav) da senkron kalmasi icin
   *  yeni secimi 'storeyChanged' olayiyla bildirir. */
  function switchStorey(dir) {
    if (!model || !model.storeys || !model.storeys.length) return;
    var order = model.storeys;
    var idx = (currentStoreyId != null) ? order.indexOf(currentStoreyId) : -1;
    var nextIdx = (idx < 0) ? (dir > 0 ? 0 : order.length - 1) : SOS.util.clamp(idx + dir, 0, order.length - 1);
    if (nextIdx === idx) return;
    var id = order[nextIdx];
    applyStorey(id);
    post('storeyChanged', { id: id, index: nextIdx });
  }

  on('showStorey', function (p) { applyStorey(p.id); });
  on('showAllStoreys', function () {
    currentStoreyId = null;
    planPan.x = 0; planPan.z = 0; planZoom = 1;
    planEdgesDirty = true;
    visibility.showFloorGhost(null);
    clearSelection();
    post('selection', null);
    fit(1.12);
    warmup(600);
  });

  /* 4D zaman tuneli: Pset ozelliklerinde ISO tarihi (YYYY-MM-DD...) bulunan
   *  elemanlar taranir; her eleman icin { start, end } araligi cikarilir
   *  (tek tarih varsa ikisi ayni). Tarihi OLMAYAN elemanlar (ör. temel/tasiyici
   *  sistem disindaki cogu eleman) her zaman gorunur kalir. Secili kesim
   *  tarihine gore: start > kesim ise eleman HENUZ BASLAMADI (gizli); end >
   *  kesim ise DEVAM EDIYOR (turuncu vurgu ile gorunur); aksi halde TAMAMLANDI
   *  (normal gorunur). */
  var TIMELINE_PROGRESS_COLOR = new THREE.Color(0xFFA53D);
  var TIMELINE_WHITE = new THREE.Color(0xFFFFFF);

  /** Bir elemanin tum InstancedMesh ornek renklerini turuncuya (devam ediyor)
   *  veya beyaza (vurgusuz - taban rengi degismeden kalir) ayarlar. instanceColor
   *  bir mesh'te ILK kez kullanildiginda three.js onu otomatik beyazla doldurur
   *  ve shader'in yeniden derlenmesi gerekir (bu yuzden sadece o an material
   *  needsUpdate isaretlenir); sonraki guncellemeler ucuzdur. */
  function setTimelineTint(id, tinted) {
    var refs = model.elementIndex.get(id);
    if (!refs) return;
    for (var i = 0; i < refs.length; i++) {
      var ref = refs[i];
      var mesh = model.groups[ref.g].mesh;
      var hadColor = !!mesh.instanceColor;
      mesh.setColorAt(ref.i, tinted ? TIMELINE_PROGRESS_COLOR : TIMELINE_WHITE);
      if (!hadColor) mesh.material.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  on('timelineBuild', async function () {
    if (!model) { post('timelineReady', { dates: [], elementsCount: 0 }); return; }
    try {
      var result = await model.scanTimelineDates();
      post('timelineReady', { dates: result.dates, elementsCount: result.elementsCount });
    } catch (e) {
      post('error', { code: 'TIMELINE_FAILED', message: String(e && e.message || e) });
      post('timelineReady', { dates: [], elementsCount: 0 });
    }
  });
  on('timelineSet', function (p) {
    if (!model || !model._timelineRanges) return;
    visibility.showAll();
    var hideIds = [];
    var progressIds = new Set();
    model._timelineRanges.forEach(function (r, id) {
      if (r.start > p.ts) { hideIds.push(id); return; }
      if (r.end > p.ts) progressIds.add(id);
    });
    if (hideIds.length) visibility.hide(hideIds);
    timelineTintedIds.forEach(function (id) { if (!progressIds.has(id)) setTimelineTint(id, false); });
    progressIds.forEach(function (id) { if (!timelineTintedIds.has(id)) setTimelineTint(id, true); });
    timelineTintedIds = progressIds;
    planEdgesDirty = true;
    warmup(400);
  });
  on('timelineClear', function () {
    visibility.showAll();
    timelineTintedIds.forEach(function (id) { setTimelineTint(id, false); });
    timelineTintedIds = new Set();
    planEdgesDirty = true;
    warmup(400);
  });

  on('select', function (p) {
    if (p.id === null || p.id === undefined) { clearSelection(); return; }
    selectElement(p.id, !!p.focus, undefined, undefined, !!p.pulse);
  });

  on('flyTo', function (p) { flyToPoint(p.x, p.y, p.z); });
  on('setSplitMode', function (p) {
    splitMode = !!(p && p.enabled);
    if (splitMode) { planPan.x = 0; planPan.z = 0; planZoom = 1; planEdgesDirty = true; }
    computeLayout();
    needsRender = true;
  });

  on('measureMode', function (p) { measure.setMode(p.mode); });
  on('measureUnit', function (p) { measure.setUnit(p.unit); });
  on('measureUndo', function () { measure.undo(); });
  on('measureRedo', function () { measure.redo(); });
  on('measureClear', function () { measure.clear(); });

  on('walkArmPick', function () { walkPicking = true; walkArmedAt = Date.now(); needsRender = true; });
  on('walkCancelPick', function () { walkPicking = false; });
  on('walkExit', function () { walkPicking = false; exitWalkthrough(); });
  on('walkMove', function (p) {
    walk.moveX = SOS.util.clamp((p && p.x) || 0, -1, 1);
    walk.moveY = SOS.util.clamp((p && p.y) || 0, -1, 1);
  });
  on('walkLook', function (p) {
    walk.lookX = SOS.util.clamp((p && p.x) || 0, -1, 1);
    walk.lookY = SOS.util.clamp((p && p.y) || 0, -1, 1);
  });

  // Otomatik testler ve hata ayiklama icin ic duruma okuma erisimi
  SOS.debug = {
    get camera() { return camera; },
    get controls() { return controls; },
    get model() { return model; },
    get scene() { return scene; },
    /** Sahneyi cizip framebuffer'i hemen okur: "ekran bos mu" testi icin. */
    pixelStats: function () {
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
      var gl = renderer.getContext();
      var w = renderer.domElement.width, h = renderer.domElement.height;
      var px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var seen = {};
      var count = 0;
      var nonBackground = 0;
      for (var i = 0; i < px.length; i += 4) {
        var key = (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
        if (!seen[key]) { seen[key] = 1; count++; }
        if (px[i] > 60 || px[i + 1] > 60 || px[i + 2] > 60) nonBackground++;
      }
      return {
        size: [w, h],
        distinctColors: count,
        coverage: Math.round(1000 * nonBackground / (w * h)) / 10
      };
    },

    snapshot: function () {
      var box = model && !model.bbox.isEmpty() ? model.bbox : null;
      return {
        projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective',
        fov: perspCamera.fov,
        aspect: perspCamera.aspect,
        radius: controls.spherical.radius,
        target: controls.target.toArray(),
        position: camera.position.toArray(),
        bbox: box ? { min: box.min.toArray(), max: box.max.toArray() } : null,
        groups: model ? model.groups.length : 0,
        visibleGroups: model ? model.groups.filter(function (g) { return g.mesh.visible; }).length : 0
      };
    }
  };

  init();
})(window.SOS);
