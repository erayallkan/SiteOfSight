/* Kucuk, bagimsiz UI parcalari: BottomSheet, Slider, SegmentedControl, Row, Pill */
import React, { useRef, useState } from 'react';
import {
  Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';

/* ---------------- BottomSheet ---------------- */

export function BottomSheet({ visible, onClose, title, children, heightRatio = 0.62, footer }) {
  const { colors } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[s.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View
        style={[
          s.sheet,
          { backgroundColor: colors.sheet, borderColor: colors.border, height: `${Math.round(heightRatio * 100)}%` },
        ]}
      >
        <View style={s.grabber}>
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
    </Modal>
  );
}

/* ---------------- Slider (bagimsiz, PanResponder ile) ---------------- */

export function Slider({ value, onChange, onChangeEnd, min = 0, max = 1, height = 34, trackColor, ticks = 0 }) {
  const { colors } = useApp();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const toValue = (x) => {
    const w = widthRef.current || 1;
    const ratio = Math.min(1, Math.max(0, x / w));
    return min + (max - min) * ratio;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange?.(toValue(e.nativeEvent.locationX)),
      onPanResponderMove: (e, g) => {
        const x = e.nativeEvent.locationX ?? g.moveX;
        onChange?.(toValue(x));
      },
      onPanResponderRelease: () => onChangeEnd?.(valueRef.current),
      onPanResponderTerminate: () => onChangeEnd?.(valueRef.current),
    })
  ).current;

  const ratio = max === min ? 0 : (value - min) / (max - min);

  return (
    <View>
      <View
        style={{ height, justifyContent: 'center' }}
        onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
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
  const { colors } = useApp();
  return <Text style={[s.sectionTitle, { color: colors.textFaint }]}>{String(children).toUpperCase()}</Text>;
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
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth,
  },
  grabber: { alignItems: 'center', paddingTop: 8 },
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
