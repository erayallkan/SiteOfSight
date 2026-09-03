/* Revit tarzi ViewCube: ayri bir sahnede, ekranin sag-ust kosesindeki kucuk
   bir viewport'a cizilir. Bir yuzeye dokunuldugunda kamera o yone ORTOGRAFIK
   olarak gecer. */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  var FACES = [
    // three.js BoxGeometry malzeme sirasi: +X, -X, +Y, -Y, +Z, -Z
    { key: 'right', dir: [1, 0, 0] },
    { key: 'left', dir: [-1, 0, 0] },
    { key: 'top', dir: [0, 1, 0] },
    { key: 'bottom', dir: [0, -1, 0] },
    { key: 'front', dir: [0, 0, 1] },
    { key: 'back', dir: [0, 0, -1] }
  ];

  var DEFAULT_LABELS = {
    right: 'SAĞ', left: 'SOL', top: 'ÜST',
    bottom: 'ALT', front: 'ÖN', back: 'ARKA'
  };

  // Her yuz icin ayri ton: ust en acik, yanlar orta, alt/arka en koyu -> sahte
  // ambient occlusion ile daha "gerceksi" ve modern bir gorunum verir.
  var SHADE = { top: 1, right: 0.86, front: 0.86, left: 0.72, back: 0.72, bottom: 0.6 };

  function mix(a, b, t) { return Math.round(a + (b - a) * t); }
  function shadeHex(hex, factor) {
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    r = mix(0, r, factor); g = mix(0, g, factor); b = mix(0, b, factor);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function faceTexture(text, faceKey, dark) {
    var size = 256;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');

    var base = dark ? 0xEDEFF3 : 0x2A2F3A;
    var shade = SHADE[faceKey] !== undefined ? SHADE[faceKey] : 0.85;
    var top = shadeHex(dark ? 0xFFFFFF : 0x3A4050, dark ? shade : (0.55 + shade * 0.4));
    var bottom = shadeHex(base, dark ? (0.75 + shade * 0.25) : shade);

    var grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Ince ic cerceve: yuzeyler arasinda net ayrim, cam benzeri kenar
    ctx.strokeStyle = dark ? 'rgba(20,23,30,0.30)' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, size - 6, size - 6);

    ctx.fillStyle = dark ? '#1B1E26' : '#F4F6FA';
    ctx.font = '700 46px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '1px';
    ctx.fillText(String(text).slice(0, 6).toUpperCase(), size / 2, size / 2 + 2);

    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    return tex;
  }

  function ViewCube(opts) {
    this.size = opts.size || 78;
    this.marginRight = opts.marginRight || opts.margin || 16;
    // Ustteki RN baslik cubugunun (geri/baslik/sigdir butonlari) altinda kalmamasi
    // icin ekranin en ustunden belirgin bir bosluk birakilir.
    this.marginTop = opts.marginTop || 96;
    this.labels = opts.labels || DEFAULT_LABELS;
    this.dark = opts.dark !== false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var dl = new THREE.DirectionalLight(0xffffff, 0.55);
    dl.position.set(2, 3, 4);
    this.scene.add(dl);

    this.group = new THREE.Group();
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), this._materials());
    this.group.add(this.cube);

    // Kesik/net kenarlar: modern, "cam kup" hissi veren ince cizgi kenarlik
    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.cube.geometry),
      new THREE.LineBasicMaterial({
        color: this.dark ? 0x11141a : 0xffffff,
        transparent: true,
        opacity: this.dark ? 0.35 : 0.5
      })
    );
    edges.scale.setScalar(1.001);
    this.edges = edges;
    this.group.add(edges);

    this.scene.add(this.group);
    this.raycaster = new THREE.Raycaster();
  }

  ViewCube.prototype._materials = function () {
    var self = this;
    return FACES.map(function (f) {
      return new THREE.MeshBasicMaterial({ map: faceTexture(self.labels[f.key] || f.key, f.key, self.dark) });
    });
  };

  ViewCube.prototype.setLabels = function (labels, dark) {
    this.labels = labels || this.labels;
    if (dark !== undefined) this.dark = dark;
    var mats = this.cube.material;
    for (var i = 0; i < mats.length; i++) {
      if (mats[i].map) mats[i].map.dispose();
      mats[i].dispose();
    }
    this.cube.material = this._materials();
    this.edges.material.color.setHex(this.dark ? 0x11141a : 0xffffff);
    this.edges.material.opacity = this.dark ? 0.35 : 0.5;
  };

  /** Ana kameranin yonelimini kupe yansit. */
  ViewCube.prototype.sync = function (mainCamera, target) {
    var dir = new THREE.Vector3().subVectors(mainCamera.position, target).normalize();
    this.camera.position.copy(dir.multiplyScalar(5));
    this.camera.up.copy(mainCamera.up);
    this.camera.lookAt(0, 0, 0);
  };

  /** Viewport dikdortgeni: WebGL koordinatinda (y, ekranin ALTINDAN itibaren). */
  ViewCube.prototype.rect = function (dom) {
    var x = dom.clientWidth - this.marginRight - this.size;
    var y = dom.clientHeight - this.marginTop - this.size;
    return { x: x, y: Math.max(y, 0), w: this.size, h: this.size };
  };

  /** Ekranin sag-ust kosesindeki viewport'a ciz. autoClearColor kapatilarak
   *  arkadaki ana sahne uzerine dogrudan cizilir; dolu bir arkaplan karesi kalmaz. */
  ViewCube.prototype.render = function (renderer, dom) {
    var r = this.rect(dom);
    renderer.setScissorTest(true);
    renderer.setViewport(r.x, r.y, r.w, r.h);
    renderer.setScissor(r.x, r.y, r.w, r.h);
    var prevAutoClearColor = renderer.autoClearColor;
    renderer.autoClearColor = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClearColor = prevAutoClearColor;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, dom.clientWidth, dom.clientHeight);
  };

  /**
   * Dokunma kup alanina denk geliyorsa yon vektorunu dondurur, degilse null.
   * x,y: CSS pikselinde, sol-ust orijinli.
   */
  ViewCube.prototype.hitTest = function (x, y, dom) {
    var r = this.rect(dom);
    var left = r.x, right = r.x + r.w;
    var bottom = dom.clientHeight - r.y;          // ekran koordinatinda alt sinir
    var top = bottom - r.h;
    if (x < left || x > right || y < top || y > bottom) return null;

    var ndc = new THREE.Vector2(
      ((x - left) / r.w) * 2 - 1,
      -(((y - top) / r.h) * 2 - 1)
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    var hits = this.raycaster.intersectObject(this.cube, false);
    if (!hits.length) return null;

    var materialIndex = hits[0].face.materialIndex;
    var face = FACES[materialIndex];
    if (!face) return null;
    return { key: face.key, dir: new THREE.Vector3(face.dir[0], face.dir[1], face.dir[2]) };
  };

  SOS.ViewCube = ViewCube;
  SOS.VIEWCUBE_FACES = FACES;
})(window.SOS);
