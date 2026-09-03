/* Olcum arac kutusu: mod secimi, birim, undo/redo ve olcum gecmisi.
   Kose/kenar yakalama her zaman acik. */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { BottomSheet, Segmented, SectionTitle, EmptyState } from './ui';

const ITEM_ICON = { distance: 'resize-outline', angle: 'triangle-outline', laser: 'scan-outline' };

const UNITS = [
  { key: 'mm', label: 'mm' },
  { key: 'cm', label: 'cm' },
  { key: 'm', label: 'm' },
];

export default function MeasureSheet({
  visible, onClose, mode, unit, state,
  onModeChange, onUnitChange, onUndo, onRedo, onClear,
}) {
  const { colors, t } = useApp();
  const items = state?.items || [];

  const ToolButton = ({ icon, label, onPress, disabled, danger }) => (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.toolBtn,
        { borderColor: colors.border, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.toolText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.measure')} heightRatio={0.66}>
      <View style={{ paddingHorizontal: 14 }}>
        <SectionTitle>{t('measure.mode')}</SectionTitle>
        <Segmented
          value={mode}
          onChange={onModeChange}
          options={[
            { key: 'none', label: t('measure.off') },
            { key: 'distance', label: t('measure.distance') },
            { key: 'angle', label: t('measure.angle') },
            { key: 'laser', label: t('measure.laser') },
          ]}
        />
        {mode === 'laser' ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('measure.hintLaser')}</Text>
        ) : mode !== 'none' ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('measure.hint')}</Text>
        ) : null}

        <SectionTitle>{t('measure.unit')}</SectionTitle>
        <Segmented value={unit} onChange={onUnitChange} options={UNITS} />

        <View style={styles.tools}>
          <ToolButton icon="arrow-undo-outline" label={t('measure.undo')} onPress={onUndo} disabled={!state?.canUndo} />
          <ToolButton icon="arrow-redo-outline" label={t('measure.redo')} onPress={onRedo} disabled={!state?.canRedo} />
          <ToolButton icon="trash-outline" label={t('measure.clearAll')} onPress={onClear} disabled={!items.length} danger />
        </View>

        <SectionTitle>{t('measure.history')}</SectionTitle>
      </View>

      {items.length === 0 ? (
        <EmptyState icon="resize-outline" title={t('measure.empty')} />
      ) : (
        <FlatList
          data={[...items].reverse()}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Ionicons
                name={ITEM_ICON[item.kind] || 'resize-outline'}
                size={17}
                color={item.kind === 'distance' ? colors.info : item.kind === 'laser' ? colors.danger : colors.warning}
              />
              <Text style={[styles.rowText, { color: colors.text }]}>{item.text}</Text>
              <Text style={[styles.rowMeta, { color: colors.textFaint }]}>
                {item.kind === 'distance' ? t('measure.distance') : item.kind === 'laser' ? t('measure.laser') : t('measure.angle')}
              </Text>
            </View>
          )}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12.5, marginTop: 8, lineHeight: 18 },
  tools: { flexDirection: 'row', gap: 8, marginTop: 14 },
  toolBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  toolText: { fontSize: 12.5, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12 },
});
