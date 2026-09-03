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

  /* IFC kategorisi -> renk (opsiyonel "tipe gore renklendirme" modu icin) */
  var TYPE_COLORS = {
    IFCWALL: 0xBFC4CC, IFCWALLSTANDARDCASE: 0xBFC4CC,
    IFCSLAB: 0x8E9AAF, IFCROOF: 0x2F4A8C,
    IFCCOLUMN: 0xD98C4A, IFCBEAM: 0xC2703D,
    IFCDOOR: 0xB99B58, IFCWINDOW: 0x6FB3D2,
    IFCSTAIR: 0xA07CC5, IFCSTAIRFLIGHT: 0xA07CC5, IFCRAILING: 0x7A6AA8,
    IFCFURNISHINGELEMENT: 0x6FA88A, IFCSPACE: 0x4CAF7D,
    IFCPLATE: 0x9AA5B1, IFCMEMBER: 0xB0752E, IFCCOVERING: 0xCFCFCF,
    IFCFLOWTERMINAL: 0x59A5B8, IFCFLOWSEGMENT: 0x59A5B8,
    IFCBUILDINGELEMENTPROXY: 0xAAAAAA, IFCSITE: 0x5A4632, IFCFOOTING: 0x6E6155
  };
  function typeColor(typeName) {
    if (!typeName) return 0xAFAFAF;
    var c = TYPE_COLORS[String(typeName).toUpperCase()];
    return typeof c === 'number' ? c : 0xAFAFAF;
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
    typeColor: typeColor,
    clamp: clamp,
    formatLength: formatLength
  };
})(window.SOS);
