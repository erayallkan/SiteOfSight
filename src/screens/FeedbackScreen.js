/* Geri bildirim: yildizli puan + serbest metin, cihazin e-posta istemcisine
   mailto: linkiyle acilir - ayri bir backend olmadigi icin en basit yol. */
import React, { useState } from 'react';
import {
  Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { useApp } from '../store/AppContext';
import { ScrollArea } from '../components/ui';

const FEEDBACK_EMAIL = 'feedback@siteofsight.app';
const STARS = [1, 2, 3, 4, 5];

export default function FeedbackScreen({ navigation }) {
  const { colors, t } = useApp();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');

  const send = async () => {
    if (!message.trim()) {
      Alert.alert(t('common.error'), t('feedback.emptyError'));
      return;
    }
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const info = `\n\n---\n${Platform.OS} ${Platform.Version} · v${appVersion}${rating ? ` · ${rating}/5` : ''}`;
    const subject = encodeURIComponent('SiteOfSight - Geri Bildirim');
    const body = encodeURIComponent(`${message.trim()}${info}`);
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;

    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert(t('common.error'), t('feedback.mailUnavailable', { email: FEEDBACK_EMAIL }));
      return;
    }
    await Linking.openURL(url);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('feedback.title')}</Text>
      </View>

      <ScrollArea contentStyle={{ paddingHorizontal: 18 }}>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('feedback.subtitle')}</Text>

        <Text style={[styles.label, { color: colors.textFaint }]}>{t('feedback.ratingLabel')}</Text>
        <View style={styles.stars}>
          {STARS.map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Ionicons
                name={n <= rating ? 'star' : 'star-outline'}
                size={30}
                color={n <= rating ? colors.warning : colors.textFaint}
                style={{ marginRight: 6 }}
              />
            </Pressable>
          ))}
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={t('feedback.placeholder')}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <Pressable onPress={send} style={[styles.sendBtn, { backgroundColor: colors.accent }]}>
          <Text style={styles.sendText}>{t('feedback.send')}</Text>
        </Pressable>
      </ScrollArea>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: '800', flex: 1 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10 },
  stars: { flexDirection: 'row', marginBottom: 22 },
  input: {
    minHeight: 140, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, fontSize: 14.5, marginBottom: 20,
  },
  sendBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
