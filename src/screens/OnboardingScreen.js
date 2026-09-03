/* Ilk acilista bir kez gosterilen, atlanabilir tanitim */
import React, { useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';

const ICONS = ['cube-outline', 'git-branch-outline', 'resize-outline', 'lock-closed-outline'];

export default function OnboardingScreen({ navigation }) {
  const { colors, t, update } = useApp();
  const slides = t('onboarding.slides') || [];
  const { width } = Dimensions.get('window');
  const scroller = useRef(null);
  const [index, setIndex] = useState(0);

  const finish = () => {
    update({ onboardingDone: true });
    navigation.replace('Home');
  };

  const next = () => {
    if (index >= slides.length - 1) { finish(); return; }
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex(index + 1);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Pressable onPress={finish} style={styles.skip} hitSlop={10}>
        <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('onboarding.skip')}</Text>
      </Pressable>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
      >
        {slides.map((slide, i) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={ICONS[i] || 'cube-outline'} size={54} color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{slide.title}</Text>
            <Text style={[styles.text, { color: colors.textMuted }]}>{slide.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.title}
              style={[
                styles.dot,
                { backgroundColor: i === index ? colors.accent : colors.border, width: i === index ? 22 : 8 },
              ]}
            />
          ))}
        </View>
        <Pressable onPress={next} style={[styles.button, { backgroundColor: colors.accent }]}>
          <Text style={styles.buttonText}>
            {index >= slides.length - 1 ? t('onboarding.start') : t('onboarding.next')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skip: { alignSelf: 'flex-end', padding: 18 },
  skipText: { fontSize: 14, fontWeight: '600' },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 18 },
  iconWrap: { width: 120, height: 120, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  text: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  footer: { padding: 24, gap: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  button: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
