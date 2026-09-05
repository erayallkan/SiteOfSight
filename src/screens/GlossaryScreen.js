/* Offline IFC sozlugu: model acmadan da her IFC eleman tipinin sade dilde
   aciklamasina goz atma. Kaynak: assets/utils/ifcGlossary.js (buildingSMART
   resmi tanimlarindan sadelestirilmis, cok dilli). */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { EmptyState } from '../components/ui';
import { typeInfo, prettyType } from '../utils/ifcTypes';
import { glossaryDescription, glossaryCodes } from '../utils/ifcGlossary';

export default function GlossaryScreen({ navigation }) {
  const { colors, t, settings } = useApp();
  const [query, setQuery] = useState('');
  const language = settings.language || 'tr';

  const entries = useMemo(() => {
    const list = glossaryCodes().map((code) => ({
      code,
      info: typeInfo(code),
      label: prettyType(code),
      description: glossaryDescription(language, code),
    }));
    const q = query.trim().toLocaleLowerCase();
    if (!q) return list;
    return list.filter(
      (e) => e.code.toLocaleLowerCase().includes(q) || e.label.toLocaleLowerCase().includes(q)
        || e.info.label.toLocaleLowerCase().includes(q)
    );
  }, [query, language]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('glossary.title')}</Text>
      </View>

      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('glossary.subtitle')}</Text>

      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('glossary.searchPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState icon="search-outline" title={t('glossary.empty')} />}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={[styles.badge, { backgroundColor: `${item.info.color}22` }]}>
              <Ionicons name={item.info.icon} size={20} color={item.info.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.code, { color: colors.textFaint }]}>{item.code}</Text>
              {item.description ? (
                <Text style={[styles.description, { color: colors.textMuted }]}>{item.description}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', flex: 1 },
  subtitle: { fontSize: 12.5, paddingHorizontal: 18, marginBottom: 10, lineHeight: 17 },
  searchRow: { paddingHorizontal: 18, marginBottom: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  listContent: { paddingHorizontal: 18, paddingBottom: 24 },
  row: {
    flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  label: { fontSize: 15, fontWeight: '700' },
  code: { fontSize: 11.5, marginTop: 1, marginBottom: 4 },
  description: { fontSize: 13, lineHeight: 18 },
});
