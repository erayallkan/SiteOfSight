/* SiteOfSight - viewer yardimcilari (klasik script, global: window.SOS) */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Base64 parcalari -> tek Uint8Array (her parca 3'un kati byte icerdigi icin
   *  parca sinirlarinda padding olusmaz, ayri ayri decode edilebilir). */
  function joinBase64Chunks(chunks) {
    var parts = [];
    var total = 0;
    for (var i = 0; i < chunks.length; i++) {
      var b = base64ToBytes(chunks[i]);
      parts.push(b);
      total += b.length;
    }
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], off); off += parts[j].length; }
    return out;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function formatLength(mm, unit) {
    var v, s;
    if (unit === 'cm') { v = mm / 10; s = 'cm'; }
    else if (unit === 'm') { v = mm / 1000; s = 'm'; }
    else { v = mm; s = 'mm'; }
    return (Math.round(v * 10) / 10).toFixed(1) + ' ' + s;
  }

  SOS.util = {
    base64ToBytes: base64ToBytes,
    joinBase64Chunks: joinBase64Chunks,
    clamp: clamp,
    formatLength: formatLength
  };
})(window.SOS);
