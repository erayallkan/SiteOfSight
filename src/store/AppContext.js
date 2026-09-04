/* Uygulama geneli ayarlar: tema, dil, olcum birimi, onboarding durumu.
   AsyncStorage'da saklanir; hicbir sey buluta gitmez. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { I18nManager, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { paletteFor, radius, spacing } from '../theme';
import { LANGUAGES, translate } from '../i18n';

const STORAGE_KEY = 'sos.settings.v1';

const DEFAULTS = {
  themeKey: 'system',       // system | light | dark
  language: null,           // null -> cihaz diline gore secilir
  unit: 'mm',               // mm | cm | m
  showFps: false,
  onboardingDone: false,
};

const AppContext = createContext(null);

const SUPPORTED_CODES = LANGUAGES.map((l) => l.key);

function isRTLLanguage(language) {
  return !!LANGUAGES.find((l) => l.key === language)?.rtl;
}

function deviceLanguage() {
  try {
    const codes = Localization.getLocales?.() || [];
    const code = codes[0]?.languageCode;
    if (SUPPORTED_CODES.includes(code)) return code;
    return 'en';
  } catch {
    return 'tr';
  }
}

export function AppProvider({ children }) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : {};
        if (alive) setSettings({ ...DEFAULTS, language: deviceLanguage(), ...stored });
      } catch {
        if (alive) setSettings({ ...DEFAULTS, language: deviceLanguage() });
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const language = settings.language || 'tr';
  const isRTL = isRTLLanguage(language);
  const colors = useMemo(
    () => paletteFor(settings.themeKey, systemScheme === 'dark'),
    [settings.themeKey, systemScheme]
  );

  const t = useCallback((key, params) => translate(language, key, params), [language]);

  // Native RTL yerlesimi (I18nManager) sadece uygulama yeniden baslatildiginda
  // etkinlesir. I18nManager.isRTL onceki bir oturumdan kalma olabildigi icin
  // ona kiyaslamak yerine, oturum icinde gerceklesen bir yon degisikligini
  // (prevRTLRef ile) takip ederiz - boylece Ayarlar ekranina her girildiginde
  // degil, sadece kullanici fiilen dil/yon degistirdiginde uyari gosterilir.
  const prevRTLRef = useRef(null);
  const [rtlRestartNeeded, setRtlRestartNeeded] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const isFirstRun = prevRTLRef.current === null;
    if (isFirstRun) {
      prevRTLRef.current = isRTL;
      if (I18nManager.isRTL !== isRTL) {
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
      }
      return;
    }
    if (prevRTLRef.current !== isRTL) {
      prevRTLRef.current = isRTL;
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
      setRtlRestartNeeded(true);
    }
  }, [hydrated, isRTL]);

  const clearRtlRestartNeeded = useCallback(() => setRtlRestartNeeded(false), []);

  const value = useMemo(
    () => ({ settings, update, colors, radius, spacing, t, language, isRTL, rtlRestartNeeded, clearRtlRestartNeeded, hydrated }),
    [settings, update, colors, t, language, isRTL, rtlRestartNeeded, clearRtlRestartNeeded, hydrated]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useTheme() {
  return useApp().colors;
}
