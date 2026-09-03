/* Olcum arac kutusu: mod secimi, snap, birim, undo/redo ve olcum gecmisi */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { BottomSheet, Segmented, SwitchRow, SectionTitle, EmptyState } from './ui';

const UNITS = [
  { key: 'mm', label: 'mm' },
  { key: 'cm', label: 'cm' },
  { key: 'm', label: 'm' },
];

export default function MeasureSheet({
  visible, onClose, mode, snap, unit, state,
  onModeChange, onSnapChange, onUnitChange, onUndo, onRedo, onClear,
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
          ]}
        />
        {mode !== 'none' ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('measure.hint')}</Text>
        ) : null}

        <SectionTitle>{t('measure.unit')}</SectionTitle>
        <Segmented value={unit} onChange={onUnitChange} options={UNITS} />

        <View style={{ marginTop: 8 }}>
          <SwitchRow label={t('measure.snap')} value={snap} onValueChange={onSnapChange} icon="magnet-outline" />
        </View>

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
                name={item.kind === 'distance' ? 'resize-outline' : 'triangle-outline'}
                size={17}
                color={item.kind === 'distance' ? colors.info : colors.warning}
              />
              <Text style={[styles.rowText, { color: colors.text }]}>{item.text}</Text>
              <Text style={[styles.rowMeta, { color: colors.textFaint }]}>
                {item.kind === 'distance' ? t('measure.distance') : t('measure.angle')}
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
