/* WebView icindeki three.js sahnesini saran kopru bileseni.
   RN -> Web : injectJavaScript ile SOS.bridge.cmd(json)
   Web -> RN : window.ReactNativeWebView.postMessage(json)

   WASM ve IFC verisi base64 parcalar halinde, her parcadan sonra "ack"
   beklenerek aktarilir; boylece buyuk dosyalarda kopru tikanmaz. */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

import { viewerHtmlUri, webIfcWasmUri } from '../services/assets';

// 3'un kati olmali: base64 parcalari bagimsiz cozulebilsin diye
const CHUNK_BYTES = 600000;
const ACK_TIMEOUT_MS = 45000;

const ViewerCanvas = forwardRef(function ViewerCanvas(props, ref) {
  const {
    modelUri,
    backgroundColor = '#20232A',
    dark = true,
    cubeLabels,
    surfaceColor,
    accentColor,
    borderColor,
    showFps = false,
    safeBottom = 0,
    onReady,
    onProgress,
    onLoaded,
    onSelection,
    onMeasurement,
    onMeasureState,
    onWalkStarted,
    onFps,
    onError,
    onThumbnail,
    onTimelineReady,
    onStoreyChanged,
  } = props;

  const webRef = useRef(null);
  const [htmlUri, setHtmlUri] = useState(null);
  const acks = useRef(new Map());
  const booted = useRef(false);
  const transferStarted = useRef(false);

  useEffect(() => {
    let alive = true;
    viewerHtmlUri()
      .then((uri) => { if (alive) setHtmlUri(uri); })
      .catch((e) => onError?.({ code: 'VIEWER_ASSET_MISSING', message: String(e?.message || e) }));
    return () => { alive = false; };
  }, [onError]);

  const send = useCallback((type, payload) => {
    const json = JSON.stringify({ type, payload: payload ?? null });
    webRef.current?.injectJavaScript(
      `window.SOS && window.SOS.bridge && window.SOS.bridge.cmd(${JSON.stringify(json)}); true;`
    );
  }, []);

  const waitAck = useCallback((key) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      acks.current.delete(key);
      reject(new Error(`ack zaman asimi: ${key}`));
    }, ACK_TIMEOUT_MS);
    acks.current.set(key, () => { clearTimeout(timer); acks.current.delete(key); resolve(); });
  }), []);

  /** Bir dosyayi base64 parcalar halinde WebView'e aktarir. */
  const transfer = useCallback(async (uri, kind) => {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const size = info.size || 0;
    if (!size) throw new Error('dosya bos veya bulunamadi');

    const total = Math.ceil(size / CHUNK_BYTES);
    for (let i = 0; i < total; i += 1) {
      const position = i * CHUNK_BYTES;
      const length = Math.min(CHUNK_BYTES, size - position);
      const data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });
      const pending = waitAck(`${kind}:${i}`);
      send(kind === 'wasm' ? 'wasmChunk' : 'ifcChunk', { data, index: i, total });
      await pending;
    }
    return total;
  }, [send, waitAck]);

  const bootViewer = useCallback(async () => {
    try {
      const wasmUri = await webIfcWasmUri();
      await transfer(wasmUri, 'wasm');
      send('wasmEnd', {});
    } catch (e) {
      onError?.({ code: 'WASM_TRANSFER_FAILED', message: String(e?.message || e) });
    }
  }, [transfer, send, onError]);

  const loadModel = useCallback(async (uri) => {
    if (!uri) return;
    try {
      transferStarted.current = true;
      send('ifcBegin', { name: uri.split('/').pop() });
      await transfer(uri, 'ifc');
      send('ifcEnd', {});
    } catch (e) {
      onError?.({ code: 'TRANSFER_FAILED', message: String(e?.message || e) });
    }
  }, [transfer, send, onError]);

  const handleMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    const { type, payload } = msg;

    switch (type) {
      case 'ready':
        send('setTheme', {
          background: backgroundColor, dark, cubeLabels,
          surface: surfaceColor, accent: accentColor, border: borderColor,
        });
        send('showHud', { visible: showFps });
        send('layout', { safeBottom });
        onReady?.(payload);
        bootViewer();
        break;
      case 'ack': {
        const key = payload.kind === 'wasm' ? `wasm:${payload.index}` : `ifc:${payload.index}`;
        const resolver = acks.current.get(key);
        if (resolver) resolver();
        break;
      }
      case 'booted':
        booted.current = true;
        if (modelUri && !transferStarted.current) loadModel(modelUri);
        break;
      case 'progress': onProgress?.(payload); break;
      case 'loaded': onLoaded?.(payload); break;
      case 'selection': onSelection?.(payload); break;
      case 'measurement': onMeasurement?.(payload); break;
      case 'measureState': onMeasureState?.(payload); break;
      case 'walkStarted': onWalkStarted?.(payload); break;
      case 'fps': onFps?.(payload); break;
      case 'error':
        // Gercek nedeni her zaman Metro konsoluna yaz - RN tarafindaki hata
        // katmani bilinmeyen bir 'code' icin genel bir mesaja duser ve o
        // durumda ekranda detay satiri gorunmeyebilir (bkz. ViewerScreen
        // handleError); konsol her zaman ham payload'i gosterir.
        if (__DEV__) console.log('[viewer:error]', JSON.stringify(payload));
        onError?.(payload);
        break;
      case 'thumbnail': onThumbnail?.(payload); break;
      case 'timelineReady': onTimelineReady?.(payload); break;
      case 'storeyChanged': onStoreyChanged?.(payload); break;
      case 'log': if (__DEV__) console.log('[viewer]', payload?.message); break;
      default: break;
    }
  }, [backgroundColor, dark, cubeLabels, surfaceColor, accentColor, borderColor, showFps, safeBottom, modelUri,
      send, bootViewer, loadModel,
      onReady, onProgress, onLoaded, onSelection, onMeasurement, onMeasureState, onWalkStarted, onFps, onError,
      onThumbnail, onTimelineReady, onStoreyChanged]);

  useEffect(() => {
    if (booted.current && modelUri && !transferStarted.current) loadModel(modelUri);
  }, [modelUri, loadModel]);

  useImperativeHandle(ref, () => ({
    fit: () => send('fit', {}),
    resetView: () => send('resetView', {}),
    setViewDirection: (x, y, z, orthographic = true) => send('viewDirection', { x, y, z, orthographic }),
    setTheme: (background, isDark, labels) => send('setTheme', { background, dark: isDark, cubeLabels: labels }),
    showHud: (visible) => send('showHud', { visible }),

    setSection: (axis, t, flipped) => send('section', { axis, t, flipped }),
    clearSection: (axis) => send('clearSection', { axis }),

    hide: (ids) => send('hide', { ids }),
    show: (ids) => send('show', { ids }),
    isolate: (ids) => send('isolate', { ids }),
    showAll: () => send('showAll', {}),
    setWireframe: (enabled) => send('wireframe', { enabled }),
    setExplode: (factor) => send('explode', { factor }),
    setLayerSeparate: (axis, factor) => send('layerSeparate', { axis, factor }),
    setXray: (enabled) => send('xray', { enabled }),

    showStorey: (id) => send('showStorey', { id }),
    showAllStoreys: () => send('showAllStoreys', {}),

    buildTimeline: () => send('timelineBuild', {}),
    setTimelineCutoff: (ts) => send('timelineSet', { ts }),
    clearTimeline: () => send('timelineClear', {}),

    select: (id, focus = false, pulse = false) => send('select', { id, focus, pulse }),
    clearSelection: () => send('select', { id: null }),

    flyTo: (x, y, z) => send('flyTo', { x, y, z }),
    setSplitMode: (enabled) => send('setSplitMode', { enabled }),

    setMeasureMode: (mode) => send('measureMode', { mode }),
    setMeasureUnit: (unit) => send('measureUnit', { unit }),
    measureUndo: () => send('measureUndo', {}),
    measureRedo: () => send('measureRedo', {}),
    measureClear: () => send('measureClear', {}),

    armWalkPick: () => send('walkArmPick', {}),
    cancelWalkPick: () => send('walkCancelPick', {}),
    exitWalkthrough: () => send('walkExit', {}),
    walkMove: (x, y) => send('walkMove', { x, y }),
    walkLook: (x, y) => send('walkLook', { x, y }),
  }), [send]);

  if (!htmlUri) {
    return (
      <View style={[styles.center, { backgroundColor }]}>
        <ActivityIndicator color="#4C6FE0" />
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      source={{ uri: htmlUri }}
      originWhitelist={['*']}
      style={{ flex: 1, backgroundColor }}
      // Tek dosyalik sayfa oldugu icin alt kaynak istegi yok; yine de file:// erisimi acik
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      overScrollMode="never"
      bounces={false}
      androidLayerType="hardware"
      cacheEnabled={false}
      mediaPlaybackRequiresUserAction={false}
      onMessage={handleMessage}
      onRenderProcessGone={() => onError?.({ code: 'RENDERER_GONE', message: 'errors.viewerCrashed' })}
      onContentProcessDidTerminate={() => onError?.({ code: 'RENDERER_GONE', message: 'errors.viewerCrashed' })}
      onError={(e) => onError?.({ code: 'WEBVIEW_ERROR', message: String(e?.nativeEvent?.description || '') })}
      renderLoading={() => (
        <View style={[styles.center, { backgroundColor }]}>
          <ActivityIndicator color="#4C6FE0" />
        </View>
      )}
    />
  );
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default ViewerCanvas;
