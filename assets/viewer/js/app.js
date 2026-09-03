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
    speed: 3,                // hiz carpani (walkSpeed komutuyla degisir), varsayilan 3x
    vy: 0,                   // dusey hiz (m/s, asagi yonlu pozitif) - yercekimi/dusme icin
    falling: false
  };
  var WALK_MOVE_MPS = 1.4;   // insan yuruyus hizi (m/s)
  var WALK_LOOK_RATE = 2.2;  // tam kuvvette radyan/s
  var walkPicking = false;   // true iken bir sonraki dokunma yurume baslangic noktasidir
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
      // Model onizleme gorseli (thumbnail) icin canvas.toDataURL cizim
      // tamamlandiktan hemen sonra okunabilsin diye framebuffer korunur.
      preserveDrawingBuffer: true
    });
    quality.target = Math.min(window.devicePixelRatio || 1, 2);
    quality.pixelRatio = quality.target;
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.setClearColor(bg, 1);

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
        // ikinci parmak indi (olasi pinch): bekleyen surukleme adayini iptal et
        chPress = null;
        return;
      }
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
      }
      crosshairShow(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', function (e) { crosshairEnd(e); });
    canvas.addEventListener('pointercancel', function (e) { crosshairEnd(e, true); });
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      post('error', { code: 'GL_CONTEXT_LOST', message: 'WebGL context kayboldu' });
    });
    canvas.addEventListener('webglcontextrestored', function () {
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
    var aspect = w / Math.max(h, 1);
    perspCamera.aspect = aspect;
    perspCamera.updateProjectionMatrix();
    updateOrthoFrustum();
    positionMinimapFrame();
    needsRender = true;
  }

  function updateOrthoFrustum() {
    var aspect = window.innerWidth / Math.max(window.innerHeight, 1);
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
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
      z: p.z
    };
  }

  /** Verilen dunya noktasinda 1 pikselin dunya birimi karsiligi. */
  function pixelWorldScale() {
    var h = Math.max(window.innerHeight, 1);
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
      (x / window.innerWidth) * 2 - 1,
      -(y / window.innerHeight) * 2 + 1
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
    var faceHit = cube.hitTest(x, y, canvas);
    if (faceHit) {
      goToDirection(faceHit.dir, true);
      post('viewCube', { face: faceHit.key });
      return;
    }
    if (walkPicking) {
      var walkHit = pick(x, y);
      if (walkHit) {
        walkPicking = false;
        enterWalkthroughAtPoint(walkHit.point);
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
    var hit = pick(x, cy);
    var snapped = false;

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
    } else if (measure.snapDot) {
      measure.snapDot.style.display = 'none';
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
    if (chActive && !cancelled) {
      measure.tap(parseFloat(crosshairEl.dataset.x), parseFloat(crosshairEl.dataset.y));
    }
    if (chActive) {
      crosshairEl.style.display = 'none';
      if (measure.snapDot) measure.snapDot.style.display = 'none';
      controls.enabled = true;
      chActive = false;
    }
    chPress = null;
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
    controls.minDistance = radius * 0.002;
    controls.maxDistance = radius * 60;
    perspCamera.near = Math.max(radius * 0.001, 0.01);
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
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
      cube.render(renderer, canvas);
      if (walk.active) renderMinimap();
    } catch (e) {
      // Bir kare cizimi patlarsa (ör. clipping ile shader recompile hatasi) render
      // dongusunu ASLA durdurma; hatayi bildirip devam et, sahne tamamen kaybolmasin.
      post('error', { code: 'RENDER_FRAME_FAILED', message: String(e && e.message || e) });
    }

    needsRender = moving || pulsing || (performance.now() < warmupUntil);
    adaptQuality(dt);
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

      walk.active = false;
      walkPicking = false;
      setMinimapFrameVisible(false);
      controls.enabled = true;
      visibility.showAll();
      visibility.setXray(false);
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

  on('hide', function (p) { visibility.hide(p.ids); });
  on('show', function (p) { visibility.show(p.ids); });
  on('isolate', function (p) { visibility.isolate(p.ids); });
  on('showAll', function () { visibility.showAll(); clearSelection(); });
  on('wireframe', function (p) { visibility.setWireframe(p.enabled); });
  on('explode', function (p) { explode.setRadial(p.factor || 0); });
  on('layerSeparate', function (p) { explode.setLayer(p.axis, p.factor || 0); });
  on('xray', function (p) { visibility.setXray(!!p.enabled); });

  /* Kat gecisi: secilen kati izole edip ona sigdirir - "hizli gezinme"
   *  icin patlatmadan bagimsiz, ayri bir mod (VisibilityTool.isolate uzerine kurulu). */
  on('showStorey', function (p) {
    if (!model || !model.storeyElements) return;
    var ids = model.storeyElements.get(p.id) || [];
    visibility.isolate(ids);
    clearSelection();
    post('selection', null);
    if (ids.length) {
      var box = new THREE.Box3();
      for (var i = 0; i < ids.length; i++) {
        var b = model.getElementBox(ids[i]);
        if (b) box.union(b);
      }
      if (!box.isEmpty()) fit(1.3, box);
    }
    warmup(600);
  });
  on('showAllStoreys', function () {
    visibility.isolate(null);
    clearSelection();
    post('selection', null);
    fit(1.12);
    warmup(600);
  });

  /* 4D zaman tuneli: Pset ozelliklerinde ISO tarihi (YYYY-MM-DD...) bulunan
   *  elemanlar taranir; tarihi OLMAYAN elemanlar (ör. temel/tasiyici sistem
   *  disindaki cogu eleman) her zaman gorunur kalir - sadece tarihli
   *  elemanlar secili kesim tarihine gore gizlenir/gosterilir. */
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
    if (!model || !model._timelineDates) return;
    visibility.showAll();
    var hideIds = [];
    model._timelineDates.forEach(function (ts, id) { if (ts > p.ts) hideIds.push(id); });
    if (hideIds.length) visibility.hide(hideIds);
    warmup(400);
  });
  on('timelineClear', function () { visibility.showAll(); warmup(400); });

  on('select', function (p) {
    if (p.id === null || p.id === undefined) { clearSelection(); return; }
    selectElement(p.id, !!p.focus, undefined, undefined, !!p.pulse);
  });

  on('measureMode', function (p) { measure.setMode(p.mode); });
  on('measureUnit', function (p) { measure.setUnit(p.unit); });
  on('measureUndo', function () { measure.undo(); });
  on('measureRedo', function () { measure.redo(); });
  on('measureClear', function () { measure.clear(); });

  on('walkArmPick', function () { walkPicking = true; needsRender = true; });
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
  on('walkSpeed', function (p) {
    walk.speed = SOS.util.clamp((p && p.speed) || 1, 0.25, 4);
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
