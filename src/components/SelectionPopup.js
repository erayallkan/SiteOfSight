/* Eleman secilince ekrana cikan kucuk, konumlandirilmis hizli-eylem penceresi.
   Dokunulan noktaya yakin belirir (koordinat yoksa ekran ortasina). */
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { typeInfo, prettyType } from '../utils/ifcTypes';

const CARD_WIDTH = 236;

function clampPosition(x, y) {
  const { width, height } = Dimensions.get('window');
  const left = Math.min(Math.max(x - CARD_WIDTH / 2, 12), width - CARD_WIDTH - 12);
  const top = Math.min(Math.max(y - 170, 70), height - 220);
  return { left, top };
}

export default function SelectionPopup({ element, onShowProperties, onIsolate, onHide, onClear }) {
  const { colors, t } = useApp();
  if (!element) return null;

  const info = typeInfo(element.type);
  const hasCoords = typeof element.tapX === 'number' && typeof element.tapY === 'number';
  const pos = hasCoords
    ? clampPosition(element.tapX, element.tapY)
    : null;

  const Action = ({ icon, label, onPress, danger }) => (
    <Pressable onPress={onPress} style={styles.action} hitSlop={4}>
      <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.actionText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View
      pointerEvents="box-none"
      style={pos ? [styles.anchored, { left: pos.left, top: pos.top }] : styles.centered}
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: `${info.color}22` }]}>
            <Ionicons name={info.icon} size={16} color={info.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {element.name || prettyType(element.type)}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {prettyType(element.type)}
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Action icon="information-circle-outline" label={t('viewer.showProperties')} onPress={onShowProperties} />
        <Action icon="scan-outline" label={t('viewer.isolate')} onPress={onIsolate} />
        <Action icon="eye-off-outline" label={t('viewer.hide')} onPress={onHide} />
        <Action icon="close-circle-outline" label={t('viewer.clearSelection')} onPress={onClear} danger />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchored: { position: 'absolute', width: CARD_WIDTH, zIndex: 20 },
  centered: { position: 'absolute', left: '50%', top: '38%', width: CARD_WIDTH, marginLeft: -CARD_WIDTH / 2, zIndex: 20 },
  card: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  badge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 11.5, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  actionText: { fontSize: 14, fontWeight: '600' },
});
