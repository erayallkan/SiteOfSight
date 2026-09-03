/* React Native <-> WebView mesaj koprusu */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  var handlers = {};

  function post(type, payload) {
    try {
      var msg = JSON.stringify({ type: type, payload: payload === undefined ? null : payload });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      } else {
        console.log('[SOS->RN]', msg.slice(0, 400));
      }
    } catch (e) { /* JSON'a cevrilemeyen payload'i sessizce gec */ }
  }

  function on(type, fn) { handlers[type] = fn; }

  /** RN tarafi bunu injectJavaScript ile cagirir: SOS.bridge.cmd('{"type":...}') */
  function cmd(raw) {
    var msg;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (e) { post('error', { code: 'BAD_COMMAND', message: String(e) }); return; }
    var h = handlers[msg.type];
    if (!h) { post('log', { message: 'islenmeyen komut: ' + msg.type }); return; }
    try { h(msg.payload || {}); }
    catch (e) { post('error', { code: 'COMMAND_FAILED', message: msg.type + ': ' + (e && e.message ? e.message : e) }); }
  }

  window.onerror = function (message, src, line, col, err) {
    post('error', { code: 'JS_ERROR', message: message + ' @' + line + ':' + col, stack: err && err.stack ? String(err.stack).slice(0, 800) : null });
    return false;
  };
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    post('error', { code: 'JS_REJECTION', message: (r && r.message) ? r.message : String(r) });
  });

  SOS.bridge = { post: post, on: on, cmd: cmd };
})(window.SOS);
