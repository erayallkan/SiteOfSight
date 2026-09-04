/* Abonelik servisi - MOCK implementasyon (Asama 1).
   Gercek odeme yok; entitlement AsyncStorage'da yerel olarak tutulur.
   Asama 2'de bu dosyanin ici react-native-purchases (RevenueCat) cagrilariyla
   degistirilecek - disa acilan arayuz (getOfferings/purchasePackage/
   restorePurchases/getEntitlement/setEntitlement) ayni kalacagi icin
   PurchaseContext ve ekranlar degismeyecek. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sos.entitlement.v1';
const MOCK_PURCHASE_DELAY_MS = 900;

export const OFFERINGS = {
  monthly: { id: 'sos_pro_monthly', period: 'monthly' },
  yearly: { id: 'sos_pro_yearly', period: 'yearly' },
};

export async function getEntitlement() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function setEntitlement(isPro) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, isPro ? '1' : '0');
  } catch {
    /* yoksay */
  }
}

export function getOfferings() {
  return Promise.resolve(OFFERINGS);
}

/** Sahte satin alma: kisa bir gecikme sonrasi basarili doner ve entitlement'i acar. */
export async function purchasePackage(packageId) {
  await new Promise((resolve) => setTimeout(resolve, MOCK_PURCHASE_DELAY_MS));
  await setEntitlement(true);
  return { success: true, packageId };
}

/** Sahte geri yukleme: kayitli entitlement neyse onu dondurur. */
export async function restorePurchases() {
  const isPro = await getEntitlement();
  return { isPro };
}
