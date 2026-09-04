/* Abonelik durumu: isPro, offerings, satin alma/geri yukleme aksiyonlari.
   AppContext'ten bagimsiz, paralel bir context - bkz. AppContext.js icin
   ayni Provider/hook deseni. Asama 1'de src/services/purchases.js mock'tur. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getEntitlement, getOfferings, purchasePackage, restorePurchases, setEntitlement,
} from '../services/purchases';

const PurchaseContext = createContext(null);

export function PurchaseProvider({ children }) {
  const [isPro, setIsPro] = useState(false);
  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [entitlement, offers] = await Promise.all([getEntitlement(), getOfferings()]);
      if (!alive) return;
      setIsPro(entitlement);
      setOfferings(offers);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const purchase = useCallback(async (packageId) => {
    setPurchasing(true);
    try {
      const result = await purchasePackage(packageId);
      if (result.success) setIsPro(true);
      return result;
    } finally {
      setPurchasing(false);
    }
  }, []);

  const restore = useCallback(async () => {
    const result = await restorePurchases();
    setIsPro(result.isPro);
    return result;
  }, []);

  /** Yalnizca gelistirme kolayligi icin: Ayarlar'daki mock switch buradan gecer. */
  const setMockPro = useCallback(async (value) => {
    await setEntitlement(value);
    setIsPro(value);
  }, []);

  const value = useMemo(
    () => ({ isPro, offerings, loading, purchasing, purchase, restore, setMockPro }),
    [isPro, offerings, loading, purchasing, purchase, restore, setMockPro]
  );

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchases() {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error('usePurchases must be used inside <PurchaseProvider>');
  return ctx;
}
