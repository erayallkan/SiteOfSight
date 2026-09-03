/* Goruntuleme araclari: kesit duzlemi (XYZ), tel kafes, tipe gore renk,
   patlatma, projeksiyon ve kayitli gorunumler. */
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { BottomSheet, ScrollArea, Segmented, Slider, SwitchRow, SectionTitle } from './ui';

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
        axisStyles.dot,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
        },
      ]}
    >
      <Text style={[axisStyles.dotText, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const axisStyles = StyleSheet.create({
  dot: {
    width: 50, height: 50, borderRadius: 25, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dotText: { fontSize: 16, fontWeight: '700' },
});

export default function DisplaySheet({
  visible, onClose,
  section, onSectionChange, onSectionClear,
  wireframe, onWireframeChange,
  colorByType, onColorByTypeChange,
  explode, onExplodeChange,
  projection, onProjectionChange,
  bookmarks, onSaveBookmark, onApplyBookmark, onDeleteBookmark,
}) {
  const { colors, t } = useApp();

  const axis = section?.axis || null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.display')} heightRatio={0.74}>
      <ScrollArea contentStyle={{ paddingHorizontal: 14 }}>
        {/* ---- Kesit ---- */}
        <View style={styles.sectionHeader}>
          <SectionTitle>{t('viewer.section')}</SectionTitle>
          <View style={styles.sectionHeaderIcons}>
            <Pressable
              onPress={() => axis && onSectionChange({ ...section, flipped: !section.flipped })}
              disabled={!axis}
              style={[styles.iconBtn, { borderColor: colors.border, opacity: axis ? 1 : 0.4 }]}
            >
              <Ionicons name="swap-horizontal" size={17} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={onSectionClear}
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
              onPress={() => onSectionChange({ axis: a.key, t: section?.t ?? 0.5, flipped: section?.flipped ?? false })}
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
            />
          </View>
        ) : (
          <Text style={[styles.meta, { color: colors.textFaint, marginTop: 8 }]}>{t('section.hint')}</Text>
        )}

        {/* ---- Goruntuleme ---- */}
        <SectionTitle>{t('viewer.display')}</SectionTitle>
        <SwitchRow label={t('viewer.wireframe')} value={wireframe} onValueChange={onWireframeChange} icon="grid-outline" />
        <SwitchRow label={t('viewer.colorByType')} value={colorByType} onValueChange={onColorByTypeChange} icon="color-palette-outline" />

        <View style={{ marginTop: 14 }}>
          <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 6 }]}>
            {t('viewer.explode')}: {Math.round(explode * 100)}%
          </Text>
          <Slider value={explode} min={0} max={1.5} onChange={onExplodeChange} />
        </View>

        <View style={{ marginTop: 16 }}>
          <Segmented
            value={projection}
            onChange={onProjectionChange}
            options={[
              { key: 'perspective', label: t('viewer.perspective') },
              { key: 'orthographic', label: t('viewer.orthographic') },
            ]}
          />
        </View>

        {/* ---- Kayitli gorunumler ---- */}
        <SectionTitle>{t('viewer.bookmarks')}</SectionTitle>
        <Pressable
          onPress={() => {
            Alert.prompt
              ? Alert.prompt(t('viewer.saveView'), t('viewer.viewName'), (value) => onSaveBookmark(value || `Gorunum ${(bookmarks?.length || 0) + 1}`))
              : onSaveBookmark(`Gorunum ${(bookmarks?.length || 0) + 1}`);
          }}
          style={[styles.saveBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
        >
          <Ionicons name="bookmark-outline" size={17} color={colors.accent} />
          <Text style={[styles.saveText, { color: colors.accent }]}>{t('viewer.saveView')}</Text>
        </Pressable>

        {(bookmarks || []).map((b) => (
          <View key={b.id} style={[styles.bookmark, { borderBottomColor: colors.border }]}>
            <Pressable style={{ flex: 1 }} onPress={() => onApplyBookmark(b)}>
              <Text style={[styles.bookmarkName, { color: colors.text }]} numberOfLines={1}>{b.name}</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => onDeleteBookmark(b.id)}>
              <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </ScrollArea>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16,
  },
  sectionHeaderIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  axisRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  axisLabel: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  meta: { fontSize: 12.5 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 4,
  },
  saveText: { fontSize: 14, fontWeight: '700' },
  bookmark: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookmarkName: { fontSize: 14.5, fontWeight: '600' },
});
