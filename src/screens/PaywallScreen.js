/* Abonelik ekrani: aylik/yillik plan secimi, satin alma, geri yukleme.
   Asama 1'de usePurchases() mock servise sarili - bkz. src/services/purchases.js. */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { usePurchases } from '../store/PurchaseContext';
import { ScrollArea } from '../components/ui';

const APP_ICON = require('../../assets/icon.png');
const FEATURES = ['featureUnlimited', 'featureMeasure', 'featureSection', 'featureTimeline', 'featurePlan', 'featureWalk'];

export default function PaywallScreen({ navigation }) {
  const { colors, t, language } = useApp();
  const { offerings, purchasing, purchase } = usePurchases();
  const [plan, setPlan] = useState('yearly');

  const handleSubscribe = async () => {
    const pkg = offerings?.[plan];
    if (!pkg) return;
    const result = await purchase(pkg.id);
    if (result.success) {
      Alert.alert(t('paywall.success'), '', [{ text: t('common.ok'), onPress: () => navigation.goBack() }]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={[styles.closeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="close" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollArea contentStyle={{ paddingHorizontal: 20 }}>
        <View style={styles.hero}>
          <Image source={APP_ICON} style={styles.heroLogo} resizeMode="contain" />
          <Text style={[styles.title, { color: colors.text }]}>{t('paywall.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('paywall.subtitle')}</Text>
        </View>

        <Text style={[styles.featuresTitle, { color: colors.textFaint }]}>
          {(language === 'tr' ? t('paywall.featuresTitle').toLocaleUpperCase('tr-TR') : t('paywall.featuresTitle').toUpperCase())}
        </Text>
        <View style={styles.features}>
          {FEATURES.map((key) => (
            <View key={key} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={[styles.featureText, { color: colors.text }]}>{t(`paywall.${key}`)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          <PlanCard
            active={plan === 'monthly'}
            label={t('paywall.monthly')}
            price={t('paywall.monthlyPrice')}
            onPress={() => setPlan('monthly')}
            colors={colors}
          />
          <PlanCard
            active={plan === 'yearly'}
            label={t('paywall.yearly')}
            price={t('paywall.yearlyPrice')}
            originalPrice={t('paywall.yearlyOriginalPrice')}
            perMonth={t('paywall.yearlyPerMonth')}
            savings={t('paywall.yearlySavings')}
            badge={t('paywall.yearlyBadge')}
            onPress={() => setPlan('yearly')}
            colors={colors}
          />
        </View>

        <Pressable
          onPress={handleSubscribe}
          disabled={purchasing}
          style={[styles.subscribeBtn, { backgroundColor: colors.accent, opacity: purchasing ? 0.6 : 1 }]}
        >
          {purchasing ? <ActivityIndicator color="#fff" /> : <Text style={styles.subscribeText}>{t('paywall.subscribe')}</Text>}
        </Pressable>

        <Text style={[styles.footnote, { color: colors.textFaint }]}>{t('paywall.footnote')}</Text>
        <View style={styles.legalLinks}>
          <Pressable onPress={() => navigation.navigate('Legal', { doc: 'terms' })}>
            <Text style={[styles.legalLinkText, { color: colors.textFaint }]}>{t('settings.termsOfUse')}</Text>
          </Pressable>
          <Text style={[styles.legalLinkSep, { color: colors.textFaint }]}>·</Text>
          <Pressable onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}>
            <Text style={[styles.legalLinkText, { color: colors.textFaint }]}>{t('settings.privacyPolicy')}</Text>
          </Pressable>
        </View>
      </ScrollArea>
    </SafeAreaView>
  );
}

function PlanCard({ active, label, price, originalPrice, perMonth, savings, badge, onPress, colors }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.planCard,
        { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.surface },
      ]}
    >
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={[styles.radio, { borderColor: active ? colors.accent : colors.border }]}>
        {active ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
      </View>
      <Text style={[styles.planLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.priceRow}>
        <Text style={[styles.planPrice, { color: colors.textMuted }]}>{price}</Text>
        {originalPrice ? (
          <Text style={[styles.planOriginalPrice, { color: colors.textFaint }]}>{originalPrice}</Text>
        ) : null}
      </View>
      {perMonth ? (
        <Text style={[styles.planPerMonth, { color: colors.accent }]}>{perMonth}</Text>
      ) : null}
      {savings ? (
        <Text style={[styles.planSavings, { color: colors.success }]}>{savings}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  hero: { alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 24 },
  heroLogo: { width: 56, height: 56, borderRadius: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14.5, textAlign: 'center', lineHeight: 21, paddingHorizontal: 10 },

  featuresTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, marginBottom: 12 },
  features: { gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14.5, fontWeight: '500' },

  plans: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  planCard: {
    flex: 1, borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 6, position: 'relative',
  },
  badge: {
    position: 'absolute', top: -10, right: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  planLabel: { fontSize: 15.5, fontWeight: '700', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  planPrice: { fontSize: 13 },
  planOriginalPrice: { fontSize: 12, textDecorationLine: 'line-through' },
  planPerMonth: { fontSize: 11.5, fontWeight: '700', marginTop: 2 },
  planSavings: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  subscribeBtn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  subscribeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footnote: { fontSize: 11.5, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
  legalLinkText: { fontSize: 11.5, fontWeight: '600', textDecorationLine: 'underline' },
  legalLinkSep: { fontSize: 11.5 },
});
