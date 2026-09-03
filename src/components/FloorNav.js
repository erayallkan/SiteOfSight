/* Kat gecisi: yukari/asagi butonlariyla tek bir kati izole edip ona sigdirir.
   Sadece birden fazla kati olan modellerde gorunur (bkz. ViewerScreen). */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';

export default function FloorNav({ storeys, currentIndex, onChange }) {
  const { colors, t } = useApp();
  if (!storeys || storeys.length < 2) return null;

  const atTop = currentIndex === storeys.length - 1;
  const atBottom = currentIndex === 0;

  const goUp = () => onChange(currentIndex === null ? storeys.length - 1 : Math.min(storeys.length - 1, currentIndex + 1));
  const goDown = () => onChange(currentIndex === null ? 0 : Math.max(0, currentIndex - 1));

  const label = currentIndex === null ? t('viewer.allFloors') : storeys[currentIndex].name;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="box-none">
      <Pressable onPress={goUp} disabled={atTop} hitSlop={8} style={styles.btn}>
        <Ionicons name="chevron-up" size={19} color={atTop ? colors.textFaint : colors.text} />
      </Pressable>
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={2}>{label}</Text>
      </View>
      <Pressable onPress={goDown} disabled={atBottom} hitSlop={8} style={styles.btn}>
        <Ionicons name="chevron-down" size={19} color={atBottom ? colors.textFaint : colors.text} />
      </Pressable>
      {currentIndex !== null ? (
        <Pressable onPress={() => onChange(null)} hitSlop={8} style={[styles.btn, styles.clearBtn, { borderTopColor: colors.border }]}>
          <Ionicons name="apps-outline" size={16} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', right: 12, top: '36%',
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center',
    paddingVertical: 4, width: 48,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  btn: { width: 42, height: 34, alignItems: 'center', justifyContent: 'center' },
  labelWrap: { paddingVertical: 4, maxWidth: 44 },
  label: { fontSize: 9.5, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
  clearBtn: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
});
