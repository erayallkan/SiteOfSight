/* 4D zaman tuneli: Pset'lerinde ISO tarih iceren elemanlari secili tarihe
   gore gizler/gosterir/turuncu vurgular (baslamadi/devam ediyor/tamamlandi).
   Tarih tasimayan elemanlar (cogu model) her zaman gorunur kalir - bkz.
   assets/viewer/js/app.js 'timelineSet'. Oynat/duraklat, kesim tarihini
   tarih listesinde otomatik ilerletir. */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store/AppContext';
import { BottomSheet, EmptyState, Pill, ScrollArea, Slider } from './ui';

const PLAY_STEP_MS = 700;

export default function TimelineSheet({
  visible, onClose, state, onRequestBuild, onCutoffChange, onClearFilter,
}) {
  const { colors, t, language } = useApp();
  const { built, loading, dates, elementsCount, index } = state;
  const [dragIndex, setDragIndex] = useState(index);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setDragIndex(index); }, [index]);
  useEffect(() => { if (visible && !built && !loading) onRequestBuild?.(); }, [visible, built, loading, onRequestBuild]);
  useEffect(() => { if (!visible) setPlaying(false); }, [visible]);

  const sliderIndex = dragIndex === null ? (dates.length ? dates.length - 1 : 0) : dragIndex;

  // Oynatma: her adimda kesim tarihini bir ileri tasir, sona ulasinca durur.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setDragIndex((prev) => {
        const cur = prev === null ? 0 : prev;
        const next = cur + 1;
        if (next > dates.length - 1) { setPlaying(false); return prev; }
        onCutoffChange?.(next);
        return next;
      });
    }, PLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, dates.length, onCutoffChange]);

  const togglePlay = () => {
    if (!playing && sliderIndex >= dates.length - 1) {
      setDragIndex(0);
      onCutoffChange?.(0);
    }
    setPlaying((p) => !p);
  };

  const handleClear = () => {
    setPlaying(false);
    onClearFilter?.();
  };

  const dateLabel = useMemo(() => {
    if (!dates.length) return '';
    const ts = dates[Math.round(sliderIndex)];
    const locale = language === 'tr' ? 'tr-TR' : language === 'de' ? 'de-DE' : 'en-US';
    return new Date(ts).toLocaleDateString(locale);
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
                onChangeStart={() => setPlaying(false)}
                onChange={(v) => setDragIndex(Math.round(v))}
                onChangeEnd={(v) => onCutoffChange?.(Math.round(v))}
              />
            </View>

            <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
              <Pill
                label={t(playing ? 'viewer.timelinePause' : 'viewer.timelinePlay')}
                icon={playing ? 'pause' : 'play'}
                active={playing}
                onPress={togglePlay}
              />
              <Pill
                label={t('viewer.timelineClear')}
                icon="refresh-outline"
                active={index === null}
                onPress={handleClear}
              />
            </View>

            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.legendDot, { backgroundColor: '#FFA53D' }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>
                {t('viewer.timelineInProgress')}
              </Text>
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
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12.5 },
});
