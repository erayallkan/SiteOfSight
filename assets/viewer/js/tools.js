/* Goruntuleme ve olcum araclari: kesit, gizle/izole, tel kafes, patlatma, olcum (snap + undo/redo) */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  var post = SOS.bridge.post;
  var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

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

  function VisibilityTool(env) {
    this.env = env;
    this.hidden = new Set();
    this.isolated = null;
    this.wireframe = false;
  }

  VisibilityTool.prototype._setInstance = function (ref, visible) {
    var model = this.env.model;
    var g = model.groups[ref.g];
    if (!g) return;
    g.mesh.setMatrixAt(ref.i, visible ? g.base[ref.i] : ZERO);
    g.visibleFlags[ref.i] = visible ? 1 : 0;
    g.mesh.instanceMatrix.needsUpdate = true;
  };

  VisibilityTool.prototype._refresh = function () {
    var model = this.env.model;
    if (!model) return;
    var self = this;
    model.elementIndex.forEach(function (refs, id) {
      var visible = !self.hidden.has(id) && (!self.isolated || self.isolated.has(id));
      for (var i = 0; i < refs.length; i++) self._setInstance(refs[i], visible);
    });
    for (var g = 0; g < model.groups.length; g++) model.groups[g].mesh.computeBoundingSphere();
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
  VisibilityTool.prototype.showAll = function () {
    this.hidden.clear();
    this.isolated = null;
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
  }

  MeasureTool.prototype.setMode = function (mode) {
    this.mode = mode || 'none';
    this.pending = [];
    this._clearPreview();
    if (this.snapDot) this.snapDot.style.display = 'none';
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
    if (!hit) { this.snapDot.style.display = 'none'; return; }
    var p = this._snapPoint(hit);
    var s = this.env.toScreen(p);
    this.snapDot.style.display = 'block';
    this.snapDot.style.left = s.x + 'px';
    this.snapDot.style.top = s.y + 'px';
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
    this.pending.push(p);
    var need = this.mode === 'angle' ? 3 : 2;
    if (this.pending.length >= need) {
      this._commit(this.pending.slice(0, need));
      this.pending = [];
    }
    this.env.requestRender();
    return true;
  };

  MeasureTool.prototype._commit = function (points) {
    var item = { id: this._nextId++, kind: this.mode, points: points, objects: [] };

    if (this.mode === 'distance') {
      var mm = points[0].distanceTo(points[1]) * this.env.model._lengthScaleToMm;
      item.value = mm;
      item.text = SOS.util.formatLength(mm, this.unit);
    } else {
      var v1 = new THREE.Vector3().subVectors(points[0], points[1]);
      var v2 = new THREE.Vector3().subVectors(points[2], points[1]);
      var deg = THREE.MathUtils.radToDeg(v1.angleTo(v2));
      item.value = deg;
      item.text = (Math.round(deg * 10) / 10).toFixed(1) + ' deg';
    }

    this._finalize(item);
  };

  /** Vurulan noktadan uc olcum cizgisi cikarir - "o yuzeyin X/Y/Z olculeri":
   *  - yuzeyin DUZLEMINDEKI iki eksende, dokunulan ELEMANIN KENDI kutusunun
   *    en yakin kenarina olan mesafe (ör. dosemenin iki kenar olcusu),
   *  - yuzeyin NORMALI boyunca disariya atilan bir isinla sahnedeki bir
   *    SONRAKI yuzeye kadar olan mesafe (ör. dosemeden tavana yukseklik).
   *  Ucu de tek bir item'da toplanir (undo/redo/silme birlikte calisir). */
  MeasureTool.prototype._commitLaser = function (hit) {
    var model = this.env.model;
    var box = (model && hit.expressID != null) ? model.getElementBox(hit.expressID) : null;
    if (!box) return;

    var origin = hit.point.clone();

    var normal = new THREE.Vector3(0, 1, 0);
    if (hit.face) {
      var m = new THREE.Matrix4();
      if (hit.object.isInstancedMesh && hit.instanceId !== undefined && hit.instanceId !== null) {
        hit.object.getMatrixAt(hit.instanceId, m);
        m.premultiply(hit.object.matrixWorld);
      } else {
        m.copy(hit.object.matrixWorld);
      }
      normal.copy(hit.face.normal).transformDirection(m).normalize();
    }

    // Normale en yakin (baskin) eksen disinda kalan iki eksen, yuzeyin
    // duzlemini olusturur - kenar cizgileri bu iki eksende cizilir.
    var ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
    var dominant = (ax >= ay && ax >= az) ? 'x' : (ay >= az ? 'y' : 'z');
    var inPlane = ['x', 'y', 'z'].filter(function (a) { return a !== dominant; });

    var self = this;
    var scale = this.env.model._lengthScaleToMm;
    var EPS = 1e-6;
    var segments = [];

    inPlane.forEach(function (axis) {
      var toMin = origin[axis] - box.min[axis];
      var toMax = box.max[axis] - origin[axis];
      var useMin = toMin <= toMax;
      var dist = useMin ? toMin : toMax;
      if (dist < EPS) return; // zaten bu kenarin ustunde
      var target = origin.clone();
      target[axis] = useMin ? box.min[axis] : box.max[axis];
      var mm = dist * scale;
      segments.push({ axis: axis, points: [origin, target], value: mm, text: SOS.util.formatLength(mm, self.unit) });
    });

    var normalHit = this.env.pickAlongRay(origin, normal, hit.object, hit.instanceId);
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

      // Lazer'de ortak baslangic noktasi yukarda zaten isaretlendi.
      var dotStart = item.segments ? 1 : 0;
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
      labelEntries.push({ el: el, points: seg.points });
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
