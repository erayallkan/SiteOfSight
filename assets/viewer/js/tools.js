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

  SectionTool.prototype._apply = function () {
    var list = [];
    var self = this;
    ['x', 'y', 'z'].forEach(function (a) { if (self.active[a]) list.push(self.planes[a]); });
    this.enabled = list.length > 0;
    this.env.renderer.localClippingEnabled = this.enabled;
    this.env.forEachMaterial(function (m) {
      m.clippingPlanes = list.length ? list : null;
      m.clipShadows = false;
      m.needsUpdate = true;
    });
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
    this.active[axis] = { t: t, flipped: !!flipped };
    this._apply();
  };

  SectionTool.prototype.clear = function (axis) {
    if (axis) delete this.active[axis];
    else this.active = {};
    this._apply();
  };

  /* ---------------- Gorunurluk ---------------- */

  function VisibilityTool(env) {
    this.env = env;
    this.hidden = new Set();
    this.isolated = null;
    this.wireframe = false;
    this.colorByType = false;
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
  VisibilityTool.prototype.setColorByType = function (on) {
    this.colorByType = !!on;
    var model = this.env.model;
    if (!model) return;
    for (var i = 0; i < model.groups.length; i++) {
      var g = model.groups[i];
      if (on) {
        var t = model.typeOfElement.get(g.expressIDs[0]);
        g.mesh.material.color.setHex(SOS.util.typeColor(t));
      } else {
        g.mesh.material.color.setHex(g.baseColor);
      }
    }
    this.env.requestRender();
  };

  /* ---------------- Patlatma (Explode) ---------------- */

  function ExplodeTool(env) {
    this.env = env;
    this.factor = 0;
    this._offsets = null;
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

  ExplodeTool.prototype.set = function (factor) {
    var model = this.env.model;
    if (!model) return;
    this._prepare();
    this.factor = factor;
    var tmp = new THREE.Matrix4();
    var tr = new THREE.Matrix4();
    for (var g = 0; g < model.groups.length; g++) {
      var group = model.groups[g];
      for (var i = 0; i < group.base.length; i++) {
        if (!group.visibleFlags[i]) continue;
        var off = this._offsets[g][i];
        tr.makeTranslation(off.x * factor, off.y * factor, off.z * factor);
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
    this.mode = 'none';           // none | distance | angle
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

  MeasureTool.prototype.setSnap = function (on) { this.snapEnabled = !!on; };
  MeasureTool.prototype.setUnit = function (u) { this.unit = u || 'mm'; this._refreshLabels(); };

  /** Vurulan ucgenden kose / kenar ortasi / yuzey merkezi adaylari uret. */
  MeasureTool.prototype._snapPoint = function (hit) {
    if (!this.snapEnabled || !hit || !hit.face) return hit ? hit.point.clone() : null;

    var mesh = hit.object;
    var geom = mesh.geometry;
    var posAttr = geom.getAttribute('position');
    if (!posAttr) return hit.point.clone();

    var m = new THREE.Matrix4();
    if (mesh.isInstancedMesh && hit.instanceId !== undefined && hit.instanceId !== null) {
      mesh.getMatrixAt(hit.instanceId, m);
      m.premultiply(mesh.matrixWorld);
    } else {
      m.copy(mesh.matrixWorld);
    }

    function vertex(index) {
      return new THREE.Vector3(posAttr.getX(index), posAttr.getY(index), posAttr.getZ(index)).applyMatrix4(m);
    }
    var a = vertex(hit.face.a), b = vertex(hit.face.b), c = vertex(hit.face.c);

    var candidates = [
      a, b, c,
      a.clone().add(b).multiplyScalar(0.5),
      b.clone().add(c).multiplyScalar(0.5),
      c.clone().add(a).multiplyScalar(0.5),
      a.clone().add(b).add(c).multiplyScalar(1 / 3)
    ];

    var hitScreen = this.env.toScreen(hit.point);
    var best = null, bestDist = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var s = this.env.toScreen(candidates[i]);
      var d = Math.hypot(s.x - hitScreen.x, s.y - hitScreen.y);
      if (d < bestDist) { bestDist = d; best = candidates[i]; }
    }
    return bestDist <= 34 ? best : hit.point.clone();
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

    this._draw(item);
    this.items.push(item);
    this.redoStack = [];
    post('measurement', this._serialize(item));
    post('measureState', this.state());
  };

  MeasureTool.prototype._draw = function (item) {
    var color = item.kind === 'distance' ? 0x2563EB : 0xD97706;
    var mat = new THREE.LineBasicMaterial({ color: color, depthTest: false, transparent: true });
    var geo = new THREE.BufferGeometry().setFromPoints(item.points);
    var line = new THREE.Line(geo, mat);
    line.renderOrder = 999;
    this.group.add(line);
    item.objects.push(line);

    var sphereGeo = new THREE.SphereGeometry(1, 10, 8);
    for (var i = 0; i < item.points.length; i++) {
      var dot = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: color, depthTest: false }));
      dot.position.copy(item.points[i]);
      dot.renderOrder = 1000;
      dot.userData.isMeasureDot = true;
      this.group.add(dot);
      item.objects.push(dot);
    }

    var el = document.createElement('div');
    el.className = 'label ' + (item.kind === 'distance' ? 'dist' : 'angle');
    el.textContent = item.text;
    this.overlay.appendChild(el);
    this._labels.set(item.id, el);
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
      var el = self._labels.get(item.id);
      if (!el) return;
      var mid = item.kind === 'angle'
        ? item.points[1].clone()
        : item.points[0].clone().add(item.points[1]).multiplyScalar(0.5);
      var s = self.env.toScreen(mid);
      var visible = s.z < 1;
      el.style.display = visible ? 'block' : 'none';
      el.style.left = s.x + 'px';
      el.style.top = s.y + 'px';
    });
  };

  MeasureTool.prototype._refreshLabels = function () {
    var self = this;
    this.items.forEach(function (item) {
      if (item.kind !== 'distance') return;
      item.text = SOS.util.formatLength(item.value, self.unit);
      var el = self._labels.get(item.id);
      if (el) el.textContent = item.text;
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
    var el = this._labels.get(item.id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    this._labels.delete(item.id);
  };

  MeasureTool.prototype._clearPreview = function () { this.pending = []; };

  MeasureTool.prototype.undo = function () {
    var item = this.items.pop();
    if (!item) return;
    this._remove(item);
    this.redoStack.push({ kind: item.kind, points: item.points });
    this.env.requestRender();
    post('measureState', this.state());
  };

  MeasureTool.prototype.redo = function () {
    var snap = this.redoStack.pop();
    if (!snap) return;
    var prevMode = this.mode;
    this.mode = snap.kind;
    this._commit(snap.points);
    this.mode = prevMode;
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
