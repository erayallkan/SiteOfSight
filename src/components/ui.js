/* Kucuk, bagimsiz UI parcalari: BottomSheet, Slider, SegmentedControl, Row, Pill */
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';

/* ---------------- BottomSheet ---------------- */

/** nonModal: true iken RN Modal kullanilmaz - panel sadece kendi alaninda
 *  dokunuş yakalar, geri kalan ekran (ör. 3B sahne) altta etkilesimde kalir.
 *  Acikken sahnenin de oynatilabilmesi gereken goruntuleyici panelleri
 *  (kat agaci, ozellikler, olcum, kesit, goruntuleme, zaman tuneli) icin
 *  kullanilir. Ust bardaki tutamactan (grabber) surukleyerek yukseklik
 *  MIN_SHEET_RATIO..MAX_SHEET_RATIO araliginda degistirilebilir. */
const MIN_SHEET_RATIO = 0.22;
const MAX_SHEET_RATIO = 0.92;

export function BottomSheet({ visible, onClose, title, children, heightRatio = 0.62, footer, nonModal = false }) {
  const { colors } = useApp();

  // Panel her acildiginda varsayilan yukseklige donsun diye ratio, gorunurluk
  // gecisinde sifirlanir; acikken grabber'dan surukleyerek degistirilebilir.
  const [ratio, setRatio] = useState(heightRatio);
  const ratioRef = useRef(heightRatio);
  const startRatioRef = useRef(heightRatio);

  useEffect(() => {
    if (visible) {
      ratioRef.current = heightRatio;
      setRatio(heightRatio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => { startRatioRef.current = ratioRef.current; },
      onPanResponderMove: (evt, g) => {
        const screenH = Dimensions.get('window').height || 1;
        const next = Math.min(MAX_SHEET_RATIO, Math.max(MIN_SHEET_RATIO, startRatioRef.current - g.dy / screenH));
        ratioRef.current = next;
        setRatio(next);
      },
    })
  ).current;

  const panel = (
    <View
      style={[
        s.sheet,
        { backgroundColor: colors.sheet, borderColor: colors.border, height: `${Math.round(ratio * 100)}%` },
      ]}
    >
      <View style={s.grabber} {...dragResponder.panHandlers}>
        <View style={[s.grabberBar, { backgroundColor: colors.border }]} />
      </View>
      <View style={s.sheetHeader}>
        <Text style={[s.sheetTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={12} style={[s.iconButton, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="checkmark" size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      {footer ? <View style={[s.sheetFooter, { borderTopColor: colors.border }]}>{footer}</View> : null}
    </View>
  );

  if (nonModal) {
    // NOT: burada ayrica tam ekran bir "box-none" sarmalayici KULLANILMAZ -
    // WebView uzerine boyle bir sarmalayici koymak ic dokunuslarin
    // (Pressable/PanResponder) guvenilir sekilde ulasmasini engelliyordu.
    // panel zaten kendi alaniyla sinirli (bottom'a sabit, height: %X) bir
    // absolute View oldugu icin ust bar/alt cubukla ayni, kanitlanmis
    // desenle dogrudan dondurulur.
    if (!visible) return null;
    return panel;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[s.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      {panel}
    </Modal>
  );
}

/* ---------------- Slider (bagimsiz, PanResponder ile) ---------------- */

export function Slider({ value, onChange, onChangeStart, onChangeEnd, min = 0, max = 1, height = 34, trackColor, ticks = 0 }) {
  const { colors } = useApp();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const grantValueRef = useRef(value);
  const containerRef = useRef(null);
  const containerPageXRef = useRef(0);

  const toValue = (x) => {
    const w = widthRef.current || 1;
    const ratio = Math.min(1, Math.max(0, x / w));
    return min + (max - min) * ratio;
  };

  const clampValue = (v) => Math.min(max, Math.max(min, v));

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // NOT: e.nativeEvent.locationX, dokunulan native view'a gore hesaplanir -
      // thumb dairesine dokunuldugunda locationX, track degil thumb'in kendi
      // koordinat uzayinda (0-26px) geliyor ve deger geriye sicriyordu. pageX'ten
      // container'in olculen sayfa konumunu cikararak her zaman track'e gore
      // sabit bir referans kullanilir.
      onPanResponderGrant: (e) => {
        onChangeStart?.(valueRef.current); // surukleme baslamadan ONCEKI degerle - geri al icin
        const v = toValue(e.nativeEvent.pageX - containerPageXRef.current);
        grantValueRef.current = v;
        onChange?.(v);
      },
      // gestureState.dx da ayni sebeple (referans view degisimi) titremeye yol
      // acmasin diye ilk dokunuş noktasina gore sabit bir referansla olculur.
      onPanResponderMove: (e, g) => {
        const w = widthRef.current || 1;
        const delta = (g.dx / w) * (max - min);
        onChange?.(clampValue(grantValueRef.current + delta));
      },
      onPanResponderRelease: () => onChangeEnd?.(valueRef.current),
      onPanResponderTerminate: () => onChangeEnd?.(valueRef.current),
    })
  ).current;

  const ratio = max === min ? 0 : (value - min) / (max - min);

  const measureContainer = () => {
    containerRef.current?.measure((x, y, w, h, pageX) => { containerPageXRef.current = pageX; });
  };

  return (
    <View>
      <View
        ref={containerRef}
        style={{ height, justifyContent: 'center' }}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
          measureContainer();
        }}
        {...responder.panHandlers}
      >
        <View style={[s.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[s.fill, { width: `${ratio * 100}%`, backgroundColor: trackColor || colors.accent }]} />
        </View>
        <View
          style={[
            s.thumb,
            { left: Math.max(0, Math.min(width - 26, ratio * width - 13)), borderColor: colors.border },
          ]}
        />
      </View>
      {ticks > 1 ? (
        <View pointerEvents="none" style={s.ticks}>
          {Array.from({ length: ticks }).map((_, i) => (
            <View key={i} style={[s.tick, { backgroundColor: colors.border }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ---------------- SegmentedControl ---------------- */

export function Segmented({ options, value, onChange, style }) {
  const { colors } = useApp();
  return (
    <View style={[s.segment, { backgroundColor: colors.surfaceAlt }, style]}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[s.segmentItem, active && { backgroundColor: colors.surface }]}
          >
            <Text
              style={[
                s.segmentText,
                { color: active ? colors.text : colors.textMuted, fontWeight: active ? '700' : '500' },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Satirlar ---------------- */

export function Row({ label, value, icon, onPress, right, children }) {
  const { colors } = useApp();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[s.row, { borderBottomColor: colors.border }]}>
      {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 10 }} /> : null}
      <Text style={[s.rowLabel, { color: colors.text }]} numberOfLines={2}>{label}</Text>
      {children}
      {value !== undefined ? (
        <Text style={[s.rowValue, { color: colors.textMuted }]} numberOfLines={2}>{String(value)}</Text>
      ) : null}
      {right}
    </Wrapper>
  );
}

export function SwitchRow({ label, value, onValueChange, icon }) {
  const { colors } = useApp();
  return (
    <Row label={label} icon={icon}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
        thumbColor="#fff"
      />
    </Row>
  );
}

export function SectionTitle({ children }) {
  const { colors, language } = useApp();
  // JS'in yerel-ayarsiz toUpperCase()'i 'i' -> 'I' (noktasiz) donusturur; bu
  // Turkce'de yanlis (dogrusu 'İ', noktali). Dile gore yerel-ayarli buyut.
  const text = language === 'tr'
    ? String(children).toLocaleUpperCase('tr-TR')
    : String(children).toUpperCase();
  return <Text style={[s.sectionTitle, { color: colors.textFaint }]}>{text}</Text>;
}

export function Pill({ label, active, onPress, icon, color }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.pill,
        {
          backgroundColor: active ? (color || colors.accent) : colors.surfaceAlt,
          borderColor: active ? (color || colors.accent) : colors.border,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={active ? '#fff' : colors.textMuted} style={{ marginRight: 6 }} />
      ) : null}
      <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon = 'cube-outline', title, hint }) {
  const { colors } = useApp();
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={44} color={colors.textFaint} />
      <Text style={[s.emptyTitle, { color: colors.text }]}>{title}</Text>
      {hint ? <Text style={[s.emptyHint, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function ScrollArea({ children, contentStyle }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingBottom: 28 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth,
  },
  grabber: { alignItems: 'center', paddingVertical: 10 },
  grabberBar: { width: 42, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  sheetFooter: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute', width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  ticks: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 2, marginTop: 6,
  },
  tick: { width: 2, height: 7, borderRadius: 1 },

  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 13 },

  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  rowLabel: { flex: 1, fontSize: 14.5 },
  rowValue: { fontSize: 14, maxWidth: '55%', textAlign: 'right' },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },

  pill: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },

  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  emptyHint: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
});
