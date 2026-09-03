/* Giris ekrani: hesapsiz "Ornek Model Ac", cihazdan IFC secme ve Gecmis listesi */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { EmptyState } from '../components/ui';
import { deleteModel, listModels, upsertModel, getModel } from '../db/database';
import {
  ModelFileError, deleteModelFile, fileExists, formatSize, pickIfcFile, prepareSampleModel,
} from '../services/modelFiles';

function timeAgo(ts, language) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return language === 'en' ? 'just now' : 'az once';
  if (min < 60) return language === 'en' ? `${min} min ago` : `${min} dk once`;
  const hours = Math.round(min / 60);
  if (hours < 24) return language === 'en' ? `${hours} h ago` : `${hours} sa once`;
  const days = Math.round(hours / 24);
  return language === 'en' ? `${days} d ago` : `${days} gun once`;
}

export default function HomeScreen({ navigation }) {
  const { colors, t, settings, language } = useApp();
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listModels().then(setModels).catch(() => setModels([]));
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openModel = useCallback(async (record) => {
    const exists = await fileExists(record.file_uri);
    if (!exists) {
      Alert.alert(t('common.error'), t('errors.unreadable'));
      await deleteModel(record.id);
      refresh();
      return;
    }
    navigation.navigate('Viewer', { model: record });
  }, [navigation, refresh, t]);

  const openSample = useCallback(async () => {
    setBusy(true);
    try {
      const file = await prepareSampleModel();
      const id = await upsertModel({
        name: language === 'en' ? 'Sample Model' : 'Ornek Model',
        fileUri: file.uri,
        sizeBytes: file.size,
        source: 'sample',
      });
      const record = await getModel(id);
      refresh();
      navigation.navigate('Viewer', { model: record });
    } catch (e) {
      Alert.alert(t('common.error'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [language, navigation, refresh, t]);

  const pickFile = useCallback(async () => {
    setBusy(true);
    try {
      const file = await pickIfcFile(settings.maxFileSizeMb);
      if (!file) return;
      const id = await upsertModel({ name: file.name, fileUri: file.uri, sizeBytes: file.size, source: 'device' });
      const record = await getModel(id);
      refresh();
      navigation.navigate('Viewer', { model: record });
    } catch (e) {
      if (e instanceof ModelFileError) Alert.alert(t('common.error'), t(e.code, e.params));
      else Alert.alert(t('common.error'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [navigation, refresh, settings.maxFileSizeMb, t]);

  const confirmDelete = useCallback((record) => {
    Alert.alert(t('home.deleteConfirm'), record.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteModel(record.id);
          if (record.source !== 'sample') await deleteModelFile(record.file_uri);
          refresh();
        },
      },
    ]);
  }, [refresh, t]);

  const renderItem = ({ item }) => (
    <Pressable
      onPress={() => openModel(item)}
      onLongPress={() => confirmDelete(item)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons
          name={item.source === 'sample' ? 'home-outline' : 'cube-outline'}
          size={30}
          color={colors.textFaint}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {formatSize(item.size_bytes)}  |  {timeAgo(item.opened_at, language)}
        </Text>
        {item.element_count ? (
          <Text style={[styles.cardMeta, { color: colors.textFaint }]} numberOfLines={1}>
            {t('viewer.stats', { elements: item.element_count, triangles: item.triangle_count || 0 })}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.appName, { color: colors.text }]}>SiteOfSight</Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>{t('home.noAccount')}</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={openSample}
          disabled={busy}
          style={[styles.primary, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="play" size={19} color="#fff" />}
          <Text style={styles.primaryText}>{t('home.openSample')}</Text>
        </Pressable>

        <Pressable
          onPress={pickFile}
          disabled={busy}
          style={[styles.secondary, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Ionicons name="folder-open-outline" size={19} color={colors.text} />
          <Text style={[styles.secondaryText, { color: colors.text }]}>{t('home.openFile')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>
        {t('home.history').toUpperCase()}
      </Text>

      <FlatList
        data={models}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 10 }}
        ListEmptyComponent={<EmptyState title={t('home.empty')} hint={t('home.emptyHint')} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  appName: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 12.5, marginTop: 3 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: { paddingHorizontal: 16, gap: 10 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, borderRadius: 16,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.9, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 58, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
});
