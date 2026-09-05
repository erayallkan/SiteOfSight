/* IFC yukleme: web-ifc (WASM) -> three.js InstancedMesh gruplari + buildingSMART agaci */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  var post = SOS.bridge.post;

  function yieldFrame() {
    return new Promise(function (r) { setTimeout(r, 0); });
  }

  function val(x) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'object' && 'value' in x) return x.value;
    return x;
  }

  function IFCModel() {
    this.api = null;
    this.modelID = -1;
    this.root = new THREE.Group();
    // NOT: web-ifc geometriyi zaten Y-up olarak dondurur (dogrulandi: ornek modelde
    // yukseklik ekseni Y'de gelir). Burada ek bir Z-up -> Y-up dondurmesi YAPILMAZ,
    // yoksa model bas asagi durur.
    this.groups = [];               // { mesh, expressIDs[], base: Matrix4[] }
    this.elementIndex = new Map();  // expressID -> [{g,i}]
    this.typeNames = {};
    this.typeOfElement = new Map();
    this.elementStorey = new Map();  // expressID -> storey expressID
    this.storeys = [];               // storey expressID'leri, yukseklige gore sirali
    this.storeyOrder = new Map();    // storey expressID -> sira indeksi
    this.storeysInfo = [];           // [{ id, name }], storeys ile ayni sira - kat gecisi UI'si icin
    this.storeyElements = new Map(); // storey expressID -> [eleman expressID, ...] - kat gecisi icin
    this.storeyElevations = new Map(); // storey expressID -> IFCBUILDINGSTOREY.Elevation (dunya birimi, metre)
    this.tree = null;
    this.stats = { elements: 0, triangles: 0, groups: 0, ms: 0 };
    this.bbox = new THREE.Box3();
    this._psetIndex = null;
    this._materialIndex = null;
    this._propCache = new Map();
    // dunya birimi -> mm. web-ifc, dosyanin bildirdigi birim ne olursa olsun
    // (mm, cm, inch...) geometriyi HER ZAMAN metreye normalize ederek dondurur
    // (dogrulandi: mm birimli bir dosyadaki 2700/3000/6000 gibi ham koordinatlar
    // THREE.js tarafinda 2.7/3/6 olarak gelir). Bu yuzden sabit 1000'dir; dosyanin
    // IFCSIUNIT birim/prefix'ini okuyup buna gore degistirmek YANLIS olur - eskiden
    // boyle yapiliyordu ve mm birimli dosyalarda (ör. Revit disa aktarimlari)
    // yurume modunda goz yuksekligi 1000 kat buyuyup kullaniciyi havada birakiyordu.
    this._lengthScaleToMm = 1000;
  }

  /* ---------------- WASM baslatma ---------------- */

  IFCModel.prototype.init = async function (wasmBytes, opts) {
    if (typeof WebIFC === 'undefined') {
      throw new Error('web-ifc yuklenemedi (vendor eksik). "npm run vendor" calistirin.');
    }
    this.api = new WebIFC.IfcAPI();

    if (wasmBytes && wasmBytes.length) {
      // WASM ikilisi RN tarafindan aktarildi -> blob URL ile besle.
      // file:// altinda fetch/XHR guvenilir degil; blob URL iki platformda da calisir.
      var blobUrl = URL.createObjectURL(new Blob([wasmBytes], { type: 'application/wasm' }));
      await this.api.Init(function (fileName, prefix) {
        if (String(fileName).indexOf('.wasm') >= 0) return blobUrl;
        return (prefix || '') + fileName;
      });
    } else {
      // Node testleri / gelistirme icin dosya sisteminden yukleme yolu
      var path = (opts && opts.path) || './vendor/';
      var absolute = !!(opts && opts.absolute);
      this.api.SetWasmPath(path, absolute);
      await this.api.Init();
    }

    this.typeNames = this._buildTypeNames();
    post('log', { message: 'web-ifc hazir' });
  };

  IFCModel.prototype._buildTypeNames = function () {
    var map = {};
    for (var k in WebIFC) {
      if (typeof WebIFC[k] === 'number' && /^IFC[A-Z0-9_]+$/.test(k)) {
        if (map[WebIFC[k]] === undefined) map[WebIFC[k]] = k;
      }
    }
    return map;
  };

  IFCModel.prototype.typeName = function (code) {
    if (this.api && typeof this.api.GetNameFromTypeCode === 'function') {
      // web-ifc 'IfcWall' dondurur; tum uygulamada IFCWALL bicimini kullaniyoruz
      try { var n = this.api.GetNameFromTypeCode(code); if (n) return String(n).toUpperCase(); } catch (e) {}
    }
    return this.typeNames[code] || ('TYPE_' + code);
  };

  /* ---------------- Model acma ---------------- */

  IFCModel.prototype.open = async function (bytes) {
    var t0 = Date.now();
    post('progress', { phase: 'parse', percent: 5 });
    await yieldFrame();

    this.modelID = this.api.OpenModel(bytes, {
      COORDINATE_TO_ORIGIN: true,
      USE_FAST_BOOLS: true
    });
    if (this.modelID < 0) {
      throw new Error('IFC dosyasi acilamadi (gecersiz veya desteklenmeyen surum).');
    }

    post('progress', { phase: 'geometry', percent: 20 });
    await yieldFrame();
    await this._buildGeometry();

    post('progress', { phase: 'tree', percent: 85 });
    await yieldFrame();
    this.tree = this._buildSpatialTree();

    post('progress', { phase: 'done', percent: 100 });
    this.stats.ms = Date.now() - t0;
    return this.stats;
  };

  IFCModel.prototype._buildGeometry = async function () {
    var self = this;
    var api = this.api;
    var modelID = this.modelID;

    var geomCache = new Map();   // geometryExpressID -> BufferGeometry | null
    var buckets = new Map();     // key -> { geomId, color, opacity, matrices[], ids[] }
    var meshCount = 0;
    var triangles = 0;
    var elements = new Set();

    api.StreamAllMeshes(modelID, function (flatMesh) {
      var placed = flatMesh.geometries;
      var expressID = flatMesh.expressID;
      elements.add(expressID);

      for (var i = 0; i < placed.size(); i++) {
        var pg = placed.get(i);
        var gid = pg.geometryExpressID;

        var geom = geomCache.get(gid);
        if (geom === undefined) {
          var raw = api.GetGeometry(modelID, gid);
          var vSize = raw.GetVertexDataSize();
          var iSize = raw.GetIndexDataSize();
          if (vSize > 0 && iSize > 0) {
            // wasm heap uzerindeki view'lar kopyalanmadan saklanamaz
            var verts = new Float32Array(api.GetVertexArray(raw.GetVertexData(), vSize));
            var idx = new Uint32Array(api.GetIndexArray(raw.GetIndexData(), iSize));
            var interleaved = new THREE.InterleavedBuffer(verts, 6);
            geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
            geom.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3));
            geom.setIndex(new THREE.BufferAttribute(idx, 1));
            geom.computeBoundingSphere();
            geom.computeBoundingBox();
          } else {
            geom = null;
          }
          raw.delete();
          geomCache.set(gid, geom);
        }
        if (!geom) continue;

        var c = pg.color;
        var opacity = (c.w === undefined || c.w === null) ? 1 : c.w;
        var colorHex = (Math.round(c.x * 255) << 16) | (Math.round(c.y * 255) << 8) | Math.round(c.z * 255);
        var key = gid + '|' + colorHex + '|' + Math.round(opacity * 100);

        var bucket = buckets.get(key);
        if (!bucket) {
          bucket = { geomId: gid, color: colorHex, opacity: opacity, matrices: [], ids: [] };
          buckets.set(key, bucket);
        }
        bucket.matrices.push(new THREE.Matrix4().fromArray(pg.flatTransformation));
        bucket.ids.push(expressID);

        triangles += geom.index.count / 3;
        meshCount++;
        if (meshCount % 1000 === 0) post('progress', { phase: 'geometry', count: meshCount });
      }
    });

    // Bucket -> InstancedMesh (ayni geometri + ayni malzeme = tek draw call)
    var keys = Array.from(buckets.keys());
    for (var k = 0; k < keys.length; k++) {
      var b = buckets.get(keys[k]);
      var geometry = geomCache.get(b.geomId);
      if (!geometry) continue;

      var material = new THREE.MeshLambertMaterial({
        color: b.color,
        transparent: b.opacity < 0.999,
        opacity: b.opacity,
        side: THREE.DoubleSide,
        depthWrite: b.opacity > 0.95
      });

      var mesh = new THREE.InstancedMesh(geometry, material, b.matrices.length);
      mesh.frustumCulled = true;
      for (var i2 = 0; i2 < b.matrices.length; i2++) mesh.setMatrixAt(i2, b.matrices[i2]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.groupIndex = self.groups.length;
      mesh.computeBoundingSphere();

      var group = {
        mesh: mesh,
        expressIDs: b.ids,
        base: b.matrices,
        baseColor: b.color,
        visibleFlags: new Uint8Array(b.matrices.length).fill(1)
      };
      self.groups.push(group);
      self.root.add(mesh);

      for (var i3 = 0; i3 < b.ids.length; i3++) {
        var list = self.elementIndex.get(b.ids[i3]);
        if (!list) { list = []; self.elementIndex.set(b.ids[i3], list); }
        list.push({ g: mesh.userData.groupIndex, i: i3 });
      }

      if (k % 40 === 0) {
        post('progress', { phase: 'build', percent: 20 + Math.round(65 * k / keys.length) });
        await yieldFrame();
      }
    }

    // Eleman tipleri (Tip sekmesi + tipe gore renklendirme)
    elements.forEach(function (id) {
      try { self.typeOfElement.set(id, self.typeName(api.GetLineType(modelID, id))); }
      catch (e) { self.typeOfElement.set(id, 'IFCPRODUCT'); }
    });

    this.stats.elements = elements.size;
    this.stats.triangles = triangles;
    this.stats.groups = this.groups.length;
    this.bbox.setFromObject(this.root);

    if (this.groups.length === 0) {
      throw new Error('Dosyada goruntulenebilir geometri bulunamadi.');
    }
  };

  /* ---------------- Mekansal agac ---------------- */

  IFCModel.prototype._buildSpatialTree = function () {
    var api = this.api, modelID = this.modelID, self = this;

    function idsOf(typeCode) {
      var out = [];
      try {
        var v = api.GetLineIDsWithType(modelID, typeCode);
        for (var i = 0; i < v.size(); i++) out.push(v.get(i));
      } catch (e) {}
      return out;
    }

    var childrenOf = new Map();
    function addChild(parent, child) {
      var l = childrenOf.get(parent);
      if (!l) { l = []; childrenOf.set(parent, l); }
      l.push(child);
    }

    idsOf(WebIFC.IFCRELAGGREGATES).forEach(function (rid) {
      var rel = api.GetLine(modelID, rid, false);
      var p = val(rel.RelatingObject);
      var kids = rel.RelatedObjects || [];
      for (var i = 0; i < kids.length; i++) addChild(p, val(kids[i]));
    });
    // Kat (storey) -> eleman iliskisi: hem agac hem de "katman katman ayirma"
    // patlatma modu icin elementStorey haritasinda ayrica saklanir.
    var elementStorey = new Map();
    var storeyElements = new Map();
    idsOf(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE).forEach(function (rid) {
      var rel = api.GetLine(modelID, rid, false);
      var p = val(rel.RelatingStructure);
      var kids = rel.RelatedElements || [];
      for (var i = 0; i < kids.length; i++) {
        var kid = val(kids[i]);
        addChild(p, kid);
        elementStorey.set(kid, p);
        var list = storeyElements.get(p);
        if (!list) { list = []; storeyElements.set(p, list); }
        list.push(kid);
      }
    });
    this.elementStorey = elementStorey;
    this.storeyElements = storeyElements;

    // Katlari yukseklige (Elevation) gore siralayip patlatma icin bir sira indeksi ata
    var storeyIds = idsOf(WebIFC.IFCBUILDINGSTOREY);
    var storeyElevation = storeyIds.map(function (sid) {
      var elev = 0, name = null;
      try {
        var line = api.GetLine(modelID, sid, false);
        var e = val(line.Elevation);
        if (typeof e === 'number') elev = e;
        name = val(line.Name) || val(line.LongName) || null;
      } catch (e) {}
      return { id: sid, elevation: elev, name: name };
    }).sort(function (a, b) { return a.elevation - b.elevation; });
    this.storeys = storeyElevation.map(function (s) { return s.id; });
    this.storeysInfo = storeyElevation.map(function (s, idx) {
      return { id: s.id, name: s.name || ('Kat ' + (idx + 1)), elementCount: (storeyElements.get(s.id) || []).length };
    });
    this.storeyOrder = new Map();
    storeyElevation.forEach(function (s, idx) { self.storeyOrder.set(s.id, idx); });
    // Elevation, geometriyle ayni ham (mm) birimdedir; world-uzayindaki metre
    // degerleriyle karsilastirilabilmesi icin ayni _lengthScaleToMm ile bolunur
    // (bkz. yapicidaki not - web-ifc geometriyi HER ZAMAN metreye normalize eder).
    this.storeyElevations = new Map();
    storeyElevation.forEach(function (s) { self.storeyElevations.set(s.id, s.elevation / self._lengthScaleToMm); });

    var visited = new Set();
    var nodeCount = 0;
    var MAX_NODES = 60000;

    function build(id) {
      if (visited.has(id) || nodeCount > MAX_NODES) return null;
      visited.add(id);
      nodeCount++;

      var name = null, typeName = 'IFCPRODUCT', guid = null;
      try {
        typeName = self.typeName(api.GetLineType(modelID, id));
        var line = api.GetLine(modelID, id, false);
        name = val(line.Name) || val(line.LongName) || null;
        guid = val(line.GlobalId) || null;
      } catch (e) {}

      var node = {
        id: id,
        name: name || typeName.replace('IFC', ''),
        type: typeName,
        guid: guid,
        hasGeometry: self.elementIndex.has(id),
        children: []
      };
      var kids = childrenOf.get(id) || [];
      for (var i = 0; i < kids.length; i++) {
        var c = build(kids[i]);
        if (c) node.children.push(c);
      }
      return node;
    }

    var projects = idsOf(WebIFC.IFCPROJECT);
    var rootNode = projects.length
      ? build(projects[0])
      : { id: -1, name: 'Model', type: 'IFCPROJECT', hasGeometry: false, children: [] };

    // Agaca baglanmamis ama geometrisi olan elemanlar
    var orphans = [];
    this.elementIndex.forEach(function (v, id) { if (!visited.has(id)) orphans.push(id); });
    if (orphans.length) {
      rootNode.children.push({
        id: -2,
        name: 'Iliskisiz Elemanlar',
        type: 'IFCGROUP',
        hasGeometry: false,
        children: orphans.slice(0, 5000).map(function (id) {
          var t = self.typeOfElement.get(id) || 'IFCPRODUCT';
          return { id: id, name: t.replace('IFC', ''), type: t, hasGeometry: true, children: [] };
        })
      });
    }

    var byType = {};
    this.typeOfElement.forEach(function (t, id) {
      if (!byType[t]) byType[t] = [];
      if (byType[t].length < 4000) byType[t].push(id);
    });

    return { root: rootNode, truncated: nodeCount > MAX_NODES, byType: byType };
  };

  /* ---------------- Ozellikler (Pset / malzeme / miktar) ---------------- */

  IFCModel.prototype._ensurePropertyIndex = function () {
    if (this._psetIndex) return;
    var api = this.api, modelID = this.modelID, self = this;
    this._psetIndex = new Map();
    this._materialIndex = new Map();

    function forEachRel(typeCode, fn) {
      try {
        var v = api.GetLineIDsWithType(modelID, typeCode);
        for (var i = 0; i < v.size(); i++) fn(api.GetLine(modelID, v.get(i), false));
      } catch (e) {}
    }

    forEachRel(WebIFC.IFCRELDEFINESBYPROPERTIES, function (rel) {
      var def = val(rel.RelatingPropertyDefinition);
      var objs = rel.RelatedObjects || [];
      for (var i = 0; i < objs.length; i++) {
        var eid = val(objs[i]);
        var l = self._psetIndex.get(eid);
        if (!l) { l = []; self._psetIndex.set(eid, l); }
        l.push(def);
      }
    });
    forEachRel(WebIFC.IFCRELASSOCIATESMATERIAL, function (rel) {
      var mat = val(rel.RelatingMaterial);
      var objs = rel.RelatedObjects || [];
      for (var i = 0; i < objs.length; i++) self._materialIndex.set(val(objs[i]), mat);
    });
  };

  IFCModel.prototype._materialName = function (id, depth) {
    if (id === null || id === undefined || depth > 4) return null;
    var line;
    try { line = this.api.GetLine(this.modelID, id, true); } catch (e) { return null; }
    if (!line) return null;
    if (line.Name && val(line.Name)) return val(line.Name);
    if (line.ForLayerSet) return this._materialName(val(line.ForLayerSet), depth + 1);
    if (line.MaterialLayers && line.MaterialLayers.length) {
      var names = [];
      for (var i = 0; i < line.MaterialLayers.length; i++) {
        var lay = line.MaterialLayers[i];
        var n = (lay && lay.Material) ? val(lay.Material.Name) : null;
        if (n) names.push(n);
      }
      if (names.length) return names.join(' / ');
    }
    if (line.Materials && line.Materials.length) {
      return line.Materials.map(function (m) { return val(m.Name); }).filter(Boolean).join(' / ');
    }
    return null;
  };

  IFCModel.prototype.getProperties = function (expressID) {
    if (this._propCache.has(expressID)) return this._propCache.get(expressID);
    this._ensurePropertyIndex();
    var api = this.api, modelID = this.modelID, self = this;

    var out = {
      id: expressID, name: null, type: null, globalId: null, description: null,
      objectType: null, tag: null, psets: [], quantities: [], material: null, dimensions: null
    };

    try {
      var line = api.GetLine(modelID, expressID, true);
      out.type = this.typeName(line.type);
      out.name = val(line.Name);
      out.globalId = val(line.GlobalId);
      out.description = val(line.Description);
      out.objectType = val(line.ObjectType);
      out.tag = val(line.Tag);
    } catch (e) {
      out.type = this.typeOfElement.get(expressID) || null;
    }

    var defs = this._psetIndex.get(expressID) || [];
    defs.forEach(function (defId) {
      var def;
      try { def = api.GetLine(modelID, defId, true); } catch (e) { return; }
      if (!def) return;
      var tname = self.typeName(def.type);

      if (def.HasProperties) {
        var props = [];
        for (var i = 0; i < def.HasProperties.length; i++) {
          var p = def.HasProperties[i];
          if (!p) continue;
          var v = (p.NominalValue !== undefined) ? val(p.NominalValue) : null;
          if ((v === null || v === undefined) && p.EnumerationValues) {
            v = p.EnumerationValues.map(val).join(', ');
          }
          props.push({
            name: val(p.Name),
            value: (v === null || v === undefined) ? '-' : String(v),
            unit: p.Unit ? val(p.Unit.Name) : null
          });
        }
        out.psets.push({ name: val(def.Name) || tname, properties: props });
      } else if (def.Quantities) {
        for (var q = 0; q < def.Quantities.length; q++) {
          var qq = def.Quantities[q];
          if (!qq) continue;
          var qv = val(qq.LengthValue);
          if (qv === null) qv = val(qq.AreaValue);
          if (qv === null) qv = val(qq.VolumeValue);
          if (qv === null) qv = val(qq.CountValue);
          if (qv === null) qv = val(qq.WeightValue);
          out.quantities.push({ name: val(qq.Name), value: qv === null ? '-' : String(qv) });
        }
      }
    });

    out.material = this._materialName(this._materialIndex.get(expressID), 0);
    out.dimensions = this.getDimensions(expressID);

    this._propCache.set(expressID, out);
    return out;
  };

  /** Elemanin dunya sinir kutusu (THREE.Box3, model birimlerinde - mm'ye
   *  cevrilmez). Lazer olcum aracinin "en yakin kenara mesafe" hesabinda da
   *  kullanilir (bkz. assets/viewer/js/tools.js MeasureTool). */
  IFCModel.prototype.getElementBox = function (expressID) {
    var refs = this.elementIndex.get(expressID);
    if (!refs || !refs.length) return null;
    var box = new THREE.Box3();
    var tmp = new THREE.Box3();
    var m = new THREE.Matrix4();
    for (var i = 0; i < refs.length; i++) {
      var g = this.groups[refs[i].g];
      if (!g || !g.mesh.geometry.boundingBox) continue;
      g.mesh.getMatrixAt(refs[i].i, m);
      tmp.copy(g.mesh.geometry.boundingBox).applyMatrix4(m).applyMatrix4(g.mesh.matrixWorld);
      box.union(tmp);
    }
    return box.isEmpty() ? null : box;
  };

  /** Elemanin dunya sinir kutusu; boyutlar mm cinsinden. */
  IFCModel.prototype.getDimensions = function (expressID) {
    var box = this.getElementBox(expressID);
    if (!box) return null;
    var size = box.getSize(new THREE.Vector3());
    var s = this._lengthScaleToMm;
    return {
      x: size.x * s, y: size.y * s, z: size.z * s,
      center: box.getCenter(new THREE.Vector3()).toArray()
    };
  };

  /* ---------------- 4D zaman tuneli ---------------- */

  var ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

  /** Property set'lerde ISO tarihi (YYYY-MM-DD...) formatinda deger tasiyan
   *  elemanlari tarar; her eleman icin bulunan EN ERKEN ve EN GEC tarihi
   *  { start, end } olarak kaydeder (tek tarih varsa start === end - o eleman
   *  o gun ani olarak "tamamlanmis" sayilir). Sonuc this._timelineRanges
   *  (expressID -> {start, end}) uzerinde saklanir; tarih ICERMEYEN elemanlar
   *  bu haritada yer almaz (bkz. app.js 'timelineSet' - boyle elemanlar zaman
   *  tunelinden bagimsiz her zaman gorunur kalir). */
  IFCModel.prototype.scanTimelineDates = async function () {
    this._ensurePropertyIndex();
    var api = this.api, modelID = this.modelID;
    var result = new Map();
    var defCache = new Map();
    var ids = Array.from(this._psetIndex.keys());

    for (var idx = 0; idx < ids.length; idx++) {
      var eid = ids[idx];
      var defs = this._psetIndex.get(eid) || [];
      var start = null, end = null;
      for (var d = 0; d < defs.length; d++) {
        var defId = defs[d];
        var def = defCache.get(defId);
        if (def === undefined) {
          try { def = api.GetLine(modelID, defId, true); } catch (e) { def = null; }
          defCache.set(defId, def);
        }
        if (!def || !def.HasProperties) continue;
        for (var p = 0; p < def.HasProperties.length; p++) {
          var prop = def.HasProperties[p];
          if (!prop || prop.NominalValue === undefined) continue;
          var v = val(prop.NominalValue);
          if (typeof v !== 'string') continue;
          var m = ISO_DATE_RE.exec(v);
          if (!m) continue;
          var ts = Date.UTC(+m[1], +m[2] - 1, +m[3]);
          if (start === null || ts < start) start = ts;
          if (end === null || ts > end) end = ts;
        }
      }
      if (start !== null) result.set(eid, { start: start, end: end });
      if (idx % 500 === 0) {
        post('progress', { phase: 'timeline', percent: Math.round(100 * idx / Math.max(ids.length, 1)) });
        await yieldFrame();
      }
    }

    this._timelineRanges = result;
    var boundarySet = new Set();
    result.forEach(function (r) { boundarySet.add(r.start); boundarySet.add(r.end); });
    var uniqueTs = Array.from(boundarySet).sort(function (a, b) { return a - b; });
    return { dates: uniqueTs, elementsCount: result.size };
  };

  IFCModel.prototype.dispose = function () {
    for (var i = 0; i < this.groups.length; i++) {
      var m = this.groups[i].mesh;
      m.geometry.dispose();
      m.material.dispose();
      this.root.remove(m);
    }
    this.groups = [];
    this.elementIndex.clear();
    this.elementStorey.clear();
    this.storeys = [];
    this.storeyOrder.clear();
    this.storeysInfo = [];
    this.storeyElements.clear();
    this.storeyElevations.clear();
    this._propCache.clear();
    if (this.api && this.modelID >= 0) {
      try { this.api.CloseModel(this.modelID); } catch (e) {}
      this.modelID = -1;
    }
  };

  SOS.IFCModel = IFCModel;
})(window.SOS);
