/* Kesit (section) araci: XYZ duzlemi, kaydirici, yon cevirme. Goruntuleme
   ayarlarindan (tel kafes / patlat / katman ayir) bagimsiz, kendi butonunda acilir. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { BottomSheet, ScrollArea, Slider, SectionTitle } from './ui';

const AXES = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'z', label: 'Z' },
];

/** Referans goruntuleyicideki dairesel eksen dugmesi: secili eksen vurgulu halka. */
function AxisDot({ label, active, onPress }) {
  const { colors } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.dot,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
        },
      ]}
    >
      <Text style={[styles.dotText, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

export default function SectionSheet({
  visible, onClose, section, onSectionChange, onSectionClear, onCommit,
}) {
  const { colors, t } = useApp();
  const axis = section?.axis || null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.section')} heightRatio={0.4} nonModal>
      <ScrollArea contentStyle={{ paddingHorizontal: 14 }}>
        <View style={styles.header}>
          <SectionTitle>{t('viewer.section')}</SectionTitle>
          <View style={styles.headerIcons}>
            <Pressable
              onPress={() => { if (axis) { onCommit?.(); onSectionChange({ ...section, flipped: !section.flipped }); } }}
              disabled={!axis}
              style={[styles.iconBtn, { borderColor: colors.border, opacity: axis ? 1 : 0.4 }]}
            >
              <Ionicons name="swap-horizontal" size={17} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => { if (axis) { onCommit?.(); onSectionClear?.(); } }}
              disabled={!axis}
              style={[styles.iconBtn, { borderColor: colors.border, opacity: axis ? 1 : 0.4 }]}
            >
              <Ionicons name="close" size={17} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.axisRow}>
          {AXES.map((a) => (
            <AxisDot
              key={a.key}
              label={a.label}
              active={axis === a.key}
              onPress={() => {
                onCommit?.();
                onSectionChange({ axis: a.key, t: section?.t ?? 0.5, flipped: section?.flipped ?? false });
              }}
            />
          ))}
        </View>

        {axis ? (
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.axisLabel, { color: colors.text }]}>
              {axis.toUpperCase()} {t('section.axis')}
            </Text>
            <Slider
              value={section.t}
              min={0}
              max={1}
              ticks={21}
              onChange={(v) => onSectionChange({ ...section, t: v })}
              onChangeStart={onCommit}
            />
          </View>
        ) : (
          <Text style={[styles.meta, { color: colors.textFaint, marginTop: 8 }]}>{t('section.hint')}</Text>
        )}
      </ScrollArea>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16,
  },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: {
    width: 50, height: 50, borderRadius: 25, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dotText: { fontSize: 16, fontWeight: '700' },
  axisRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  axisLabel: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  meta: { fontSize: 12.5 },
});
