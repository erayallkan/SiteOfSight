/* buildingSMART hiyerarsisi: Proje > Saha > Bina > Kat > Eleman
   Alttan acilan panelde, arama/filtreleme ve gorunurluk kontrolleri ile. */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { BottomSheet, Segmented, EmptyState } from './ui';
import { typeInfo, prettyType } from '../utils/ifcTypes';

const MAX_SEARCH_RESULTS = 400;

function flatten(node, depth, expanded, out) {
  out.push({ node, depth, expandable: node.children.length > 0 });
  if (!expanded.has(node.id) || node.children.length === 0) return;
  for (let i = 0; i < node.children.length; i += 1) {
    flatten(node.children[i], depth + 1, expanded, out);
  }
}

function search(node, query, out) {
  if (out.length >= MAX_SEARCH_RESULTS) return;
  const hay = `${node.name} ${node.type}`.toLowerCase();
  if (hay.includes(query)) out.push({ node, depth: 0, expandable: false });
  for (let i = 0; i < node.children.length; i += 1) search(node.children[i], query, out);
}

function collectIds(node, out) {
  if (node.hasGeometry) out.push(node.id);
  node.children.forEach((c) => collectIds(c, out));
  return out;
}

export default function ModelTreeSheet({
  visible, onClose, tree, selectedId, hiddenIds,
  onSelect, onIsolate, onToggleVisible, onShowAll,
}) {
  const { colors, t } = useApp();
  const [tab, setTab] = useState('structure');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  // Ilk acilista Proje > Saha > Bina > Kat zincirini acik getir
  useEffect(() => {
    if (!tree?.root) return;
    const set = new Set();
    let node = tree.root;
    for (let d = 0; d < 4 && node; d += 1) {
      set.add(node.id);
      node = node.children[0];
    }
    setExpanded(set);
  }, [tree]);

  const effectiveExpanded = expanded;

  const rows = useMemo(() => {
    if (!tree?.root) return [];
    const q = query.trim().toLowerCase();

    if (tab === 'type') {
      const entries = Object.entries(tree.byType || {})
        .filter(([type]) => !q || type.toLowerCase().includes(q) || prettyType(type).toLowerCase().includes(q))
        .sort((a, b) => b[1].length - a[1].length);
      const out = [];
      entries.forEach(([type, ids]) => {
        const groupNode = {
          id: `type:${type}`, name: `${prettyType(type)} (${ids.length})`, type,
          hasGeometry: false, children: [], _ids: ids,
        };
        out.push({ node: groupNode, depth: 0, expandable: true, isTypeGroup: true });
        if (effectiveExpanded.has(groupNode.id)) {
          ids.slice(0, 300).forEach((id) => {
            out.push({
              node: { id, name: `#${id}`, type, hasGeometry: true, children: [] },
              depth: 1, expandable: false,
            });
          });
        }
      });
      return out;
    }

    const out = [];
    if (q) search(tree.root, q, out);
    else flatten(tree.root, 0, effectiveExpanded, out);
    return out;
  }, [tree, tab, query, effectiveExpanded]);

  const toggleExpand = (id) => {
    const next = new Set(effectiveExpanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const renderItem = ({ item }) => {
    const { node, depth, expandable, isTypeGroup } = item;
    const info = typeInfo(node.type);
    const isSelected = node.id === selectedId;
    const isHidden = hiddenIds?.has(node.id);

    return (
      <View
        style={[
          styles.row,
          { borderBottomColor: colors.border, paddingLeft: 10 + depth * 16 },
          isSelected && { backgroundColor: colors.accentSoft },
        ]}
      >
        <Pressable
          onPress={() => (expandable ? toggleExpand(node.id) : null)}
          hitSlop={8}
          style={styles.chevron}
        >
          {expandable ? (
            <Ionicons
              name={effectiveExpanded.has(node.id) ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textMuted}
            />
          ) : null}
        </Pressable>

        <Ionicons name={info.icon} size={17} color={info.color} style={{ marginRight: 8 }} />

        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            if (isTypeGroup) { toggleExpand(node.id); return; }
            if (node.hasGeometry) onSelect?.(node.id);
            else if (expandable) toggleExpand(node.id);
          }}
        >
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{node.name}</Text>
          <Text style={[styles.type, { color: colors.textFaint }]} numberOfLines={1}>
            {prettyType(node.type)}
          </Text>
        </Pressable>

        <Pressable
          hitSlop={8}
          style={styles.action}
          onPress={() => onIsolate?.(isTypeGroup ? node._ids : collectIds(node, []))}
        >
          <Ionicons name="scan-outline" size={17} color={colors.textMuted} />
        </Pressable>

        <Pressable
          hitSlop={8}
          style={styles.action}
          onPress={() => onToggleVisible?.(isTypeGroup ? node._ids : collectIds(node, []), !isHidden)}
        >
          <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('viewer.tree_')} heightRatio={0.72}>
      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('tree.searchPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <Segmented
          style={{ marginTop: 10 }}
          value={tab}
          onChange={setTab}
          options={[
            { key: 'structure', label: t('tree.structure') },
            { key: 'type', label: t('tree.type') },
          ]}
        />

        <View style={styles.toolRow}>
          <Pressable onPress={onShowAll} style={styles.toolBtn}>
            <Ionicons name="eye" size={15} color={colors.accent} />
            <Text style={[styles.toolText, { color: colors.accent }]}>{t('viewer.showAll')}</Text>
          </Pressable>
          {tree?.truncated ? (
            <Text style={[styles.warn, { color: colors.warning }]} numberOfLines={1}>
              {t('tree.truncated')}
            </Text>
          ) : null}
        </View>
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="search-outline" title={t('tree.noResult')} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, index) => `${item.node.id}-${index}`}
          renderItem={renderItem}
          initialNumToRender={25}
          maxToRenderPerBatch={30}
          windowSize={10}
          removeClippedSubviews
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 14, paddingBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14.5, padding: 0 },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toolText: { fontSize: 13, fontWeight: '600' },
  warn: { fontSize: 11.5, flex: 1, textAlign: 'right', marginLeft: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chevron: { width: 22, alignItems: 'center' },
  name: { fontSize: 14.5, fontWeight: '600' },
  type: { fontSize: 11.5, marginTop: 1 },
  action: { paddingHorizontal: 7, paddingVertical: 4 },
});
