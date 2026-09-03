/* React Native <-> WebView mesaj koprusu */
window.SOS = window.SOS || {};
(function (SOS) {
  'use strict';

  var handlers = {};

  /** NOT: bir onceki surumde burasi hata durumunda TAMAMEN sessiz kaliyordu -
   *  ozellikle buyuk payload'larda (ör. thumbnail) postMessage'in kendisi
   *  atarsa hicbir iz kalmiyordu (webview'in kendi console.log'u RN/Metro
   *  tarafinda goruunmuyor). Simdi boyle bir hata, KUCUK ve garanti sigacak
   *  ayri bir 'error' mesaji olarak ayrica gonderiliyor - boylece RN
   *  tarafinda (ViewerScreen) bir hata olarak GORUNUR hale gelir, sessizce
   *  kaybolmaz. */
  function post(type, payload) {
    var msg;
    try {
      msg = JSON.stringify({ type: type, payload: payload === undefined ? null : payload });
    } catch (e) {
      reportPostFailure(type, e, 'stringify');
      return;
    }
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      }
    } catch (e) {
      reportPostFailure(type, e, 'send');
    }
  }

  function reportPostFailure(type, e, phase) {
    if (type === 'error') return; // sonsuz donguyu onle
    try {
      var tiny = JSON.stringify({
        type: 'error',
        payload: { code: 'POST_FAILED', message: type + ' (' + phase + '): ' + String(e && e.message ? e.message : e) }
      });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(tiny);
      }
    } catch (e2) { /* bu bile basarisiz olursa yapacak bir sey yok */ }
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
