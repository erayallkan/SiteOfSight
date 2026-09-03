/* 4D zaman tuneli: Pset'lerinde ISO tarih iceren elemanlari secili tarihe
   gore gizler/gosterir. Tarih tasimayan elemanlar (cogu model) her zaman
   gorunur kalir - bkz. assets/viewer/js/app.js 'timelineSet'. */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store/AppContext';
import { BottomSheet, EmptyState, Pill, ScrollArea, Slider } from './ui';

export default function TimelineSheet({
  visible, onClose, state, onRequestBuild, onCutoffChange, onClearFilter,
}) {
  const { colors, t, language } = useApp();
  const { built, loading, dates, elementsCount, index } = state;
  const [dragIndex, setDragIndex] = useState(index);

  useEffect(() => { setDragIndex(index); }, [index]);
  useEffect(() => { if (visible && !built && !loading) onRequestBuild?.(); }, [visible, built, loading, onRequestBuild]);

  const sliderIndex = dragIndex === null ? (dates.length ? dates.length - 1 : 0) : dragIndex;

  const dateLabel = useMemo(() => {
    if (!dates.length) return '';
    const ts = dates[Math.round(sliderIndex)];
    return new Date(ts).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US');
  }, [dates, sliderIndex, language]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.timeline')} heightRatio={0.42} nonModal>
      <ScrollArea contentStyle={{ paddingHorizontal: 16 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.centerText, { color: colors.textMuted }]}>{t('viewer.timelineScanning')}</Text>
          </View>
        ) : !built || dates.length === 0 ? (
          <EmptyState icon="calendar-outline" title={t('viewer.timelineEmpty')} />
        ) : (
          <>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {t('viewer.timelineElements', { count: elementsCount })}
            </Text>

            <View style={{ marginTop: 16 }}>
              <Text style={[styles.dateLabel, { color: colors.text }]}>{dateLabel}</Text>
              <Slider
                value={sliderIndex}
                min={0}
                max={Math.max(dates.length - 1, 0)}
                onChange={(v) => setDragIndex(Math.round(v))}
                onChangeEnd={(v) => onCutoffChange?.(Math.round(v))}
              />
            </View>

            <View style={{ marginTop: 16, flexDirection: 'row' }}>
              <Pill
                label={t('viewer.timelineClear')}
                icon="refresh-outline"
                active={index === null}
                onPress={onClearFilter}
              />
            </View>
          </>
        )}
      </ScrollArea>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 10 },
  centerText: { fontSize: 13.5 },
  meta: { fontSize: 12.5, marginTop: 4 },
  dateLabel: { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
});
