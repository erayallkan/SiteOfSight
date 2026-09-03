/* 3B goruntuleyici ekrani: WebView sahnesi + alt arac cubugu + paneller */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import ViewerCanvas from '../viewer/ViewerCanvas';
import ModelTreeSheet from '../components/ModelTreeSheet';
import PropertiesSheet from '../components/PropertiesSheet';
import MeasureSheet from '../components/MeasureSheet';
import SectionSheet from '../components/SectionSheet';
import DisplaySheet from '../components/DisplaySheet';
import SelectionPopup from '../components/SelectionPopup';
import WalkthroughOverlay from '../components/WalkthroughOverlay';
import FloorNav from '../components/FloorNav';
import TimelineSheet from '../components/TimelineSheet';
import { addMeasurement, setModelStats, setModelThumbnail, touchModel } from '../db/database';

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
  const insets = useSafeAreaInsets();
  const viewer = useRef(null);

  const [progress, setProgress] = useState({ phase: 'boot', percent: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [tree, setTree] = useState(null);
  const [stats, setStats] = useState(null);
  const [fps, setFps] = useState(0);

  const [sheet, setSheet] = useState(null);          // tree | props | measure | section | display | walk
  const [selected, setSelected] = useState(null);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [isolatedIds, setIsolatedIds] = useState(null); // null = izole degil, aksi halde gorunen id listesi

  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);

  const [measureMode, setMeasureMode] = useState('none');
  const [measureState, setMeasureState] = useState({ canUndo: false, canRedo: false, items: [] });

  const [section, setSection] = useState(null);      // { axis, t, flipped }
  const [wireframe, setWireframe] = useState(false);
  const [xray, setXray] = useState(false);
  const [explode, setExplode] = useState(0);
  const [layerFactors, setLayerFactors] = useState({ x: 0, y: 0, z: 0 });

  const [walkPicking, setWalkPicking] = useState(false);
  const [walking, setWalking] = useState(false);

  const [storeys, setStoreys] = useState([]);
  const [floorIndex, setFloorIndex] = useState(null); // null = tum katlar

  const [timeline, setTimeline] = useState({
    built: false, loading: false, dates: [], elementsCount: 0, index: null,
  });

  useEffect(() => { touchModel(model.id).catch(() => {}); }, [model.id]);

  const cubeLabels = useMemo(() => {
    if (settings.language === 'de') {
      return { right: 'RECHTS', left: 'LINKS', top: 'OBEN', bottom: 'UNTEN', front: 'VORNE', back: 'HINTEN' };
    }
    if (settings.language === 'en') {
      return { right: 'RIGHT', left: 'LEFT', top: 'TOP', bottom: 'BOTTOM', front: 'FRONT', back: 'BACK' };
    }
    return { right: 'SAĞ', left: 'SOL', top: 'ÜST', bottom: 'ALT', front: 'ÖN', back: 'ARKA' };
  }, [settings.language]);

  /* ---------------- Viewer olaylari ---------------- */

  const handleProgress = useCallback((p) => setProgress(p), []);

  const handleLoaded = useCallback((payload) => {
    setTree(payload.tree);
    setStats(payload.stats);
    setStoreys(payload.storeys || []);
    setModelStats(model.id, payload.stats.elements, payload.stats.triangles).catch(() => {});
    // WebView tarafinda 'loaded' olayindan sonra da shader derlemesi icin bir
    // "warmup" penceresi calisiyor (assets/viewer/js/app.js). Yukleme katmanini
    // o pencere kapanana kadar acik tutup kullaniciya bos/yari-cizilmis bir kare
    // gostermemek icin kisa bir gecikmeyle kaldiriyoruz.
    setTimeout(() => setLoaded(true), 1600);
  }, [model.id]);

  /** Secim, hizli-eylem penceresini acar (bkz. SelectionPopup); tam ozellik
   *  paneli sadece "Ozellikleri Goster" ile aciliyor. */
  const handleSelection = useCallback((element) => {
    setSelected(element);
  }, []);

  const handleMeasurement = useCallback((m) => {
    addMeasurement(model.id, m).catch(() => {});
  }, [model.id]);

  const handleWalkStarted = useCallback(() => {
    setWalkPicking(false);
    setWalking(true);
  }, []);

  /** Viewer, RN'e data URL (data:image/jpeg;base64,...) olarak gonderir.
   *  ONCEDEN bunu bir dosyaya yazip file:// URI'sini Image'e veriyorduk, ama
   *  Expo Go'nun deneyim klasoru adi cift-kodlanmis ozel karakterler icerdigi
   *  icin (ör. %2540, %252F) o URI, RN Image tarafindan hatasiz ama SESSIZCE
   *  bombos gosteriliyordu. Simdi ham base64 dogrudan DB'ye yaziliyor ve
   *  Ana Ekran'da yine bir data: URI olarak okunuyor - dosya/URI hic devreye
   *  girmiyor. */
  const handleThumbnail = useCallback((payload) => {
    const base64 = String(payload?.dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
    if (!base64) return;
    setModelThumbnail(model.id, base64).catch(() => {});
  }, [model.id]);

  const handleError = useCallback((err) => {
    // Bu kodlar arka planda olan, model gorunumunu ENGELLEMEMESI gereken
    // hatalardir (ör. ozellik paneli okunamadi, tek bir kare cizimi patladi) -
    // sadece gelistirme modunda loglanir, tam ekran hata katmani ACILMAZ.
    if (['POST_FAILED', 'PROPS_FAILED', 'RENDER_FRAME_FAILED'].includes(err?.code)) {
      if (__DEV__) console.log('[viewer:non-fatal]', err?.code, err?.message);
      return;
    }
    const key = ERROR_MESSAGES[err?.code] || 'errors.parseFailed';
    setError({ key, detail: err?.message, code: err?.code });
  }, []);

  /* ---------------- Genel geri al / ileri al ----------------
   * Gorunurluk (gizle/izole), kesit, tel-kafes, x-ray ve patlatma durumunun
   * tumunu tek bir yigina alir - ölçüm kendi undo/redo'suna sahip oldugu icin
   * (MeasureSheet) buraya dahil edilmez, kat gecisi de kendi ileri/geri
   * navigasyonuna sahip oldugu icin (FloorNav) burada tekrarlanmaz. */
  const captureSnapshot = useCallback(() => ({
    hiddenIds, isolatedIds, section, wireframe, xray, explode, layerFactors,
  }), [hiddenIds, isolatedIds, section, wireframe, xray, explode, layerFactors]);

  const pushHistory = useCallback(() => {
    const snap = captureSnapshot();
    setHistoryPast((prev) => [...prev, snap]);
    setHistoryFuture([]);
  }, [captureSnapshot]);

  const applySnapshot = useCallback((snap) => {
    setHiddenIds(snap.hiddenIds);
    setIsolatedIds(snap.isolatedIds);
    setSection(snap.section);
    setWireframe(snap.wireframe);
    setXray(snap.xray);
    setExplode(snap.explode);
    setLayerFactors(snap.layerFactors);

    viewer.current?.showAll();
    if (snap.isolatedIds && snap.isolatedIds.length) viewer.current?.isolate(snap.isolatedIds);
    else if (snap.hiddenIds.size) viewer.current?.hide(Array.from(snap.hiddenIds));
    viewer.current?.clearSection();
    if (snap.section) viewer.current?.setSection(snap.section.axis, snap.section.t, snap.section.flipped);
    viewer.current?.setWireframe(snap.wireframe);
    viewer.current?.setXray(snap.xray);
    viewer.current?.setExplode(snap.explode);
    ['x', 'y', 'z'].forEach((axis) => viewer.current?.setLayerSeparate(axis, snap.layerFactors[axis] || 0));
  }, []);

  const undoHistory = useCallback(() => {
    if (!historyPast.length) return;
    const last = historyPast[historyPast.length - 1];
    setHistoryFuture((f) => [captureSnapshot(), ...f]);
    setHistoryPast((p) => p.slice(0, -1));
    applySnapshot(last);
  }, [historyPast, captureSnapshot, applySnapshot]);

  const redoHistory = useCallback(() => {
    if (!historyFuture.length) return;
    const next = historyFuture[0];
    setHistoryPast((p) => [...p, captureSnapshot()]);
    setHistoryFuture((f) => f.slice(1));
    applySnapshot(next);
  }, [historyFuture, captureSnapshot, applySnapshot]);

  /* ---------------- Arac eylemleri ---------------- */

  const toggleVisibility = useCallback((ids, hide) => {
    pushHistory();
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (hide ? next.add(id) : next.delete(id)));
      return next;
    });
    if (hide) viewer.current?.hide(ids);
    else viewer.current?.show(ids);
  }, [pushHistory]);

  const isolate = useCallback((ids) => {
    pushHistory();
    viewer.current?.isolate(ids);
    setIsolatedIds(ids);
    setSheet(null);
  }, [pushHistory]);

  const showAll = useCallback(() => {
    pushHistory();
    setHiddenIds(new Set());
    setIsolatedIds(null);
    viewer.current?.showAll();
  }, [pushHistory]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    viewer.current?.clearSelection();
  }, []);

  /** Alt cubuktaki "yenile" dugmesi: modeli tum gorunum/olcum/kesit durumunu
   *  temizleyip ilk acilistaki goruntuye dondurur. */
  const resetView = useCallback(() => {
    setHiddenIds(new Set());
    setIsolatedIds(null);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelected(null);
    setSection(null);
    setWireframe(false);
    setXray(false);
    setExplode(0);
    setLayerFactors({ x: 0, y: 0, z: 0 });
    setMeasureMode('none');
    setWalkPicking(false);
    setWalking(false);
    setFloorIndex(null);
    setTimeline((prev) => ({ ...prev, index: null }));
    viewer.current?.resetView();
  }, []);

  /* ---------------- Kat gecisi ---------------- */

  const changeFloor = useCallback((index) => {
    setFloorIndex(index);
    if (index === null) viewer.current?.showAllStoreys();
    else viewer.current?.showStorey(storeys[index]?.id);
  }, [storeys]);

  /* ---------------- Zaman tuneli (4D) ---------------- */

  const requestTimelineBuild = useCallback(() => {
    setTimeline((prev) => ({ ...prev, loading: true }));
    viewer.current?.buildTimeline();
  }, []);

  const handleTimelineReady = useCallback((payload) => {
    setTimeline({
      built: true, loading: false,
      dates: payload?.dates || [], elementsCount: payload?.elementsCount || 0,
      index: null,
    });
  }, []);

  const changeTimelineCutoff = useCallback((idx) => {
    setTimeline((prev) => {
      const ts = prev.dates[idx];
      if (ts !== undefined) viewer.current?.setTimelineCutoff(ts);
      return { ...prev, index: idx };
    });
  }, []);

  const clearTimelineFilter = useCallback(() => {
    setTimeline((prev) => ({ ...prev, index: null }));
    viewer.current?.clearTimeline();
  }, []);

  /** Kesit araci UI'si tek seferde tek eksen dustunur (secili nokta), ama
   *  webview tarafindaki SectionTool birden fazla ekseni AYNI ANDA aktif
   *  tutabilir (assets/viewer/js/tools.js). Eksen degistirildiginde eski
   *  eksenin duzlemi acikca temizlenmezse, ikisi de kirpma yapmaya devam
   *  edip kaydiraci yeni eksende surukleseniz de gorunur kesit ilk secilen
   *  eksende kalmis gibi davranir. */
  const applySection = useCallback((next) => {
    setSection((prev) => {
      if (prev?.axis && prev.axis !== next.axis) viewer.current?.clearSection(prev.axis);
      return next;
    });
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

  /** Yurume dugmesi: mahal (IFCSPACE) verisine bagli olmayan, "nereye
   *  dokunursan orada yuru" akisi baslatir - bir sonraki dokunuldugu nokta
   *  baslangic konumu olur (bkz. assets/viewer/js/app.js handleTap). */
  const startWalkPick = useCallback(() => {
    setSheet(null);
    setSelected(null);
    setWalkPicking(true);
    viewer.current?.armWalkPick();
  }, []);

  const cancelWalkPick = useCallback(() => {
    setWalkPicking(false);
    viewer.current?.cancelWalkPick();
  }, []);

  const exitWalkthrough = useCallback(() => {
    setWalking(false);
    viewer.current?.exitWalkthrough();
  }, []);

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

  const showProgressBar = progress.phase === 'transfer' || progress.phase === 'build';
  const progressPercent = Math.min(100, Math.max(0, progress.percent || 0));

  /* ---------------- Render ---------------- */

  const ToolbarButton = ({ icon, iconFamily, onPress, active, badge }) => {
    const IconComp = iconFamily === 'mci' ? MaterialCommunityIcons : Ionicons;
    return (
      <Pressable
        onPress={onPress}
        style={[styles.toolbarBtn, active && { backgroundColor: colors.accent }]}
        hitSlop={6}
      >
        <IconComp name={icon} size={21} color={active ? '#fff' : colors.text} />
        {badge ? <View style={[styles.badge, { backgroundColor: colors.accent }]} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.viewerBg }]}>
      <ViewerCanvas
        ref={viewer}
        modelUri={model.file_uri}
        backgroundColor={colors.viewerBg}
        dark={colors.isDark}
        cubeLabels={cubeLabels}
        showFps={settings.showFps}
        safeBottom={insets.bottom}
        onProgress={handleProgress}
        onLoaded={handleLoaded}
        onSelection={handleSelection}
        onMeasurement={handleMeasurement}
        onMeasureState={setMeasureState}
        onWalkStarted={handleWalkStarted}
        onFps={(p) => setFps(p.fps)}
        onError={handleError}
        onThumbnail={handleThumbnail}
        onTimelineReady={handleTimelineReady}
      />

      {!walking ? (
        <>
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
                  {t('viewer.stats', { elements: stats.elements })}
                  {settings.showFps ? `  -  ${fps} ${t('viewer.fps')}` : ''}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={undoHistory}
              disabled={!historyPast.length}
              style={[styles.roundBtn, { backgroundColor: colors.surface, opacity: historyPast.length ? 1 : 0.4 }]}
              hitSlop={8}
            >
              <Ionicons name="arrow-undo" size={19} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={redoHistory}
              disabled={!historyFuture.length}
              style={[styles.roundBtn, { backgroundColor: colors.surface, opacity: historyFuture.length ? 1 : 0.4 }]}
              hitSlop={8}
            >
              <Ionicons name="arrow-redo" size={19} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={() => viewer.current?.fit()}
              style={[styles.roundBtn, { backgroundColor: colors.surface }]}
              hitSlop={8}
            >
              <Ionicons name="scan" size={20} color={colors.text} />
            </Pressable>
          </SafeAreaView>

          <SelectionPopup
            element={!sheet ? selected : null}
            onShowProperties={() => setSheet('props')}
            onIsolate={() => selected && isolate([selected.id])}
            onHide={() => { if (selected) { toggleVisibility([selected.id], true); clearSelection(); } }}
            onClear={clearSelection}
          />

          <FloorNav storeys={storeys} currentIndex={floorIndex} onChange={changeFloor} />

          {walkPicking ? (
            <View style={styles.pickBannerWrap} pointerEvents="box-none">
              <View style={[styles.pickBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.pickBannerText, { color: colors.text }]} numberOfLines={2}>
                  {t('viewer.walkPickHint')}
                </Text>
                <Pressable onPress={cancelWalkPick} hitSlop={8} style={[styles.iconBtnSmall, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="close" size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Yukleme katmani: sahneyi tamamen orten, ekranin tam merkezinde bir
          Modal - konteynerin gercek boyu/inset hesaplarina bagli kalmadan
          her zaman fiziksel ekranin ortasinda cizilir. */}
      <Modal visible={!loaded && !error} transparent animationType="fade" statusBarTranslucent>
        <View style={[styles.loadingScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.loadingIconWrap, { backgroundColor: colors.accentSoft }]}>
              <MaterialCommunityIcons name="cube-scan" size={26} color={colors.accent} />
            </View>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.text }]} numberOfLines={1}>{progressLabel}</Text>
            </View>
            {showProgressBar ? (
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${progressPercent}%` }]} />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Hata katmani */}
      <Modal visible={!!error} transparent animationType="fade" statusBarTranslucent>
        <View style={[styles.loadingScreen, { backgroundColor: colors.bg }]}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.loadingIconWrap, { backgroundColor: colors.danger + '22' }]}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
            </View>
            {error ? <Text style={[styles.errorTitle, { color: colors.text }]}>{t(error.key)}</Text> : null}
            {error?.detail ? (
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
      </Modal>

      {/* Alt arac cubugu */}
      {loaded && !walking ? (
        <SafeAreaView style={styles.bottomBar} pointerEvents="box-none" edges={['bottom']}>
          <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ToolbarButton icon="layers-outline" onPress={() => setSheet('tree')} />
            <ToolbarButton icon="information-circle-outline" onPress={() => setSheet('props')} badge={!!selected} />
            <ToolbarButton
              icon="ruler"
              iconFamily="mci"
              onPress={() => setSheet('measure')}
              active={measureMode !== 'none'}
            />
            <ToolbarButton icon="cut-outline" onPress={() => setSheet('section')} active={!!section} />
            <ToolbarButton
              icon="cube-outline"
              onPress={() => setSheet('display')}
              active={wireframe || xray || explode > 0 || layerFactors.x > 0 || layerFactors.y > 0 || layerFactors.z > 0}
            />
            <ToolbarButton icon="calendar-outline" onPress={() => setSheet('timeline')} active={timeline.index !== null} />
            <ToolbarButton icon="walk-outline" onPress={startWalkPick} active={walkPicking} />
            <ToolbarButton icon="refresh-outline" onPress={resetView} />
          </View>
        </SafeAreaView>
      ) : null}

      <WalkthroughOverlay
        visible={walking}
        onExit={exitWalkthrough}
        onMove={(x, y) => viewer.current?.walkMove(x, y)}
        onLook={(x, y) => viewer.current?.walkLook(x, y)}
        onSpeedChange={(speed) => viewer.current?.setWalkSpeed(speed)}
      />

      {/* Paneller */}
      <ModelTreeSheet
        visible={sheet === 'tree'}
        onClose={() => setSheet(null)}
        tree={tree}
        selectedId={selected?.id}
        hiddenIds={hiddenIds}
        onSelect={(id, fromSearch) => { viewer.current?.select(id, true, fromSearch); setSheet(null); }}
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
        unit={settings.unit}
        state={measureState}
        onModeChange={changeMeasureMode}
        onUnitChange={(u) => { update({ unit: u }); viewer.current?.setMeasureUnit(u); }}
        onUndo={() => viewer.current?.measureUndo()}
        onRedo={() => viewer.current?.measureRedo()}
        onClear={() => viewer.current?.measureClear()}
      />

      <SectionSheet
        visible={sheet === 'section'}
        onClose={() => setSheet(null)}
        section={section}
        onSectionChange={applySection}
        onSectionClear={clearSection}
        onCommit={pushHistory}
      />

      <DisplaySheet
        visible={sheet === 'display'}
        onClose={() => setSheet(null)}
        wireframe={wireframe}
        onWireframeChange={(v) => { pushHistory(); setWireframe(v); viewer.current?.setWireframe(v); }}
        xray={xray}
        onXrayChange={(v) => { pushHistory(); setXray(v); viewer.current?.setXray(v); }}
        explode={explode}
        onExplodeChange={(v) => { setExplode(v); viewer.current?.setExplode(v); }}
        layerFactors={layerFactors}
        onLayerAxisChange={(axis, v) => {
          setLayerFactors((prev) => ({ ...prev, [axis]: v }));
          viewer.current?.setLayerSeparate(axis, v);
        }}
        onDragStart={pushHistory}
      />

      <TimelineSheet
        visible={sheet === 'timeline'}
        onClose={() => setSheet(null)}
        state={timeline}
        onRequestBuild={requestTimelineBuild}
        onCutoffChange={changeTimelineCutoff}
        onClearFilter={clearTimelineFilter}
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

  pickBannerWrap: { position: 'absolute', top: 62, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20 },
  pickBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 340,
    paddingLeft: 14, paddingRight: 8, paddingVertical: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  pickBannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  iconBtnSmall: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingCard: {
    alignItems: 'center', gap: 14, paddingVertical: 28, paddingHorizontal: 30,
    borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, minWidth: 250,
    shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  loadingIconWrap: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 220 },
  loadingText: { fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  errorTitle: { fontSize: 15.5, fontWeight: '700', textAlign: 'center', lineHeight: 21 },
  errorDetail: { fontSize: 11.5, textAlign: 'center' },
  errorBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, marginTop: 6 },
  errorBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: 10 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 8, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  toolbarBtn: { width: 40, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
});
