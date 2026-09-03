/* Dokunmatik kamera kontrolu: 1 parmak orbit, 2 parmak pan + pinch zoom.
   Hem PerspectiveCamera hem OrthographicCamera ile calisir. */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  function TouchControls(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.target = new THREE.Vector3();
    this.spherical = new THREE.Spherical(10, Math.PI / 3, Math.PI / 4);
    this.minDistance = 0.05;
    this.maxDistance = 1e6;
    this.rotateSpeed = 0.005;
    this.damping = 0.12;
    this.enabled = true;
    this.onTap = null;              // (x, y) -> void
    this.onChange = null;

    this._sphDelta = { theta: 0, phi: 0 };
    this._panOffset = new THREE.Vector3();
    this._scale = 1;
    this._pointers = [];            // {id, x, y}
    this._startDist = 0;
    this._startMid = { x: 0, y: 0 };
    this._moved = 0;
    this._downTime = 0;
    this._suppressTap = false;

    this._bind();
  }

  TouchControls.prototype._bind = function () {
    var self = this;
    var dom = this.dom;
    dom.addEventListener('pointerdown', function (e) { self._down(e); }, { passive: false });
    dom.addEventListener('pointermove', function (e) { self._move(e); }, { passive: false });
    dom.addEventListener('pointerup', function (e) { self._up(e); }, { passive: false });
    dom.addEventListener('pointercancel', function (e) { self._up(e); }, { passive: false });
    dom.addEventListener('wheel', function (e) {
      e.preventDefault();
      self._scale *= e.deltaY > 0 ? 1.1 : 1 / 1.1;
    }, { passive: false });
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  TouchControls.prototype._idx = function (id) {
    for (var i = 0; i < this._pointers.length; i++) if (this._pointers[i].id === id) return i;
    return -1;
  };

  TouchControls.prototype._down = function (e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.dom.setPointerCapture) { try { this.dom.setPointerCapture(e.pointerId); } catch (err) {} }
    this._pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
    if (this._pointers.length === 1) { this._moved = 0; this._downTime = Date.now(); this._suppressTap = false; }
    if (this._pointers.length === 2) {
      this._suppressTap = true;
      this._startDist = this._distance();
      this._startMid = this._midpoint();
    }
  };

  TouchControls.prototype._move = function (e) {
    if (!this.enabled) return;
    var i = this._idx(e.pointerId);
    if (i < 0) return;
    e.preventDefault();
    var prev = { x: this._pointers[i].x, y: this._pointers[i].y };
    this._pointers[i].x = e.clientX;
    this._pointers[i].y = e.clientY;

    if (this._pointers.length === 1) {
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      this._moved += Math.abs(dx) + Math.abs(dy);
      this._sphDelta.theta -= dx * this.rotateSpeed;
      this._sphDelta.phi -= dy * this.rotateSpeed;
    } else if (this._pointers.length === 2) {
      var d = this._distance();
      if (this._startDist > 0) {
        var ratio = d / this._startDist;
        this._scale /= Math.pow(ratio, 0.9);
        this._startDist = d;
      }
      var mid = this._midpoint();
      this._pan(mid.x - this._startMid.x, mid.y - this._startMid.y);
      this._startMid = mid;
    }
  };

  TouchControls.prototype._up = function (e) {
    var i = this._idx(e.pointerId);
    if (i >= 0) this._pointers.splice(i, 1);
    if (this._pointers.length === 0) {
      var quick = Date.now() - this._downTime < 350;
      if (!this._suppressTap && quick && this._moved < 12 && this.onTap) {
        this.onTap(e.clientX, e.clientY);
      }
    }
    if (this._pointers.length < 2) this._startDist = 0;
  };

  TouchControls.prototype._distance = function () {
    var a = this._pointers[0], b = this._pointers[1];
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  };
  TouchControls.prototype._midpoint = function () {
    var a = this._pointers[0], b = this._pointers[1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  TouchControls.prototype._pan = function (dx, dy) {
    var cam = this.camera;
    var el = this.dom;
    var v = new THREE.Vector3();
    var targetDistance;
    if (cam.isPerspectiveCamera) {
      var offset = new THREE.Vector3().copy(cam.position).sub(this.target);
      targetDistance = offset.length() * Math.tan((cam.fov / 2) * Math.PI / 180);
      var px = (2 * dx * targetDistance / el.clientHeight);
      var py = (2 * dy * targetDistance / el.clientHeight);
      v.setFromMatrixColumn(cam.matrix, 0).multiplyScalar(-px);
      this._panOffset.add(v);
      v.setFromMatrixColumn(cam.matrix, 1).multiplyScalar(py);
      this._panOffset.add(v);
    } else {
      var w = (cam.right - cam.left) / cam.zoom;
      var h = (cam.top - cam.bottom) / cam.zoom;
      v.setFromMatrixColumn(cam.matrix, 0).multiplyScalar(-dx * w / el.clientWidth);
      this._panOffset.add(v);
      v.setFromMatrixColumn(cam.matrix, 1).multiplyScalar(dy * h / el.clientHeight);
      this._panOffset.add(v);
    }
  };

  TouchControls.prototype.update = function () {
    var sph = this.spherical;
    var d = this.damping;
    sph.theta += this._sphDelta.theta;
    sph.phi += this._sphDelta.phi;
    sph.phi = SOS.util.clamp(sph.phi, 0.0001, Math.PI - 0.0001);

    this.target.add(this._panOffset);

    if (this.camera.isOrthographicCamera) {
      this.camera.zoom = SOS.util.clamp(this.camera.zoom / this._scale, 0.02, 500);
      this.camera.updateProjectionMatrix();
    } else {
      sph.radius = SOS.util.clamp(sph.radius * this._scale, this.minDistance, this.maxDistance);
    }

    var pos = new THREE.Vector3().setFromSpherical(sph).add(this.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);

    var moving = Math.abs(this._sphDelta.theta) > 1e-6 || Math.abs(this._sphDelta.phi) > 1e-6 ||
                 this._panOffset.lengthSq() > 1e-12 || Math.abs(this._scale - 1) > 1e-6;

    this._sphDelta.theta *= (1 - d);
    this._sphDelta.phi *= (1 - d);
    this._panOffset.multiplyScalar(1 - d);
    this._scale = 1 + (this._scale - 1) * (1 - d);
    if (Math.abs(this._sphDelta.theta) < 1e-6) this._sphDelta.theta = 0;
    if (Math.abs(this._sphDelta.phi) < 1e-6) this._sphDelta.phi = 0;
    if (this._panOffset.lengthSq() < 1e-12) this._panOffset.set(0, 0, 0);
    if (Math.abs(this._scale - 1) < 1e-6) this._scale = 1;

    if (moving && this.onChange) this.onChange();
    return moving;
  };

  /** Kamerayi hedef yone (unit vector) ve mesafeye tasi. */
  TouchControls.prototype.setDirection = function (dir, distance) {
    var s = new THREE.Spherical().setFromVector3(new THREE.Vector3(dir.x, dir.y, dir.z).normalize().multiplyScalar(distance));
    this.spherical.set(distance, SOS.util.clamp(s.phi, 0.0001, Math.PI - 0.0001), s.theta);
    this._sphDelta.theta = 0; this._sphDelta.phi = 0; this._scale = 1;
    this._panOffset.set(0, 0, 0);
  };

  SOS.TouchControls = TouchControls;
})(window.SOS);
