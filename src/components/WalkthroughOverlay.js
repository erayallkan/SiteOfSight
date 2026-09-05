/* Yuruyus modu ekrani: sol joystick hareket (ileri/geri + yana), sag joystick
   bakis yonu (yatay/dikey), sol ustte cikis dugmesi. */
import React, { Fragment, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';

const SIZE = 118;
const KNOB = 40;
const MAX_OFFSET = SIZE / 2 - KNOB / 2;

function Joystick({ onChange }) {
  const { colors } = useApp();
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (e, g) => {
        let { dx, dy } = g;
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_OFFSET) {
          const s = MAX_OFFSET / dist;
          dx *= s; dy *= s;
        }
        setKnob({ x: dx, y: dy });
        onChange(dx / MAX_OFFSET, dy / MAX_OFFSET);
      },
      onPanResponderRelease: () => { setKnob({ x: 0, y: 0 }); onChange(0, 0); },
      onPanResponderTerminate: () => { setKnob({ x: 0, y: 0 }); onChange(0, 0); },
      // NOT: diger joystick'e dokunuldugunda RN bu responder'i birakmasini
      // isteyebilir (varsayilan: kabul) - bu da iki joystick'in AYNI ANDA
      // kontrol edilememesine yol aciyordu (biri dokununca digeri sifirlaniyordu).
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return (
    <View
      style={[styles.base, { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.35)' }]}
      {...responder.panHandlers}
    >
      <View
        style={[
          styles.knob,
          { backgroundColor: colors.accent, transform: [{ translateX: knob.x }, { translateY: knob.y }] },
        ]}
      />
    </View>
  );
}

/* NOT: burada tum ekrani kaplayan ortak bir "box-none" sarmalayici KULLANILMAZ.
   WebView'in uzerine boyle tam ekran bir sarmalayici koymak (once denendi)
   ic Pressable/PanResponder'lara dokunuşun ulaşmasini guvenilmez hale
   getiriyor. Bunun yerine, ekranda calistigi kanitlanmis ust bar / alt cubuk
   deseniyle ayni sekilde, topRow ve bottomRow BAGIMSIZ, kendi alanlariyla
   sinirli absolute View'lar olarak (Fragment ile) dogrudan dondurulur. */

export default function WalkthroughOverlay({ visible, onExit, onMove, onLook }) {
  if (!visible) return null;
  return (
    <Fragment>
      <SafeAreaView style={styles.topRow} pointerEvents="box-none">
        <Pressable onPress={onExit} style={styles.exitBtn} hitSlop={8}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView style={styles.bottomRow} pointerEvents="box-none" edges={['bottom']}>
        <Joystick onChange={onMove} />
        <Joystick onChange={onLook} />
      </SafeAreaView>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  topRow: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, zIndex: 20, elevation: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  exitBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,22,28,0.55)', marginTop: 4,
  },
  bottomRow: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 76,
  },
  base: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
