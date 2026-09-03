/* 3B goruntuleyici ekrani: WebView sahnesi + alt arac cubugu + paneller */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import ViewerCanvas from '../viewer/ViewerCanvas';
import ModelTreeSheet from '../components/ModelTreeSheet';
import PropertiesSheet from '../components/PropertiesSheet';
import MeasureSheet from '../components/MeasureSheet';
import DisplaySheet from '../components/DisplaySheet';
import {
  addBookmark, addMeasurement, deleteBookmark, listBookmarks, setModelStats, touchModel,
} from '../db/database';

const ERROR_MESSAGES = {
  IFC_LOAD_FAILED: 'errors.parseFailed',
  WASM_INIT_FAILED: 'errors.parseFailed',
  WASM_TRANSFER_FAILED: 'errors.unreadable',
  TRANSFER_FAILED: 'errors.unreadable',
  RENDERER_GONE: 'errors.lowMemory',
  VIEWER_ASSET_MISSING: 'errors.viewerCrashed',
  WEBVIEW_ERROR: 'errors.viewerCrashed',
};

export default function ViewerScreen({ route, navigation }) {
  const { model } = route.params;
  const { colors, t, settings, update } = useApp();
  const viewer = useRef(null);

  const [progress, setProgress] = useState({ phase: 'boot', percent: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [tree, setTree] = useState(null);
  const [stats, setStats] = useState(null);
  const [fps, setFps] = useState(0);

  const [sheet, setSheet] = useState(null);          // tree | props | measure | display
  const [selected, setSelected] = useState(null);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const [measureMode, setMeasureMode] = useState('none');
  const [measureSnap, setMeasureSnap] = useState(true);
  const [measureState, setMeasureState] = useState({ canUndo: false, canRedo: false, items: [] });

  const [section, setSection] = useState(null);      // { axis, t, flipped }
  const [wireframe, setWireframe] = useState(false);
  const [colorByType, setColorByType] = useState(false);
  const [explode, setExplode] = useState(0);
  const [projection, setProjection] = useState('perspective');
  const [bookmarks, setBookmarks] = useState([]);
  const pendingBookmarkName = useRef(null);

  useEffect(() => { touchModel(model.id).catch(() => {}); }, [model.id]);
  useEffect(() => { listBookmarks(model.id).then(setBookmarks).catch(() => {}); }, [model.id]);

  const cubeLabels = useMemo(() => (settings.language === 'en'
    ? { right: 'RIGHT', left: 'LEFT', top: 'TOP', bottom: 'BOTTOM', front: 'FRONT', back: 'BACK' }
    : { right: 'SAG', left: 'SOL', top: 'UST', bottom: 'ALT', front: 'ON', back: 'ARKA' }
  ), [settings.language]);

  /* ---------------- Viewer olaylari ---------------- */

  const handleProgress = useCallback((p) => setProgress(p), []);

  const handleLoaded = useCallback((payload) => {
    setTree(payload.tree);
    setStats(payload.stats);
    setModelStats(model.id, payload.stats.elements, payload.stats.triangles).catch(() => {});
    // WebView tarafinda 'loaded' olayindan sonra da shader derlemesi icin bir
    // "warmup" penceresi calisiyor (assets/viewer/js/app.js). Yukleme katmanini
    // o pencere kapanana kadar acik tutup kullaniciya bos/yari-cizilmis bir kare
    // gostermemek icin kisa bir gecikmeyle kaldiriyoruz.
    setTimeout(() => setLoaded(true), 1600);
  }, [model.id]);

  const handleSelection = useCallback((element) => {
    setSelected(element);
    if (element) setSheet('props');
  }, []);

  const handleMeasurement = useCallback((m) => {
    addMeasurement(model.id, m).catch(() => {});
  }, [model.id]);

  const handleCamera = useCallback((camera) => {
    const name = pendingBookmarkName.current;
    if (!name) return;
    pendingBookmarkName.current = null;
    addBookmark(model.id, name, camera)
      .then(() => listBookmarks(model.id))
      .then(setBookmarks)
      .catch(() => {});
  }, [model.id]);

  const handleError = useCallback((err) => {
    const key = ERROR_MESSAGES[err?.code] || 'errors.parseFailed';
    setError({ key, detail: err?.message, code: err?.code });
  }, []);

  /* ---------------- Arac eylemleri ---------------- */

  const toggleVisibility = useCallback((ids, hide) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (hide ? next.add(id) : next.delete(id)));
      return next;
    });
    if (hide) viewer.current?.hide(ids);
    else viewer.current?.show(ids);
  }, []);

  const isolate = useCallback((ids) => {
    viewer.current?.isolate(ids);
    setSheet(null);
  }, []);

  const showAll = useCallback(() => {
    setHiddenIds(new Set());
    viewer.current?.showAll();
  }, []);

  const applySection = useCallback((next) => {
    setSection(next);
    viewer.current?.setSection(next.axis, next.t, next.flipped);
  }, []);

  const clearSection = useCallback(() => {
    setSection(null);
    viewer.current?.clearSection();
  }, []);

  const changeMeasureMode = useCallback((mode) => {
    setMeasureMode(mode);
    viewer.current?.setMeasureMode(mode);
    if (mode !== 'none') setSheet(null);
  }, []);

  const saveBookmark = useCallback((name) => {
    pendingBookmarkName.current = name;
    viewer.current?.requestCamera();
  }, []);

  const applyBookmark = useCallback((b) => {
    viewer.current?.setCamera(b.camera);
    setProjection(b.camera?.projection || 'perspective');
    setSheet(null);
  }, []);

  const removeBookmark = useCallback((id) => {
    deleteBookmark(id).then(() => listBookmarks(model.id)).then(setBookmarks).catch(() => {});
  }, [model.id]);

  /* ---------------- Yukleme metni ---------------- */

  const progressLabel = useMemo(() => {
    switch (progress.phase) {
      case 'transfer': return `${t('viewer.transferring')} %${progress.percent || 0}`;
      case 'parse': return t('viewer.parsing');
      case 'geometry': return progress.count
        ? `${t('viewer.geometry')} (${progress.count})`
        : t('viewer.geometry');
      case 'build': return `${t('viewer.building')} %${progress.percent || 0}`;
      case 'tree': return t('viewer.tree');
      default: return t('viewer.preparing');
    }
  }, [progress, t]);

  /* ---------------- Render ---------------- */

  const ToolbarButton = ({ icon, onPress, active, badge }) => (
    <Pressable
      onPress={onPress}
      style={[styles.toolbarBtn, active && { backgroundColor: colors.accent }]}
      hitSlop={6}
    >
      <Ionicons name={icon} size={21} color={active ? '#fff' : colors.text} />
      {badge ? <View style={[styles.badge, { backgroundColor: colors.accent }]} /> : null}
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.viewerBg }]}>
      <ViewerCanvas
        ref={viewer}
        modelUri={model.file_uri}
        backgroundColor={colors.viewerBg}
        dark={colors.isDark}
        cubeLabels={cubeLabels}
        showFps={settings.showFps}
        onProgress={handleProgress}
        onLoaded={handleLoaded}
        onSelection={handleSelection}
        onMeasurement={handleMeasurement}
        onMeasureState={setMeasureState}
        onCamera={handleCamera}
        onFps={(p) => setFps(p.fps)}
        onError={handleError}
      />

      {/* Ust bar */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.roundBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        <View style={[styles.titleChip, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{model.name}</Text>
          {loaded && stats ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {t('viewer.stats', { elements: stats.elements, triangles: Math.round(stats.triangles) })}
              {settings.showFps ? `  -  ${fps} ${t('viewer.fps')}` : ''}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => viewer.current?.fit()}
          style={[styles.roundBtn, { backgroundColor: colors.surface }]}
          hitSlop={8}
        >
          <Ionicons name="scan" size={20} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      {/* Yukleme katmani */}
      {!loaded && !error ? (
        <View style={[styles.loading, { backgroundColor: colors.overlay }]} pointerEvents="none">
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.text }]}>{progressLabel}</Text>
          </View>
        </View>
      ) : null}

      {/* Hata katmani */}
      {error ? (
        <View style={[styles.loading, { backgroundColor: colors.overlay }]}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>{t(error.key)}</Text>
            {error.detail ? (
              <Text style={[styles.errorDetail, { color: colors.textFaint }]} numberOfLines={3}>
                {error.code}: {error.detail}
              </Text>
            ) : null}
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.errorBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.errorBtnText}>{t('common.back')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Alt arac cubugu */}
      {loaded ? (
        <SafeAreaView style={styles.bottomBar} pointerEvents="box-none" edges={['bottom']}>
          <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ToolbarButton icon="layers-outline" onPress={() => setSheet('tree')} />
            <ToolbarButton icon="information-circle-outline" onPress={() => setSheet('props')} badge={!!selected} />
            <ToolbarButton
              icon="resize-outline"
              onPress={() => setSheet('measure')}
              active={measureMode !== 'none'}
            />
            <ToolbarButton icon="cut-outline" onPress={() => setSheet('display')} active={!!section} />
            <ToolbarButton icon="eye-outline" onPress={showAll} />
          </View>
        </SafeAreaView>
      ) : null}

      {/* Paneller */}
      <ModelTreeSheet
        visible={sheet === 'tree'}
        onClose={() => setSheet(null)}
        tree={tree}
        selectedId={selected?.id}
        hiddenIds={hiddenIds}
        onSelect={(id) => { viewer.current?.select(id, true); setSheet(null); }}
        onIsolate={isolate}
        onToggleVisible={toggleVisibility}
        onShowAll={showAll}
      />

      <PropertiesSheet
        visible={sheet === 'props'}
        onClose={() => setSheet(null)}
        element={selected}
        onIsolate={isolate}
        onHide={(ids) => { toggleVisibility(ids, true); setSheet(null); }}
        onFocus={(id) => { viewer.current?.select(id, true); setSheet(null); }}
      />

      <MeasureSheet
        visible={sheet === 'measure'}
        onClose={() => setSheet(null)}
        mode={measureMode}
        snap={measureSnap}
        unit={settings.unit}
        state={measureState}
        onModeChange={changeMeasureMode}
        onSnapChange={(v) => { setMeasureSnap(v); viewer.current?.setMeasureSnap(v); }}
        onUnitChange={(u) => { update({ unit: u }); viewer.current?.setMeasureUnit(u); }}
        onUndo={() => viewer.current?.measureUndo()}
        onRedo={() => viewer.current?.measureRedo()}
        onClear={() => viewer.current?.measureClear()}
      />

      <DisplaySheet
        visible={sheet === 'display'}
        onClose={() => setSheet(null)}
        section={section}
        onSectionChange={applySection}
        onSectionClear={clearSection}
        wireframe={wireframe}
        onWireframeChange={(v) => { setWireframe(v); viewer.current?.setWireframe(v); }}
        colorByType={colorByType}
        onColorByTypeChange={(v) => { setColorByType(v); viewer.current?.setColorByType(v); }}
        explode={explode}
        onExplodeChange={(v) => { setExplode(v); viewer.current?.setExplode(v); }}
        projection={projection}
        onProjectionChange={(p) => { setProjection(p); viewer.current?.setProjection(p); }}
        bookmarks={bookmarks}
        onSaveBookmark={saveBookmark}
        onApplyBookmark={applyBookmark}
        onDeleteBookmark={removeBookmark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12,
  },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  titleChip: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  title: { fontSize: 14.5, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },

  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingCard: {
    alignItems: 'center', gap: 12, paddingVertical: 26, paddingHorizontal: 28,
    borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, minWidth: 230,
  },
  loadingText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorTitle: { fontSize: 15.5, fontWeight: '700', textAlign: 'center', lineHeight: 21 },
  errorDetail: { fontSize: 11.5, textAlign: 'center' },
  errorBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, marginTop: 6 },
  errorBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: 10 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  toolbarBtn: { width: 46, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 8, width: 7, height: 7, borderRadius: 4 },
});
