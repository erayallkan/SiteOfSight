/* Gizlilik Politikasi / Kullanim Sartlari icin tek ekran. route.params.doc
   ('privacy' | 'terms') ile secilir - bkz. SettingsScreen.js'teki Row'lar. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { ScrollArea } from '../components/ui';

export default function LegalScreen({ navigation, route }) {
  const { colors, t } = useApp();
  const doc = route?.params?.doc || 'privacy';
  const title = t(`legal.${doc}.title`);
  const body = t(`legal.${doc}.body`) || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      </View>

      <ScrollArea contentStyle={{ paddingHorizontal: 18 }}>
        {body.map((para, i) => (
          <Text key={i} style={[styles.paragraph, { color: colors.textMuted }]}>{para}</Text>
        ))}
      </ScrollArea>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', flex: 1 },
  paragraph: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
});
