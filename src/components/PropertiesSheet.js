/* Secilen elemanin metadatasi: kimlik karti + tum Pset/miktar listesi */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { BottomSheet, ScrollArea, SectionTitle, EmptyState } from './ui';
import { typeInfo, prettyType } from '../utils/ifcTypes';

function KeyValue({ label, value, colors }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={[styles.kv, { borderBottomColor: colors.border }]}>
      <Text style={[styles.key, { color: colors.textMuted }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]} selectable numberOfLines={4}>{String(value)}</Text>
    </View>
  );
}

export default function PropertiesSheet({ visible, onClose, element, onIsolate, onHide, onFocus }) {
  const { colors, t } = useApp();

  if (!element) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title={t('viewer.properties')} heightRatio={0.4}>
        <EmptyState icon="hand-left-outline" title={t('viewer.noSelection')} />
      </BottomSheet>
    );
  }

  const info = typeInfo(element.type);
  const dims = element.dimensions;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.properties')} heightRatio={0.68}>
      <ScrollArea>
        {/* Kimlik karti */}
        <View style={[styles.card, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <View style={[styles.badge, { backgroundColor: `${info.color}22` }]}>
            <Ionicons name={info.icon} size={22} color={info.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {element.name || prettyType(element.type)}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {prettyType(element.type)} - #{element.id}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => onFocus?.(element.id)} style={[styles.action, { borderColor: colors.border }]}>
            <Ionicons name="locate-outline" size={16} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>{t('viewer.fit')}</Text>
          </Pressable>
          <Pressable onPress={() => onIsolate?.([element.id])} style={[styles.action, { borderColor: colors.border }]}>
            <Ionicons name="scan-outline" size={16} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>{t('viewer.isolate')}</Text>
          </Pressable>
          <Pressable onPress={() => onHide?.([element.id])} style={[styles.action, { borderColor: colors.border }]}>
            <Ionicons name="eye-off-outline" size={16} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>{t('viewer.hide')}</Text>
          </Pressable>
        </View>

        <SectionTitle>{t('props.identity')}</SectionTitle>
        <KeyValue label={t('props.name')} value={element.name} colors={colors} />
        <KeyValue label={t('props.type')} value={element.type} colors={colors} />
        <KeyValue label={t('props.globalId')} value={element.globalId} colors={colors} />
        <KeyValue label={t('props.tag')} value={element.tag} colors={colors} />
        <KeyValue label={t('props.description')} value={element.description} colors={colors} />
        <KeyValue label={t('props.material')} value={element.material} colors={colors} />

        {dims ? (
          <>
            <SectionTitle>{t('props.dimensions')}</SectionTitle>
            <KeyValue label={t('props.width')} value={dims.x.toFixed(0)} colors={colors} />
            <KeyValue label={t('props.height')} value={dims.y.toFixed(0)} colors={colors} />
            <KeyValue label={t('props.depth')} value={dims.z.toFixed(0)} colors={colors} />
          </>
        ) : null}

        {element.quantities?.length ? (
          <>
            <SectionTitle>{t('props.quantities')}</SectionTitle>
            {element.quantities.map((q, i) => (
              <KeyValue key={`${q.name}-${i}`} label={q.name} value={q.value} colors={colors} />
            ))}
          </>
        ) : null}

        {element.psets?.length ? (
          <>
            <SectionTitle>{t('props.psets')}</SectionTitle>
            {element.psets.map((ps, i) => (
              <View key={`${ps.name}-${i}`}>
                <Text style={[styles.psetName, { color: colors.accent }]}>{ps.name}</Text>
                {ps.properties.map((p, j) => (
                  <KeyValue
                    key={`${p.name}-${j}`}
                    label={p.name}
                    value={p.unit ? `${p.value} ${p.unit}` : p.value}
                    colors={colors}
                  />
                ))}
              </View>
            ))}
          </>
        ) : null}
      </ScrollArea>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, margin: 14, padding: 14,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  badge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16.5, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 4 },
  action: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 13, fontWeight: '600' },
  kv: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 16, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  key: { flex: 1, fontSize: 13.5 },
  value: { flex: 1.2, fontSize: 13.5, fontWeight: '600', textAlign: 'right' },
  psetName: { fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
