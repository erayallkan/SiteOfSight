/* Goruntuleme araclari: tel kafes, patlatma (radyal) ve katman katman ayirma.
   Katman ayirma X/Y/Z eksenlerinde birbirinden bagimsiz calisir (her eksenin
   kendi yuzdesi vardir, birini degistirmek digerlerini sifirlamaz). Panel
   acikken de sahne oynatilabilsin diye nonModal olarak render edilir. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../store/AppContext';
import { BottomSheet, ScrollArea, Slider, SwitchRow, SectionTitle } from './ui';

const AXES = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'z', label: 'Z' },
];

export default function DisplaySheet({
  visible, onClose,
  wireframe, onWireframeChange,
  xray, onXrayChange,
  explode, onExplodeChange,
  layerFactors, onLayerAxisChange,
}) {
  const { colors, t } = useApp();
  const factors = layerFactors || { x: 0, y: 0, z: 0 };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.display')} heightRatio={0.56} nonModal>
      <ScrollArea contentStyle={{ paddingHorizontal: 14 }}>
        <SectionTitle>{t('viewer.display')}</SectionTitle>
        <SwitchRow label={t('viewer.wireframe')} value={wireframe} onValueChange={onWireframeChange} icon="grid-outline" />
        <SwitchRow label={t('viewer.xray')} value={xray} onValueChange={onXrayChange} icon="body-outline" />

        <View style={{ marginTop: 14 }}>
          <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 6 }]}>
            {t('viewer.explode')}: {Math.round(explode * 100)}%
          </Text>
          <Slider value={explode} min={0} max={1.5} onChange={onExplodeChange} />
        </View>

        <SectionTitle>{t('viewer.explodeLayer')}</SectionTitle>
        {AXES.map((a) => (
          <View key={a.key} style={{ marginTop: 10 }}>
            <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 6 }]}>
              {a.label}: {Math.round((factors[a.key] || 0) * 100)}%
            </Text>
            <Slider
              value={factors[a.key] || 0}
              min={0}
              max={1.5}
              trackColor={AXIS_COLORS[a.key]}
              onChange={(v) => onLayerAxisChange?.(a.key, v)}
            />
          </View>
        ))}
      </ScrollArea>
    </BottomSheet>
  );
}

const AXIS_COLORS = { x: '#D9534F', y: '#4C9F4C', z: '#4C6FE0' };

const styles = StyleSheet.create({
  meta: { fontSize: 12.5 },
});
