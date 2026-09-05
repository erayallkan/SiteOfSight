/* Ayarlar: tema, dil, olcum birimi, FPS gostergesi, depolama */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';

import { useApp } from '../store/AppContext';
import { usePurchases } from '../store/PurchaseContext';
import { LANGUAGES } from '../i18n';
import { BottomSheet, ScrollArea, SectionTitle, Segmented, SwitchRow, Row } from '../components/ui';
import { MAX_FILE_SIZE_MB, MODELS_DIR, formatSize } from '../services/modelFiles';

export default function SettingsScreen({ navigation }) {
  const { colors, t, settings, update, rtlRestartNeeded, clearRtlRestartNeeded } = useApp();
  const { isPro, setMockPro } = usePurchases();
  const [usage, setUsage] = useState(0);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const currentLang = LANGUAGES.find((l) => l.key === (settings.language || 'tr')) || LANGUAGES[0];

  const measureStorage = useCallback(async () => {
    try {
      const info = await FileSystem.getInfoAsync(MODELS_DIR);
      if (!info.exists) { setUsage(0); return; }
      const files = await FileSystem.readDirectoryAsync(MODELS_DIR);
      let total = 0;
      for (const f of files) {
        const fi = await FileSystem.getInfoAsync(`${MODELS_DIR}${f}`, { size: true });
        total += fi.size || 0;
      }
      setUsage(total);
    } catch {
      setUsage(0);
    }
  }, []);

  useEffect(() => { measureStorage(); }, [measureStorage]);

  useEffect(() => {
    if (!rtlRestartNeeded) return;
    Alert.alert(t('settings.rtlRestartTitle'), t('settings.rtlRestartBody'), [
      { text: t('common.ok'), onPress: clearRtlRestartNeeded },
    ]);
  }, [rtlRestartNeeded, t, clearRtlRestartNeeded]);

  const clearCache = () => {
    Alert.alert(t('settings.clearCache'), t('home.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try { await FileSystem.deleteAsync(MODELS_DIR, { idempotent: true }); } catch { /* yoksay */ }
          measureStorage();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{t('settings.title')}</Text>
      </View>

      <ScrollArea>
        <SectionTitle>{t('settings.subscription')}</SectionTitle>
        <Row
          label={t('settings.managePlan')}
          value={isPro ? t('settings.planActive') : t('settings.planFree')}
          icon="trending-up-outline"
          onPress={() => navigation.navigate('Paywall')}
        />
        <SwitchRow
          label={t('settings.devMockUpgrade')}
          value={isPro}
          onValueChange={setMockPro}
          icon="construct-outline"
        />

        <SectionTitle>{t('settings.theme')}</SectionTitle>
        <View style={styles.block}>
          <Segmented
            value={settings.themeKey}
            onChange={(key) => update({ themeKey: key })}
            options={[
              { key: 'system', label: t('settings.themeSystem') },
              { key: 'light', label: t('settings.themeLight') },
              { key: 'dark', label: t('settings.themeDark') },
            ]}
          />
        </View>

        <SectionTitle>{t('settings.language')}</SectionTitle>
        <Row
          label={t('settings.language')}
          value={`${currentLang.flag}  ${currentLang.label}`}
          icon="language-outline"
          onPress={() => setLangPickerOpen(true)}
        />

        <SectionTitle>{t('settings.unit')}</SectionTitle>
        <View style={styles.block}>
          <Segmented
            value={settings.unit}
            onChange={(key) => update({ unit: key })}
            options={[{ key: 'mm', label: 'mm' }, { key: 'cm', label: 'cm' }, { key: 'm', label: 'm' }]}
          />
        </View>

        <SectionTitle>{t('viewer.display')}</SectionTitle>
        <SwitchRow
          label={t('settings.showFps')}
          value={settings.showFps}
          onValueChange={(v) => update({ showFps: v })}
          icon="speedometer-outline"
        />
        <Row label={t('settings.maxSize')} value={`${MAX_FILE_SIZE_MB} MB`} icon="document-outline" />

        <SectionTitle>{t('settings.storage')}</SectionTitle>
        <Row label={t('settings.storage')} value={formatSize(usage)} icon="save-outline" />
        <Row label={t('settings.clearCache')} icon="trash-outline" onPress={clearCache} />

        <SectionTitle>{t('settings.about')}</SectionTitle>
        <Row
          label={t('settings.glossary')}
          icon="book-outline"
          onPress={() => navigation.navigate('Glossary')}
        />
        <Row
          label={t('settings.replayOnboarding')}
          icon="play-circle-outline"
          onPress={() => navigation.navigate('Onboarding')}
        />
        <Row label={t('settings.version')} value="1.0.0" icon="information-circle-outline" />
        <Row label={t('settings.privacy')} icon="lock-closed-outline" />
        <Row
          label={t('settings.privacyPolicy')}
          icon="shield-checkmark-outline"
          onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
        />
        <Row
          label={t('settings.termsOfUse')}
          icon="document-text-outline"
          onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
        />

        <SectionTitle>{t('settings.feedback')}</SectionTitle>
        <Row
          label={t('settings.sendFeedback')}
          icon="chatbubble-ellipses-outline"
          onPress={() => navigation.navigate('Feedback')}
        />
      </ScrollArea>

      <BottomSheet
        visible={langPickerOpen}
        onClose={() => setLangPickerOpen(false)}
        title={t('settings.language')}
        heightRatio={0.52}
      >
        <ScrollArea>
          {LANGUAGES.map((l) => {
            const active = l.key === (settings.language || 'tr');
            return (
              <Pressable
                key={l.key}
                onPress={() => { update({ language: l.key }); setLangPickerOpen(false); }}
                style={[styles.langRow, { borderBottomColor: colors.border }]}
              >
                <Text style={styles.langFlag}>{l.flag}</Text>
                <Text style={[styles.langLabel, { color: colors.text }]}>{l.label}</Text>
                {active ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollArea>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  back: { padding: 4 },
  title: { fontSize: 22, fontWeight: '800' },
  block: { paddingHorizontal: 16 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langFlag: { fontSize: 22 },
  langLabel: { flex: 1, fontSize: 15.5 },
});
