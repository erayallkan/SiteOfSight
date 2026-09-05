/* Goruntuleme ve olcum araclari: kesit, gizle/izole, tel kafes, patlatma, olcum (snap + undo/redo) */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  var post = SOS.bridge.post;
  // NOT: gizli eleman matrisi ONCEDEN sabit makeScale(0,0,0) idi - bu, oteleme
  // (translation) bilesenini de sifirlayip elemani DUNYA ORIJININE tasiyordu.
  // InstancedMesh.computeBoundingSphere() TUM instance'lari (gizli olanlar dahil)
  // tarar; orijine tasinan gizli elemanlar grubun sinir kuresini gercek
  // konumundan orijine dogru cekip yari capini siskinlestiriyordu. Bu bozuk kure
  // updateLod()'un ekran-alani hesabinda kullanildiginda (bkz. app.js), model
  // orijininden uzak bir kat secildiginde (kat gecisi ghost modu) o katin
  // gruplari "ekranda cok kucuk" sanilip tamamen gizleniyor - sahne siyah
  // kaliyordu. Duzeltme: gizli eleman KENDI KONUMUNDA sifir olcekle birakilir
  // (sadece scale sifirlanir, translation/rotation korunur) - boylece sinir
  // kuresi gizli/gorunur ayrimindan etkilenmez.
  //
  // PERFORMANS NOTU: rotasyonu korumak icin ilk surumde decompose/compose
  // (Quaternion.setFromRotationMatrix dahil - trig icerir) kullanilmisti.
  // Buyuk modellerde (108MB+, on binlerce eleman) kat gecisinde TUM modelin
  // gizli elemanlari icin bu matrix4->quaternion cikarimi ana thread'i
  // dondurup "kat gecisinde donma" sikayetine yol aciyordu. Rotasyonun
  // GERCEKTE onemi yok: olcek sifir oldugu icin eleman zaten gorunmez, ve
  // sinir kuresi artik gizli/gorunur degisikliginde YENIDEN HESAPLANMIYOR
  // (asagida _refresh - bir kez, olusturulduktan sonra hesaplanir). Bu
  // yuzden sadece oteleme (translation) korunur, rotasyon/olcek dogrudan
  // matris elemanlarina yazilarak (decompose'siz) sifirlanir - cok daha ucuz.
  var _hideM = new THREE.Matrix4();
  function hiddenMatrixAt(base) {
    var e = base.elements;
    return _hideM.set(
      0, 0, 0, e[12],
      0, 0, 0, e[13],
      0, 0, 0, e[14],
      0, 0, 0, 1
    );
  }

  /* ---------------- Kesit (Section) ---------------- */

  function SectionTool(env) {
    this.env = env;
    this.planes = {
      x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
      y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
    };
    this.active = {};    // axis -> { t, flipped }
    this.enabled = false;
  }

  /** structureChanged=true iken malzemelere clippingPlanes dizisini yeniden
   *  atar (bu, shader'in YENIDEN DERLENMESINE sebep olur - pahali). Sadece
   *  aktif eksen KUMESI degistiginde (duzlem eklendi/kaldirildi) gerekli;
   *  var olan bir duzlemin sadece konumu/yonu degisiyorsa (kaydiraci
   *  surukleme) Plane nesnesi YERINDE guncellenir ve three.js onu her karede
   *  otomatik olarak uniform olarak yukler - recompile gerekmez. Onceden her
   *  surukleme karesinde needsUpdate=true set edilip titremeye/takilmaya
   *  sebep oluyordu. */
  SectionTool.prototype._apply = function (structureChanged) {
    var list = [];
    var self = this;
    ['x', 'y', 'z'].forEach(function (a) { if (self.active[a]) list.push(self.planes[a]); });
    this.enabled = list.length > 0;
    // NOT: renderer.localClippingEnabled artik app.js init()'te GLOBAL olarak
    // acik - plan panosunun kendi kirpma duzlemi (yatay "kesit") kesit araci
    // kapaliyken de calismali, bu yuzden burada KAPATILMIYOR.
    if (structureChanged) {
      this.env.forEachMaterial(function (m) {
        m.clippingPlanes = list.length ? list : null;
        m.clipShadows = false;
        m.needsUpdate = true;
      });
    }
    this.env.requestRender();
  };

  /** t: 0..1 model sinir kutusu icinde konum. */
  SectionTool.prototype.set = function (axis, t, flipped) {
    var box = this.env.model ? this.env.model.bbox : null;
    if (!box || box.isEmpty()) return;
    var min = box.min[axis], max = box.max[axis];
    var pos = min + (max - min) * SOS.util.clamp(t, 0, 1);
    var normal = new THREE.Vector3();
    normal[axis] = flipped ? 1 : -1;
    this.planes[axis].normal.copy(normal);
    this.planes[axis].constant = flipped ? -pos : pos;
    var wasActive = !!this.active[axis];
    this.active[axis] = { t: t, flipped: !!flipped };
    this._apply(!wasActive);
  };

  SectionTool.prototype.clear = function (axis) {
    var hadAny = axis ? !!this.active[axis] : Object.keys(this.active).length > 0;
    if (axis) delete this.active[axis];
    else this.active = {};
    this._apply(hadAny);
  };

  /* ---------------- Gorunurluk ---------------- */

  var GHOST_OPACITY = 0.14; // kat gecisinde secili olmayan katlarin saydamligi

  function VisibilityTool(env) {
    this.env = env;
    this.hidden = new Set();
    this.isolated = null;
    this.floorIsolated = null; // showFloorGhost() ile secilen kat - null iken kat modu kapali
    this._ghostMeshes = null;  // model.groups ile ayni sirada - diger katlarin saydam kopyalari
    this.wireframe = false;
  }

  VisibilityTool.prototype._setInstance = function (ref, visible) {
    var model = this.env.model;
    var g = model.groups[ref.g];
    if (!g) return;
    g.mesh.setMatrixAt(ref.i, visible ? g.base[ref.i] : hiddenMatrixAt(g.base[ref.i]));
    g.visibleFlags[ref.i] = visible ? 1 : 0;
    g.mesh.instanceMatrix.needsUpdate = true;
  };

  /** Her model grubu icin, o grubun geometrisini paylasan ama yari-saydam bir
   *  malzemeye sahip ikinci bir InstancedMesh olusturur - kat gecisinde secili
   *  olmayan katlar tamamen gizlenmek yerine bu "hayalet" kopyada gosterilir
   *  (bkz. _refresh). Sadece ilk ihtiyac aninda (floorIsolated ilk kez
   *  kullanildiginda) kurulur; model degisince (dispose/yeni root) referans
   *  showAll() ile temizlenir. */
  VisibilityTool.prototype._ensureGhostMeshes = function () {
    if (this._ghostMeshes) return;
    var model = this.env.model;
    this._ghostMeshes = [];
    for (var g = 0; g < model.groups.length; g++) {
      var group = model.groups[g];
      var mat = group.mesh.material.clone();
      mat.transparent = true;
      mat.opacity = GHOST_OPACITY;
      mat.depthWrite = false;
      var ghost = new THREE.InstancedMesh(group.mesh.geometry, mat, group.base.length);
      ghost.frustumCulled = false;
      ghost.visible = false;
      for (var i = 0; i < group.base.length; i++) ghost.setMatrixAt(i, hiddenMatrixAt(group.base[i]));
      ghost.instanceMatrix.needsUpdate = true;
      model.root.add(ghost);
      this._ghostMeshes.push(ghost);
    }
  };

  VisibilityTool.prototype._setGhostInstance = function (ref, visible) {
    var ghost = this._ghostMeshes[ref.g];
    if (!ghost) return;
    var base = this.env.model.groups[ref.g].base[ref.i];
    ghost.setMatrixAt(ref.i, visible ? base : hiddenMatrixAt(base));
    ghost.instanceMatrix.needsUpdate = true;
  };

  VisibilityTool.prototype._refresh = function () {
    var model = this.env.model;
    if (!model) return;
    var self = this;
    var ghostActive = !!this.floorIsolated;
    if (ghostActive) this._ensureGhostMeshes();
    model.elementIndex.forEach(function (refs, id) {
      var baseVisible = !self.hidden.has(id) && (!self.isolated || self.isolated.has(id));
      var inFloor = !ghostActive || self.floorIsolated.has(id);
      var mainVisible = baseVisible && inFloor;
      var ghostVisible = ghostActive && baseVisible && !inFloor;
      for (var i = 0; i < refs.length; i++) {
        self._setInstance(refs[i], mainVisible);
        if (ghostActive) self._setGhostInstance(refs[i], ghostVisible);
      }
    });
    // PERFORMANS NOTU: burada ONCEDEN her _refresh() cagrisinda (yani her kat
    // gecisinde/gizle-goster/izole islemide) TUM gruplar icin computeBoundingSphere()
    // yeniden hesaplaniyordu - O(toplam instance sayisi) is, 108MB+ gibi buyuk
    // modellerde kat gecisini saniyelerce donduran ana sebeplerden biriydi.
    // Bu GEREKSIZDI: (1) ana mesh'in kuresi ifc.js'te olusturulurken zaten
    // hesaplaniyor ve yukaridaki hiddenMatrixAt() SADECE olcegi sifirlayip
    // konumu koridugu icin gizli/gorunur degisikligi kureyi degistirmiyor;
    // (2) hayalet (ghost) mesh'ler zaten frustumCulled=false (bkz.
    // _ensureGhostMeshes) - kureleri hic bir zaman kullanilmiyor (ne LOD ne
    // de frustum culling icin - updateLod() sadece model.groups'u, ghost
    // mesh'leri degil, dolasir). Sadece gorunurluk bayragi guncellenir.
    if (this._ghostMeshes) {
      for (var g = 0; g < this._ghostMeshes.length; g++) this._ghostMeshes[g].visible = ghostActive;
    }
    this.env.requestRender();
  };

  VisibilityTool.prototype.hide = function (ids) {
    var self = this;
    (ids || []).forEach(function (id) { self.hidden.add(id); });
    this._refresh();
  };
  VisibilityTool.prototype.show = function (ids) {
    var self = this;
    (ids || []).forEach(function (id) { self.hidden.delete(id); });
    this._refresh();
  };
  VisibilityTool.prototype.isolate = function (ids) {
    this.isolated = (ids && ids.length) ? new Set(ids) : null;
    this._refresh();
  };
  /** Kat gecisi: verilen id'ler (secili kat) opak kalir, kalan tum gorunur
   *  elemanlar saydam "hayalet" kopyada gosterilir (tamamen gizlenmez) -
   *  boylece kullanici digger katlarin konumunu 3B'de referans olarak
   *  gorebilir. ids bos/null verilirse kat modu kapanir (herkes opak). */
  VisibilityTool.prototype.showFloorGhost = function (ids) {
    this.floorIsolated = (ids && ids.length) ? new Set(ids) : null;
    this._refresh();
  };
  VisibilityTool.prototype.showAll = function () {
    this.hidden.clear();
    this.isolated = null;
    this.floorIsolated = null;
    if (this._ghostMeshes) {
      for (var g = 0; g < this._ghostMeshes.length; g++) {
        var gm = this._ghostMeshes[g];
        gm.material.dispose();
        if (gm.parent) gm.parent.remove(gm);
      }
      this._ghostMeshes = null;
    }
    this._refresh();
  };
  VisibilityTool.prototype.setWireframe = function (on) {
    this.wireframe = !!on;
    var self = this;
    this.env.forEachMaterial(function (m) { m.wireframe = self.wireframe; });
    this.env.requestRender();
  };

  /** X-ray: modelin tum malzemelerini yari saydam yapar (secim vurgusu HARIC -
   *  o ayri bir malzemede, depthTest kapali, her zaman ustte cizilir). Orijinal
   *  opacity/transparent/depthWrite degerleri malzeme uzerinde saklanip kapatilinca
   *  geri yuklenir. */
  VisibilityTool.prototype.setXray = function (on) {
    this.xray = !!on;
    var model = this.env.model;
    if (!model) return;
    for (var g = 0; g < model.groups.length; g++) {
      var m = model.groups[g].mesh.material;
      if (this.xray) {
        if (!m.userData._xrayOrig) {
          m.userData._xrayOrig = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        }
        m.transparent = true;
        m.opacity = 0.16;
        m.depthWrite = false;
      } else if (m.userData._xrayOrig) {
        m.opacity = m.userData._xrayOrig.opacity;
        m.transparent = m.userData._xrayOrig.transparent;
        m.depthWrite = m.userData._xrayOrig.depthWrite;
        delete m.userData._xrayOrig;
      }
      m.needsUpdate = true;
    }
    this.env.requestRender();
  };

  /* ---------------- Patlatma (Explode) ---------------- */

  function ExplodeTool(env) {
    this.env = env;
    this.radialFactor = 0;
    this.layerFactors = { x: 0, y: 0, z: 0 };
    this._offsets = null;
    this._layerScalars = null;
  }

  ExplodeTool.prototype._prepare = function () {
    if (this._offsets) return;
    var model = this.env.model;
    var center = model.bbox.getCenter(new THREE.Vector3());
    // root donmus oldugu icin merkezi yerel uzaya cevir
    var invRoot = new THREE.Matrix4().copy(model.root.matrixWorld).invert();
    var localCenter = center.clone().applyMatrix4(invRoot);

    this._offsets = [];
    var m = new THREE.Matrix4();
    var p = new THREE.Vector3();
    for (var g = 0; g < model.groups.length; g++) {
      var group = model.groups[g];
      var arr = new Array(group.base.length);
      for (var i = 0; i < group.base.length; i++) {
        m.copy(group.base[i]);
        p.setFromMatrixPosition(m);
        var sphere = group.mesh.geometry.boundingSphere;
        if (sphere) p.add(sphere.center.clone().applyMatrix4(m).sub(p));
        arr[i] = p.clone().sub(localCenter);
      }
      this._offsets.push(arr);
    }
  };

  /** Katman katman ayirma icin: her ornegin skaler ofseti, ait oldugu katin
   *  siradaki konumuna gore hesaplanir (kat bilgisi yoksa ofset 0 kalir). Eksen
   *  secimi apply() sirasinda uygulandigi icin burada eksenden bagimsizdir. */
  ExplodeTool.prototype._prepareLayerScalars = function () {
    if (this._layerScalars) return;
    var model = this.env.model;
    var order = model.storeyOrder || new Map();
    var elementStorey = model.elementStorey || new Map();
    var count = model.storeys ? model.storeys.length : 0;
    var mid = count > 1 ? (count - 1) / 2 : 0;
    var size = model.bbox.getSize(new THREE.Vector3());
    var gap = Math.max(size.length() / Math.max(count, 1), size.length() * 0.03, 0.3);

    this._layerScalars = [];
    for (var g = 0; g < model.groups.length; g++) {
      var group = model.groups[g];
      var arr = new Array(group.base.length);
      for (var i = 0; i < group.base.length; i++) {
        var storeyId = elementStorey.get(group.expressIDs[i]);
        var idx = (storeyId !== undefined && order.has(storeyId)) ? order.get(storeyId) : mid;
        arr[i] = (idx - mid) * gap;
      }
      this._layerScalars.push(arr);
    }
  };

  /** Radyal patlatma (merkezden disari) faktorunu ayarlar; katman ayirmadan bagimsizdir. */
  ExplodeTool.prototype.setRadial = function (factor) {
    this.radialFactor = factor || 0;
    this._apply();
  };

  /** Tek bir eksenin (x|y|z) katman katman ayirma faktorunu ayarlar; digerlerini
   *  etkilemez, boylece uc eksen ayni anda ve birbirinden bagimsiz calisabilir. */
  ExplodeTool.prototype.setLayer = function (axis, factor) {
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') return;
    this.layerFactors[axis] = factor || 0;
    this._apply();
  };

  ExplodeTool.prototype.reset = function () {
    this.radialFactor = 0;
    this.layerFactors = { x: 0, y: 0, z: 0 };
    this._offsets = null;
    this._layerScalars = null;
  };

  /** Radyal + uc eksendeki bagimsiz katman ofsetlerini her ornek icin toplayip
   *  tek matris cevirmesi olarak uygular; hepsi ayni anda calisabilir. */
  ExplodeTool.prototype._apply = function () {
    var model = this.env.model;
    if (!model) return;
    var needRadial = this.radialFactor !== 0;
    var lf = this.layerFactors;
    var needLayer = lf.x !== 0 || lf.y !== 0 || lf.z !== 0;
    if (needRadial) this._prepare();
    if (needLayer) this._prepareLayerScalars();

    var tmp = new THREE.Matrix4();
    var tr = new THREE.Matrix4();
    for (var g = 0; g < model.groups.length; g++) {
      var group = model.groups[g];
      for (var i = 0; i < group.base.length; i++) {
        if (!group.visibleFlags[i]) continue;
        var ox = 0, oy = 0, oz = 0;
        if (needRadial) {
          var o = this._offsets[g][i];
          ox += o.x * this.radialFactor; oy += o.y * this.radialFactor; oz += o.z * this.radialFactor;
        }
        if (needLayer) {
          var s = this._layerScalars[g][i];
          if (lf.x) ox += s * lf.x;
          if (lf.y) oy += s * lf.y;
          if (lf.z) oz += s * lf.z;
        }
        tr.makeTranslation(ox, oy, oz);
        tmp.multiplyMatrices(tr, group.base[i]);
        group.mesh.setMatrixAt(i, tmp);
      }
      group.mesh.instanceMatrix.needsUpdate = true;
      group.mesh.computeBoundingSphere();
    }
    this.env.requestRender();
  };

  /* ---------------- Olcum (Measure) ---------------- */

  function MeasureTool(env) {
    this.env = env;
    this.mode = 'none';           // none | distance | angle | laser
    this.snapEnabled = true;
    this.unit = 'mm';
    this.pending = [];
    this.items = [];              // { id, kind, points[], value, label, objects[] }
    this.redoStack = [];
    this.group = new THREE.Group();
    this.group.name = 'measurements';
    env.scene.add(this.group);
    this._nextId = 1;

    this.snapDot = document.getElementById('snap');
    this.overlay = document.getElementById('overlay');
    this._labels = new Map();

    // Bekleyen (henuz tamamlanmamis) olcumun gorsel yardimcilari: ilk (ve
    // angle'da ikinci) noktanin kalici noktasi + parmagin/capraz-imlecin
    // su anki konumuna kadar canli "lastik bant" onizleme cizgisi ve degeri.
    this._pendingMarkers = [];
    this._previewLine = null;
    this._previewLabelEl = null;

    // Tamamlanmis bir distance/angle olcumunun ucundaki bir noktayi
    // surukleyerek yeniden konumlandirma durumu - bkz. hitTestPoint/
    // beginEditPoint/updateEditPoint/endEditPoint/cancelEditPoint.
    this._editing = null;
  }

  MeasureTool.prototype.setMode = function (mode) {
    this.mode = mode || 'none';
    this.pending = [];
    this._clearPreview();
    this._clearPendingMarkers();
    this._clearPreviewLine();
    if (this.snapDot) this.snapDot.style.display = 'none';
  };

  /** Yarim kalan (bekleyen) nokta dizisini iptal eder - ör. iki parmakla
   *  dokunarak "basa sar" jesti icin. true dondurur ancak iptal edilecek
   *  bir sey varsa. */
  MeasureTool.prototype.cancelPending = function () {
    if (!this.pending.length) return false;
    this.pending = [];
    this._clearPendingMarkers();
    this._clearPreviewLine();
    this.env.requestRender();
    return true;
  };

  MeasureTool.prototype._addPendingMarker = function (p) {
    var dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    dot.position.copy(p);
    dot.renderOrder = 1000;
    dot.userData.isMeasureDot = true;
    this.group.add(dot);
    this._pendingMarkers.push(dot);
  };

  MeasureTool.prototype._clearPendingMarkers = function () {
    var self = this;
    this._pendingMarkers.forEach(function (d) {
      self.group.remove(d);
      d.geometry.dispose();
      d.material.dispose();
    });
    this._pendingMarkers = [];
  };

  /** Bekleyen olcumun son noktasindan (ya da angle'da ikinci noktasindan)
   *  verilen dunya noktasina kadar canli bir "lastik bant" cizgisi ve
   *  (varsa) o anki degeri gosterir - kullanici parmagini/capraz-imleci
   *  hareket ettirirken sonuc noktayi koymadan ONCE gorulebilir olsun diye. */
  MeasureTool.prototype.previewTo = function (point) {
    if (this.mode === 'laser' || this.mode === 'none' || !this.pending.length || !point) {
      this._clearPreviewLine();
      return;
    }
    var pts, text = null;
    if (this.mode === 'distance') {
      pts = [this.pending[0], point];
      var mm = this.pending[0].distanceTo(point) * this.env.model._lengthScaleToMm;
      text = SOS.util.formatLength(mm, this.unit);
    } else {
      if (this.pending.length === 1) {
        pts = [this.pending[0], point];
      } else {
        var v1 = new THREE.Vector3().subVectors(this.pending[0], this.pending[1]);
        var v2 = new THREE.Vector3().subVectors(point, this.pending[1]);
        var deg = THREE.MathUtils.radToDeg(v1.angleTo(v2));
        pts = [this.pending[1], point];
        text = (Math.round(deg * 10) / 10).toFixed(1) + ' deg';
      }
    }
    this._drawPreview(pts, text);
  };

  MeasureTool.prototype._drawPreview = function (pts, text) {
    if (!this._previewLine) {
      var mat = new THREE.LineDashedMaterial({
        color: 0xffffff, dashSize: 0.06, gapSize: 0.04,
        depthTest: false, transparent: true, opacity: 0.9
      });
      var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this._previewLine = new THREE.Line(geo, mat);
      this._previewLine.renderOrder = 998;
      this.group.add(this._previewLine);
    }
    this._previewLine.material.color.setHex(KIND_COLOR[this.mode] || 0x2563EB);
    this._previewLine.geometry.setFromPoints(pts);
    this._previewLine.computeLineDistances();
    this._previewLine.visible = true;

    if (text) {
      if (!this._previewLabelEl) {
        this._previewLabelEl = document.createElement('div');
        this._previewLabelEl.className = 'label preview';
        this.overlay.appendChild(this._previewLabelEl);
      }
      this._previewLabelEl.textContent = text;
      this._previewLabelEl.style.display = 'block';
      var mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
      var s = this.env.toScreen(mid);
      this._previewLabelEl.style.left = s.x + 'px';
      this._previewLabelEl.style.top = s.y + 'px';
    } else if (this._previewLabelEl) {
      this._previewLabelEl.style.display = 'none';
    }
    this.env.requestRender();
  };

  MeasureTool.prototype._clearPreviewLine = function () {
    if (this._previewLine) this._previewLine.visible = false;
    if (this._previewLabelEl) this._previewLabelEl.style.display = 'none';
  };

  MeasureTool.prototype.setUnit = function (u) { this.unit = u || 'mm'; this._refreshLabels(); };

  /** Revit tarzi manyetik yakalama: sadece vurulan ucgenle sinirli kalmaz,
   *  vurulan noktanin dunya-uzayi yaricapi icindeki TUM ucgenleri tarayip
   *  kose/kenar-orta/yuzey-merkezi adaylarindan ekran uzayinda en yakinini
   *  secer. Boylece bir dikdortgen yuzun iki ucgene bolunmus olmasi ya da
   *  tam kose ucgeninin disina dokunulmasi yakalamayi kacirmaz. */
  /** { point, snapped } dondurur - snapped=true iken point gercek bir
   *  kose/kenar-orta adayidir (crosshair'i o noktaya "kilitlemek" icin
   *  kullanilir, bkz. app.js crosshairShow). snapped=false iken point sadece
   *  ham vurus noktasidir. */
  MeasureTool.prototype._snapCandidate = function (hit) {
    if (!this.snapEnabled || !hit || !hit.face) return { point: hit ? hit.point.clone() : null, snapped: false };

    var mesh = hit.object;
    var geom = mesh.geometry;
    var posAttr = geom.getAttribute('position');
    var index = geom.index;
    if (!posAttr || !index) return { point: hit.point.clone(), snapped: false };

    var m = new THREE.Matrix4();
    if (mesh.isInstancedMesh && hit.instanceId !== undefined && hit.instanceId !== null) {
      mesh.getMatrixAt(hit.instanceId, m);
      m.premultiply(mesh.matrixWorld);
    } else {
      m.copy(mesh.matrixWorld);
    }

    var SNAP_PX = 40;
    var hitScreen = this.env.toScreen(hit.point);
    var scaleAt = this.env.pixelWorldScale()(hit.point);
    var worldRadius = SNAP_PX * scaleAt * 1.8;
    var worldRadiusSq = worldRadius * worldRadius;
    var hitPoint = hit.point;

    var vcache = new Map();
    function vertexAt(idx) {
      var v = vcache.get(idx);
      if (!v) {
        v = new THREE.Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)).applyMatrix4(m);
        vcache.set(idx, v);
      }
      return v;
    }

    var self = this;
    var best = null, bestDist = Infinity;
    function consider(v) {
      if (v.distanceToSquared(hitPoint) > worldRadiusSq) return;
      var s = self.env.toScreen(v);
      var d = Math.hypot(s.x - hitScreen.x, s.y - hitScreen.y);
      if (d < bestDist) { bestDist = d; best = v.clone(); }
    }

    var mid = new THREE.Vector3();
    var count = index.count;
    for (var i = 0; i < count; i += 3) {
      var ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      var a = vertexAt(ia), b = vertexAt(ib), c = vertexAt(ic);
      if (a.distanceToSquared(hitPoint) > worldRadiusSq &&
          b.distanceToSquared(hitPoint) > worldRadiusSq &&
          c.distanceToSquared(hitPoint) > worldRadiusSq) continue;
      consider(a); consider(b); consider(c);
      consider(mid.copy(a).add(b).multiplyScalar(0.5));
      consider(mid.copy(b).add(c).multiplyScalar(0.5));
      consider(mid.copy(c).add(a).multiplyScalar(0.5));
    }

    return (best && bestDist <= SNAP_PX)
      ? { point: best, snapped: true }
      : { point: hit.point.clone(), snapped: false };
  };

  MeasureTool.prototype._snapPoint = function (hit) {
    return this._snapCandidate(hit).point;
  };

  MeasureTool.prototype.hover = function (x, y) {
    if (this.mode === 'none' || !this.snapDot) return;
    var hit = this.env.pick(x, y);
    if (!hit) { this.snapDot.style.display = 'none'; this._clearPreviewLine(); return; }
    var p = this._snapPoint(hit);
    var s = this.env.toScreen(p);
    this.snapDot.style.display = 'block';
    this.snapDot.style.left = s.x + 'px';
    this.snapDot.style.top = s.y + 'px';
    this.previewTo(p);
  };

  MeasureTool.prototype.tap = function (x, y) {
    if (this.mode === 'none') return false;
    var hit = this.env.pick(x, y);
    if (!hit) return false;

    // Lazer: dokunulan noktadan, uzerinde durulan elemanin ayni yuzeyindeki
    // en yakin iki kenara olan mesafeyi "akilli boyutlandirma" gibi cizer.
    // Distance/angle'in aksine ikinci/ucuncu nokta beklemez, tek dokunuşta
    // sonuclanir. Kose/kenara kilitlenmek istenmedigi (olculecek nokta genelde
    // yuzeyin ortasinda bir yerdir) icin ham vurus noktasi kullanilir.
    if (this.mode === 'laser') {
      this._commitLaser(hit);
      this.env.requestRender();
      return true;
    }

    var p = this._snapPoint(hit);

    // Titreyen parmakla ayni noktaya ust uste dokunma -> sifir uzunluklu/
    // gecersiz (NaN acili) bir olcum olusturmasin diye, bir onceki bekleyen
    // noktaya EKRAN uzayinda cok yakinsa yoksayilir (nokta atilmaz).
    if (this.pending.length) {
      var prevScreen = this.env.toScreen(this.pending[this.pending.length - 1]);
      var curScreen = this.env.toScreen(p);
      if (Math.hypot(curScreen.x - prevScreen.x, curScreen.y - prevScreen.y) < 6) return true;
    }

    this.pending.push(p);
    var need = this.mode === 'angle' ? 3 : 2;
    if (this.pending.length >= need) {
      this._commit(this.pending.slice(0, need));
      this.pending = [];
      this._clearPendingMarkers();
      this._clearPreviewLine();
    } else {
      this._addPendingMarker(p);
    }
    this.env.requestRender();
    return true;
  };

  MeasureTool.prototype._commit = function (points) {
    var item = { id: this._nextId++, kind: this.mode, points: points, objects: [] };
    this._recomputeItem(item);
    this._finalize(item);
  };

  /** item.points'ten (distance: 2 nokta, angle: 3 nokta) value/text alanlarini
   *  yeniden hesaplar. Hem ilk olusturmada (_commit) hem de bir ucun
   *  suruklenerek duzenlenmesinden sonra (updateEditPoint) kullanilir. */
  MeasureTool.prototype._recomputeItem = function (item) {
    var points = item.points;
    if (item.kind === 'distance') {
      var mm = points[0].distanceTo(points[1]) * this.env.model._lengthScaleToMm;
      item.value = mm;
      item.text = SOS.util.formatLength(mm, this.unit);
    } else if (item.kind === 'angle') {
      var v1 = new THREE.Vector3().subVectors(points[0], points[1]);
      var v2 = new THREE.Vector3().subVectors(points[2], points[1]);
      var deg = THREE.MathUtils.radToDeg(v1.angleTo(v2));
      item.value = deg;
      item.text = (Math.round(deg * 10) / 10).toFixed(1) + ' deg';
    }
  };

  /** Ekran konumuna (x,y) en yakin, DUZENLENEBILIR (distance/angle) bir
   *  olcum ucunu bulur - lazer olcumleri kendi yuzeyinden turetildigi icin
   *  ucu tek tek surukleyerek anlamli sekilde duzenlenemez, bu yuzden
   *  disarida birakilir. radiusPx icinde hicbir sey yoksa null doner. */
  MeasureTool.prototype.hitTestPoint = function (x, y, radiusPx) {
    var r = radiusPx || 26;
    var best = null, bestDist = r;
    for (var idx = 0; idx < this.items.length; idx++) {
      var item = this.items[idx];
      if (item.kind === 'laser') continue;
      for (var i = 0; i < item.points.length; i++) {
        var s = this.env.toScreen(item.points[i]);
        if (s.z >= 1) continue;
        var d = Math.hypot(s.x - x, s.y - y);
        if (d < bestDist) { bestDist = d; best = { item: item, pointIndex: i }; }
      }
    }
    return best;
  };

  /** ref: hitTestPoint() sonucu ({item, pointIndex}). Surukleme basladiginda
   *  cagrilir, orijinal konumu saklar (cancelEditPoint ile geri donebilmek icin). */
  MeasureTool.prototype.beginEditPoint = function (ref) {
    if (!ref) return;
    this._editing = { item: ref.item, pointIndex: ref.pointIndex, original: ref.item.points[ref.pointIndex].clone() };
  };

  /** Surukleme sirasinda her hareket karesinde cagrilir; (x,y) ekran
   *  konumundaki vurusu (varsa) koseye/kenara yakalayip duzenlenen ucu oraya
   *  tasir ve olcumu aninda yeniden cizer. {point, snapped} ya da (vurus
   *  yoksa) null doner. */
  MeasureTool.prototype.updateEditPoint = function (x, y) {
    var ref = this._editing;
    if (!ref) return null;
    var hit = this.env.pick(x, y);
    if (!hit) return null;
    var cand = this._snapCandidate(hit);
    ref.item.points[ref.pointIndex] = cand.point;
    this._recomputeItem(ref.item);
    this._redrawItem(ref.item);
    this.env.requestRender();
    return cand;
  };

  /** Suruklemeyi degeriyle onaylar (parmak kaldirildi). */
  MeasureTool.prototype.endEditPoint = function () {
    if (!this._editing) return;
    this._editing = null;
    post('measureState', this.state());
  };

  /** Suruklemeyi iptal edip ucu surukleme oncesi konumuna geri getirir
   *  (ör. pointercancel - ikinci parmak/sistem kesintisi). */
  MeasureTool.prototype.cancelEditPoint = function () {
    var ref = this._editing;
    if (!ref) return;
    ref.item.points[ref.pointIndex] = ref.original;
    this._recomputeItem(ref.item);
    this._redrawItem(ref.item);
    this.env.requestRender();
    this._editing = null;
  };

  /** Bir item'in cizimini (dot/line/label) sifirdan yeniler - points/text
   *  degisikliginin sahneye yansimasi icin. id ve items[] uzerindeki konumu
   *  korunur (sadece _remove + _draw cagrilir, array'den cikarilmaz). */
  MeasureTool.prototype._redrawItem = function (item) {
    this._remove(item);
    this._draw(item);
  };

  /** Vurulan noktadan uc olcum cizgisi cikarir - "o yuzeyin X/Y/Z olculeri":
   *  - yuzeyin DUZLEMINDEKI iki eksende, dokunulan ELEMANIN KENDI kutusunun
   *    bir kenarindan karsi kenarina UCTAN UCA mesafe (ör. dosemenin iki
   *    kenar olcusu, tek deger olarak),
   *  - yuzeyin NORMALI boyunca disariya atilan bir isinla sahnedeki bir
   *    SONRAKI yuzeye kadar olan mesafe (ör. dosemeden tavana yukseklik).
   *  Ucu de tek bir item'da toplanir (undo/redo/silme birlikte calisir). */
  MeasureTool.prototype._commitLaser = function (hit) {
    if (!hit.object || !hit.object.geometry || !hit.object.geometry.boundingBox) return;

    // Dokunulan mesh'in KENDI (yerel, donmemis) uzayindaki kutusu kullanilir -
    // dunya uzayindaki eksene-hizali kutu (Box3) donuk/egik elemanlarda
    // yuzeyin gercek kenarlarini temsil etmez, bu da cizgilerin yuzeye gore
    // çapraz gorunmesine yol acardi. Instance/world matrisiyle donusum,
    // hesabin SONUNDA uygulanir; boylece cizgiler elemanin kendi eksenleriyle
    // (donmus olsa da) hizali kalir.
    var m = new THREE.Matrix4();
    if (hit.object.isInstancedMesh && hit.instanceId !== undefined && hit.instanceId !== null) {
      hit.object.getMatrixAt(hit.instanceId, m);
      m.premultiply(hit.object.matrixWorld);
    } else {
      m.copy(hit.object.matrixWorld);
    }
    var mInv = new THREE.Matrix4().copy(m).invert();

    var origin = hit.point.clone();
    var localOrigin = origin.clone().applyMatrix4(mInv);

    var localNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    var worldNormal = localNormal.clone().transformDirection(m).normalize();

    // Normale en yakin (baskin) eksen disinda kalan iki eksen, yuzeyin
    // duzlemini olusturur - kenar cizgileri bu iki eksende cizilir.
    var ax = Math.abs(localNormal.x), ay = Math.abs(localNormal.y), az = Math.abs(localNormal.z);
    var dominant = (ax >= ay && ax >= az) ? 'x' : (ay >= az ? 'y' : 'z');
    var inPlane = ['x', 'y', 'z'].filter(function (a) { return a !== dominant; });

    var box = hit.object.geometry.boundingBox;
    var self = this;
    var scale = this.env.model._lengthScaleToMm;
    var EPS = 1e-6;
    var segments = [];

    // Her yuzey-ici eksende, elemanin kutusunun bir kenarindan karsi
    // kenarina kadar UCTAN UCA tek bir mesafe cizilir (origin sadece bu
    // cizginin uzerinde bir noktadir, ayri ayri iki yariya bolunmez).
    inPlane.forEach(function (axis) {
      var toMin = localOrigin[axis] - box.min[axis];
      var toMax = box.max[axis] - localOrigin[axis];
      var total = toMin + toMax;
      if (total < EPS) return;
      var minLocal = localOrigin.clone(); minLocal[axis] = box.min[axis];
      var maxLocal = localOrigin.clone(); maxLocal[axis] = box.max[axis];
      var minWorld = minLocal.applyMatrix4(m);
      var maxWorld = maxLocal.applyMatrix4(m);
      var mm = minWorld.distanceTo(maxWorld) * scale;
      segments.push({
        axis: axis, spansEdge: true, points: [minWorld, maxWorld],
        value: mm, text: SOS.util.formatLength(mm, self.unit)
      });
    });

    var normalHit = this.env.pickAlongRay(origin, worldNormal, hit.object, hit.instanceId);
    if (normalHit) {
      var dist2 = origin.distanceTo(normalHit.point);
      if (dist2 >= EPS) {
        var mm2 = dist2 * scale;
        segments.push({
          axis: dominant, points: [origin, normalHit.point.clone()],
          value: mm2, text: SOS.util.formatLength(mm2, this.unit)
        });
      }
    }
    if (!segments.length) return;

    var item = {
      id: this._nextId++,
      kind: 'laser',
      points: [origin].concat(segments.map(function (s) { return s.points[1]; })),
      segments: segments,
      value: segments[0].value,
      text: segments.map(function (s) { return s.text; }).join('  •  '),
      objects: []
    };
    this._finalize(item);
  };

  MeasureTool.prototype._finalize = function (item) {
    this._draw(item);
    this.items.push(item);
    this.redoStack = [];
    post('measurement', this._serialize(item));
    post('measureState', this.state());
  };

  var KIND_COLOR = { distance: 0x2563EB, angle: 0xD97706, laser: 0xEF4444 };
  var LABEL_CLASS = { distance: 'dist', angle: 'angle', laser: 'laser' };
  // X/Y/Z eksen renkleri - DisplaySheet.js'deki katman-ayirma eksen renkleriyle
  // (AXIS_COLORS) aynidir, boylece "hangi cizgi hangi eksen" tum uygulamada
  // tutarlidir.
  var AXIS_COLOR = { x: 0xD9534F, y: 0x4C9F4C, z: 0x4C6FE0 };
  var AXIS_LABEL_BG = { x: 'rgba(217,83,79,.92)', y: 'rgba(76,159,76,.92)', z: 'rgba(76,111,224,.92)' };

  /** item.segments varsa (lazer) her segment kendi cizgi+etiketiyle cizilir,
   *  hepsi tek bir ortak baslangic noktasini (item.points[0]) paylasir; her
   *  segment kendi ekseninin rengini alir (X/Y/Z). Yoksa (distance/angle) tum
   *  item.points tek renkte tek bir cizgi olarak cizilir. */
  MeasureTool.prototype._draw = function (item) {
    var self = this;
    var color = KIND_COLOR[item.kind] || 0x2563EB;
    var sphereGeo = new THREE.SphereGeometry(1, 10, 8);
    var segments = item.segments || [{ points: item.points, text: item.text }];
    var labelEntries = [];

    if (item.segments) {
      var originDot = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      originDot.position.copy(item.points[0]);
      originDot.renderOrder = 1000;
      originDot.userData.isMeasureDot = true;
      this.group.add(originDot);
      item.objects.push(originDot);
    }

    segments.forEach(function (seg) {
      var segColor = (item.kind === 'laser' && AXIS_COLOR[seg.axis] !== undefined) ? AXIS_COLOR[seg.axis] : color;
      var mat = new THREE.LineBasicMaterial({ color: segColor, depthTest: false, transparent: true });
      var geo = new THREE.BufferGeometry().setFromPoints(seg.points);
      var line = new THREE.Line(geo, mat);
      line.renderOrder = 999;
      self.group.add(line);
      item.objects.push(line);

      // Lazer'de yukseklik segmenti origin'i paylasir (yukarda zaten
      // isaretlendi); kenardan-kenara (spansEdge) segmentlerde iki uc da
      // origin degildir, ikisine de nokta konur.
      var dotStart = (item.segments && !seg.spansEdge) ? 1 : 0;
      for (var i = dotStart; i < seg.points.length; i++) {
        var dot = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: segColor, depthTest: false }));
        dot.position.copy(seg.points[i]);
        dot.renderOrder = 1000;
        dot.userData.isMeasureDot = true;
        self.group.add(dot);
        item.objects.push(dot);
      }

      var el = document.createElement('div');
      el.className = 'label ' + (LABEL_CLASS[item.kind] || 'dist');
      if (item.kind === 'laser' && AXIS_LABEL_BG[seg.axis]) el.style.background = AXIS_LABEL_BG[seg.axis];
      el.textContent = seg.text;
      self.overlay.appendChild(el);
      labelEntries.push({ el: el, points: seg.points, mid: seg.spansEdge });
    });

    this._labels.set(item.id, labelEntries);
  };

  /** Nokta etiketlerini ve nokta boyutlarini her karede guncelle. */
  MeasureTool.prototype.update = function () {
    var self = this;
    var camera = this.env.camera;
    var scale = this.env.pixelWorldScale();

    this.group.children.forEach(function (o) {
      if (o.userData.isMeasureDot) {
        var s = scale(o.position) * 4;
        o.scale.setScalar(Math.max(s, 1e-4));
      }
    });

    this.items.forEach(function (item) {
      var entries = self._labels.get(item.id);
      if (!entries) return;
      entries.forEach(function (entry) {
        var pts = entry.points;
        var mid;
        if (item.kind === 'angle') mid = pts[1].clone();
        // "Toplam" etiketi iki kenar noktasi arasindaki tam ortada durur.
        else if (entry.mid) mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
        // Lazer'de pts[0] ortak baslangic noktasi - etiket tam ortada degil,
        // hedef kenara yakin konumlandirilir (ortadaki nokta baslangica cok
        // yakinsa iki segmentin etiketleri ustuste binebilir).
        else if (item.kind === 'laser') mid = pts[1].clone().lerp(pts[0], 0.12);
        else mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
        var s = self.env.toScreen(mid);
        var visible = s.z < 1;
        entry.el.style.display = visible ? 'block' : 'none';
        entry.el.style.left = s.x + 'px';
        entry.el.style.top = s.y + 'px';
      });
    });
  };

  MeasureTool.prototype._refreshLabels = function () {
    var self = this;
    this.items.forEach(function (item) {
      var entries = self._labels.get(item.id);
      if (item.kind === 'distance') {
        item.text = SOS.util.formatLength(item.value, self.unit);
        if (entries && entries[0]) entries[0].el.textContent = item.text;
      } else if (item.kind === 'laser') {
        item.segments.forEach(function (seg, i) {
          seg.text = SOS.util.formatLength(seg.value, self.unit);
          if (entries && entries[i]) entries[i].el.textContent = seg.text;
        });
        item.text = item.segments.map(function (s) { return s.text; }).join('  •  ');
      }
    });
  };

  MeasureTool.prototype._remove = function (item) {
    var self = this;
    item.objects.forEach(function (o) {
      self.group.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    item.objects = [];
    var entries = this._labels.get(item.id);
    if (entries) {
      entries.forEach(function (entry) {
        if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
      });
    }
    this._labels.delete(item.id);
  };

  MeasureTool.prototype._clearPreview = function () { this.pending = []; };

  MeasureTool.prototype.undo = function () {
    var item = this.items.pop();
    if (!item) return;
    this._remove(item);           // objects/label DOM temizlenir, item.objects = []
    this.redoStack.push(item);    // ayni item (points/segments/value/text/id korunur)
    this.env.requestRender();
    post('measureState', this.state());
  };

  /** Silinen olcumu AYNI id, deger ve (varsa) lazer segmentleriyle geri getirir -
   *  distance/angle icin oldugu gibi points'ten yeniden hesaplamaya (ki lazer'de
   *  bu, kaybolmus olabilecek bir raycast vurusu gerektirirdi) gerek kalmaz. */
  MeasureTool.prototype.redo = function () {
    var item = this.redoStack.pop();
    if (!item) return;
    item.objects = [];
    this._draw(item);
    this.items.push(item);
    post('measurement', this._serialize(item));
    post('measureState', this.state());
    this.env.requestRender();
  };

  MeasureTool.prototype.clear = function () {
    var self = this;
    this.items.slice().forEach(function (i) { self._remove(i); });
    this.items = [];
    this.redoStack = [];
    this.pending = [];
    this._clearPendingMarkers();
    this._clearPreviewLine();
    this.env.requestRender();
    post('measureState', this.state());
  };

  MeasureTool.prototype._serialize = function (item) {
    return {
      id: item.id, kind: item.kind, value: item.value, text: item.text,
      points: item.points.map(function (p) { return [p.x, p.y, p.z]; })
    };
  };

  MeasureTool.prototype.state = function () {
    var self = this;
    return {
      canUndo: this.items.length > 0,
      canRedo: this.redoStack.length > 0,
      items: this.items.map(function (i) { return self._serialize(i); })
    };
  };

  SOS.SectionTool = SectionTool;
  SOS.VisibilityTool = VisibilityTool;
  SOS.ExplodeTool = ExplodeTool;
  SOS.MeasureTool = MeasureTool;
})(window.SOS);
