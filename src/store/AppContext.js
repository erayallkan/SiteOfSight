/* Uygulama geneli ayarlar: tema, dil, olcum birimi, onboarding durumu.
   AsyncStorage'da saklanir; hicbir sey buluta gitmez. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { paletteFor, radius, spacing } from '../theme';
import { translate } from '../i18n';

const STORAGE_KEY = 'sos.settings.v1';

const DEFAULTS = {
  themeKey: 'system',       // system | light | dark
  language: null,           // null -> cihaz diline gore secilir
  unit: 'mm',               // mm | cm | m
  showFps: false,
  onboardingDone: false,
};

const AppContext = createContext(null);

function deviceLanguage() {
  try {
    const codes = Localization.getLocales?.() || [];
    const code = codes[0]?.languageCode;
    if (code === 'tr' || code === 'de') return code;
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
  const colors = useMemo(
    () => paletteFor(settings.themeKey, systemScheme === 'dark'),
    [settings.themeKey, systemScheme]
  );

  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const value = useMemo(
    () => ({ settings, update, colors, radius, spacing, t, language, hydrated }),
    [settings, update, colors, t, language, hydrated]
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
