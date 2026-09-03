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

const WALK_SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];
const WALK_SPEED_DEFAULT_INDEX = WALK_SPEEDS.indexOf(3);

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
/** Yurume hizi (-/+): WALK_SPEEDS listesinde adim adim gezinir, 1x varsayilan. */
function SpeedControl({ onSpeedChange }) {
  const [index, setIndex] = useState(WALK_SPEED_DEFAULT_INDEX);

  const step = (dir) => {
    const next = Math.min(WALK_SPEEDS.length - 1, Math.max(0, index + dir));
    if (next === index) return;
    setIndex(next);
    onSpeedChange?.(WALK_SPEEDS[next]);
  };

  return (
    <View style={styles.speedWrap}>
      <Pressable
        onPress={() => step(-1)}
        disabled={index === 0}
        style={[styles.speedBtn, index === 0 && styles.speedBtnDisabled]}
        hitSlop={8}
      >
        <Ionicons name="remove" size={18} color="#fff" />
      </Pressable>
      <Text style={styles.speedLabel}>{WALK_SPEEDS[index]}x</Text>
      <Pressable
        onPress={() => step(1)}
        disabled={index === WALK_SPEEDS.length - 1}
        style={[styles.speedBtn, index === WALK_SPEEDS.length - 1 && styles.speedBtnDisabled]}
        hitSlop={8}
      >
        <Ionicons name="add" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function WalkthroughOverlay({ visible, onExit, onMove, onLook, onSpeedChange }) {
  if (!visible) return null;
  return (
    <Fragment>
      <SafeAreaView style={styles.topRow} pointerEvents="box-none">
        <Pressable onPress={onExit} style={styles.exitBtn} hitSlop={8}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
        </Pressable>
        <SpeedControl onSpeedChange={onSpeedChange} />
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
  speedWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
    backgroundColor: 'rgba(20,22,28,0.55)', borderRadius: 21, paddingHorizontal: 4, height: 42,
  },
  speedBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  speedBtnDisabled: { opacity: 0.35 },
  speedLabel: { color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 34, textAlign: 'center' },
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
