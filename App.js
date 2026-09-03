import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppProvider, useApp } from './src/store/AppContext';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { upsertModel, getModel } from './src/db/database';
import { ModelFileError, importSharedIfcFile } from './src/services/modelFiles';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

/** Baska bir uygulamadan "birlikte ac" / paylas ile gelen bir .ifc dosyasini
 *  (uygulama scheme'i degil, dogrudan bir dosya URI'si) modeller gecmisine
 *  ekleyip goruntuleyiciye acar - bkz. app.json ios.infoPlist.CFBundleDocumentTypes
 *  ve android.intentFilters. */
async function handleIncomingFileUrl(url, maxSizeMb, t) {
  if (!url) return;
  try {
    const file = await importSharedIfcFile(url, maxSizeMb);
    const id = await upsertModel({ name: file.name, fileUri: file.uri, sizeBytes: file.size, source: 'device' });
    const record = await getModel(id);
    if (navigationRef.isReady()) navigationRef.navigate('Viewer', { model: record });
  } catch (e) {
    const message = e instanceof ModelFileError ? t(e.code, e.params) : String(e?.message || e);
    Alert.alert(t('common.error'), message);
  }
}

function Root() {
  const { colors, settings, hydrated, t } = useApp();

  useEffect(() => {
    if (!hydrated) return undefined;
    Linking.getInitialURL().then((url) => { if (url) handleIncomingFileUrl(url, settings.maxFileSizeMb, t); });
    const sub = Linking.addEventListener('url', ({ url }) => handleIncomingFileUrl(url, settings.maxFileSizeMb, t));
    return () => sub.remove();
  }, [hydrated, settings.maxFileSizeMb, t]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const navTheme = {
    ...(colors.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(colors.isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <Stack.Navigator
        initialRouteName={settings.onboardingDone ? 'Home' : 'Onboarding'}
        screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: colors.bg } }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Viewer" component={ViewerScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
