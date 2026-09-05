/* Giris ekrani: hesapsiz "Ornek Model Ac", cihazdan IFC secme, arama/siralama/
   liste-izgara gorunumu, klasorler ve coklu secim ile tasima/silme. */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '../store/AppContext';
import { usePurchases } from '../store/PurchaseContext';
import { EmptyState, Segmented } from '../components/ui';
import {
  createFolder, deleteFolder, deleteModel, deleteModels, listFolders, listModels,
  moveModelsToFolder, upsertModel, getModel,
} from '../db/database';
import {
  ModelFileError, deleteModelFile, fileExists, formatSize, pickIfcFile, prepareSampleModel,
} from '../services/modelFiles';

const LOGO_LIGHT = require('../../assets/branding/logo-light.png');
const LOGO_DARK = require('../../assets/branding/logo-dark.png');
const LOGO_ASPECT = 1533 / 430; // logo-light.png / logo-dark.png genislik-yukseklik orani
const LOGO_HEIGHT = 34;

const TIME_AGO = {
  tr: { now: 'az önce', min: (n) => `${n} dk önce`, hour: (n) => `${n} sa önce`, day: (n) => `${n} gün önce` },
  en: { now: 'just now', min: (n) => `${n} min ago`, hour: (n) => `${n} h ago`, day: (n) => `${n} d ago` },
  de: { now: 'gerade eben', min: (n) => `vor ${n} Min.`, hour: (n) => `vor ${n} Std.`, day: (n) => `vor ${n} Tg.` },
  ar: { now: 'الآن', min: (n) => `منذ ${n} د`, hour: (n) => `منذ ${n} س`, day: (n) => `منذ ${n} ي` },
  ru: { now: 'только что', min: (n) => `${n} мин назад`, hour: (n) => `${n} ч назад`, day: (n) => `${n} дн назад` },
  es: { now: 'ahora mismo', min: (n) => `hace ${n} min`, hour: (n) => `hace ${n} h`, day: (n) => `hace ${n} d` },
  fr: { now: 'à l\'instant', min: (n) => `il y a ${n} min`, hour: (n) => `il y a ${n} h`, day: (n) => `il y a ${n} j` },
};

function timeAgo(ts, language) {
  const dict = TIME_AGO[language] || TIME_AGO.tr;
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return dict.now;
  if (min < 60) return dict.min(min);
  const hours = Math.round(min / 60);
  if (hours < 24) return dict.hour(hours);
  const days = Math.round(hours / 24);
  return dict.day(days);
}

const upper = (text, language) => (language === 'tr' ? String(text).toLocaleUpperCase('tr-TR') : String(text).toUpperCase());

/** Model karti onizlemesi: thumbnail_data (ham base64 JPEG) varsa data: URI
 *  olarak gosterir, yoksa (veya decode basarisiz olursa) tur ikonuna geri
 *  duser. NOT: dosya YOK, gorsel dogrudan DB'de saklanir - bkz.
 *  src/screens/ViewerScreen.js handleThumbnail. */
function CardThumb({ item, grid, colors }) {
  const [failed, setFailed] = useState(false);
  const showImage = item.thumbnail_data && !failed;
  return (
    <View style={[grid ? styles.gridThumb : styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
      {showImage ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.thumbnail_data}` }}
          // NOT: StyleSheet.absoluteFillObject (top/left/right/bottom:0) bu
          // View icinde SESSIZCE hicbir sey cizmiyordu (onLoad ateşleniyordu
          // ama ekranda gorunmuyordu) - sabit yuzde genislik/yukseklik
          // kullanmak sorunu cozdu.
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Ionicons
          name={item.source === 'sample' ? 'home-outline' : 'cube-outline'}
          size={grid ? 34 : 30}
          color={colors.textFaint}
        />
      )}
    </View>
  );
}

/* ---------------- Klasore tasima modali ---------------- */

function FolderPickerModal({ visible, folders, onClose, onCreateAndMove, onMoveToExisting }) {
  const { colors, t } = useApp();
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setName('');
    onCreateAndMove(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>{t('home.moveToFolder')}</Text>

        <Text style={[styles.modalLabel, { color: colors.textFaint }]}>{t('home.newFolder')}</Text>
        <View style={styles.modalRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('home.newFolderNamePlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            autoCorrect={false}
            onSubmitEditing={submit}
          />
          <Pressable
            onPress={submit}
            disabled={!name.trim()}
            style={[styles.modalCreateBtn, { backgroundColor: colors.accent, opacity: name.trim() ? 1 : 0.5 }]}
          >
            <Text style={styles.modalCreateBtnText}>{t('home.createAndMove')}</Text>
          </Pressable>
        </View>

        {folders.length ? (
          <>
            <Text style={[styles.modalLabel, { color: colors.textFaint, marginTop: 14 }]}>{t('home.existingFolders')}</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {folders.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => onMoveToExisting(f.id)}
                  style={[styles.folderRow, { borderBottomColor: colors.border }]}
                >
                  <Ionicons name="folder-outline" size={18} color={colors.accent} />
                  <Text style={[styles.folderRowText, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Pressable onPress={onClose} style={styles.modalCloseBtn}>
          <Text style={[styles.modalCloseBtnText, { color: colors.textMuted }]}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ---------------- Ana ekran ---------------- */

export default function HomeScreen({ navigation }) {
  const { colors, t, settings, language } = useApp();
  const { isPro } = usePurchases();
  const [models, setModels] = useState([]);
  const [folders, setFolders] = useState([]);
  const [busy, setBusy] = useState(false);

  const [currentFolderId, setCurrentFolderId] = useState(null); // null = kok dizin
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('date');   // date | name | size
  const [sortDir, setSortDir] = useState('desc');
  const [viewMode, setViewMode] = useState('list'); // list | grid

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);

  const refresh = useCallback(() => {
    listModels().then(setModels).catch(() => setModels([]));
    listFolders().then(setFolders).catch(() => setFolders([]));
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openModel = useCallback(async (record) => {
    if (record.source !== 'sample' && !isPro) {
      navigation.navigate('Paywall');
      return;
    }
    const exists = await fileExists(record.file_uri);
    if (!exists) {
      Alert.alert(t('common.error'), t('errors.unreadable'));
      await deleteModel(record.id);
      refresh();
      return;
    }
    navigation.navigate('Viewer', { model: record });
  }, [isPro, navigation, refresh, t]);

  const openSample = useCallback(async () => {
    setBusy(true);
    try {
      const file = await prepareSampleModel();
      const sampleNames = { en: 'Sample Model', de: 'Beispielmodell', tr: 'Ornek Model' };
      const id = await upsertModel({
        name: sampleNames[language] || sampleNames.tr,
        fileUri: file.uri,
        sizeBytes: file.size,
        source: 'sample',
      });
      const record = await getModel(id);
      refresh();
      navigation.navigate('Viewer', { model: record });
    } catch (e) {
      Alert.alert(t('common.error'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [language, navigation, refresh, t]);

  const pickFile = useCallback(async () => {
    if (!isPro) {
      navigation.navigate('Paywall');
      return;
    }
    setBusy(true);
    try {
      const file = await pickIfcFile();
      if (!file) return;
      const id = await upsertModel({ name: file.name, fileUri: file.uri, sizeBytes: file.size, source: 'device' });
      const record = await getModel(id);
      refresh();
      navigation.navigate('Viewer', { model: record });
    } catch (e) {
      if (e instanceof ModelFileError) Alert.alert(t('common.error'), t(e.code, e.params));
      else Alert.alert(t('common.error'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [isPro, navigation, refresh, t]);

  const confirmDelete = useCallback((record) => {
    Alert.alert(t('home.deleteConfirm'), record.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteModel(record.id);
          if (record.source !== 'sample') await deleteModelFile(record.file_uri);
          refresh();
        },
      },
    ]);
  }, [refresh, t]);

  /* ---------------- Coklu secim ---------------- */

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const bulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    Alert.alert(t('home.deleteSelectedConfirm', { count: ids.length }), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const targets = models.filter((m) => selectedIds.has(m.id));
          await Promise.all(targets.filter((m) => m.source !== 'sample').map((m) => deleteModelFile(m.file_uri).catch(() => {})));
          await deleteModels(ids);
          exitSelectMode();
          refresh();
        },
      },
    ]);
  }, [selectedIds, models, exitSelectMode, refresh, t]);

  const createAndMove = useCallback(async (name) => {
    const ids = Array.from(selectedIds);
    const folderId = await createFolder(name);
    await moveModelsToFolder(ids, folderId);
    setFolderPickerVisible(false);
    exitSelectMode();
    refresh();
  }, [selectedIds, exitSelectMode, refresh]);

  const moveToExisting = useCallback(async (folderId) => {
    const ids = Array.from(selectedIds);
    await moveModelsToFolder(ids, folderId);
    setFolderPickerVisible(false);
    exitSelectMode();
    refresh();
  }, [selectedIds, exitSelectMode, refresh]);

  const confirmDeleteFolder = useCallback((folder) => {
    Alert.alert(t('home.deleteFolderConfirm'), folder.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => { await deleteFolder(folder.id); refresh(); },
      },
    ]);
  }, [refresh, t]);

  /* ---------------- Liste turetme: klasor + arama + siralama ---------------- */

  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = models.filter((m) => (m.folder_id ?? null) === currentFolderId);
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q));

    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'size') return ((a.size_bytes || 0) - (b.size_bytes || 0)) * dir;
      return ((a.opened_at || 0) - (b.opened_at || 0)) * dir;
    });
    return list;
  }, [models, currentFolderId, query, sortKey, sortDir]);

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) || null,
    [folders, currentFolderId]
  );

  const folderCount = useCallback(
    (folderId) => models.filter((m) => m.folder_id === folderId).length,
    [models]
  );

  const changeSortKey = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  /* ---------------- Render ---------------- */

  const renderCard = ({ item, grid }) => {
    const selected = selectedIds.has(item.id);
    return (
      <Pressable
        onPress={() => (selectMode ? toggleSelected(item.id) : openModel(item))}
        onLongPress={() => (selectMode ? undefined : confirmDelete(item))}
        style={[
          grid ? styles.gridCard : styles.card,
          { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.border },
        ]}
      >
        {selectMode ? (
          <View style={[styles.checkbox, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : 'transparent' }]}>
            {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
          </View>
        ) : null}
        <CardThumb item={item} grid={grid} colors={colors} />
        <View style={grid ? { width: '100%' } : { flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={grid ? 2 : 1}>{item.name}</Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {formatSize(item.size_bytes)}  |  {timeAgo(item.opened_at, language)}
          </Text>
        </View>
        {!grid && !selectMode ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
      </Pressable>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.searchBox0}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('home.searchPlaceholder')}
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
      </View>

      <View style={styles.toolsRow}>
        <Segmented
          style={{ flex: 1 }}
          value={sortKey}
          onChange={changeSortKey}
          options={[
            { key: 'date', label: t('home.sortDate') },
            { key: 'name', label: t('home.sortName') },
            { key: 'size', label: t('home.sortSize') },
          ]}
        />
        <Pressable onPress={() => changeSortKey(sortKey)} style={[styles.toolBtn, { borderColor: colors.border }]} hitSlop={6}>
          <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={17} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
          style={[styles.toolBtn, { borderColor: colors.border }]}
          hitSlop={6}
        >
          <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={18} color={colors.text} />
        </Pressable>
      </View>

      {currentFolderId === null ? (
        <>
          {folders.length ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>{upper(t('home.folders'), language)}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16 }}>
                {folders.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => setCurrentFolderId(f.id)}
                    onLongPress={() => confirmDeleteFolder(f)}
                    style={[styles.folderChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Ionicons name="folder" size={22} color={colors.accent} />
                    <Text style={[styles.folderChipName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                    <Text style={[styles.folderChipCount, { color: colors.textFaint }]}>
                      {t('home.itemCount', { count: folderCount(f.id) })}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
          <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>{upper(t('home.history'), language)}</Text>
        </>
      ) : (
        <View style={styles.folderHeader}>
          <Pressable onPress={() => setCurrentFolderId(null)} style={styles.folderBackBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.accent} />
            <Text style={[styles.folderBackText, { color: colors.accent }]}>{t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.folderTitle, { color: colors.text }]} numberOfLines={1}>{currentFolder?.name}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Image
            source={colors.isDark ? LOGO_DARK : LOGO_LIGHT}
            style={{ width: LOGO_HEIGHT * LOGO_ASPECT, height: LOGO_HEIGHT }}
            resizeMode="contain"
            accessibilityLabel="SiteOfSight"
          />
        </View>
        {selectMode ? (
          <Pressable onPress={exitSelectMode} style={[styles.iconBtn, styles.cancelBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} hitSlop={8}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{t('common.cancel')}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => setSelectMode(true)}
              style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border, marginRight: 8 }]}
              hitSlop={8}
            >
              <Ionicons name="checkmark-done-outline" size={19} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </Pressable>
          </>
        )}
      </View>

      {!selectMode ? (
        <View style={styles.actions}>
          <Pressable
            onPress={openSample}
            disabled={busy}
            style={[styles.primary, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="play" size={19} color="#fff" />}
            <Text style={styles.primaryText}>{t('home.openSample')}</Text>
          </Pressable>

          <Pressable
            onPress={pickFile}
            disabled={busy}
            style={[styles.secondary, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons name="folder-open-outline" size={19} color={colors.text} />
            <Text style={[styles.secondaryText, { color: colors.text }]}>{t('home.openFile')}</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        key={viewMode}
        data={visibleModels}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => renderCard({ item, grid: viewMode === 'grid' })}
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? { paddingHorizontal: 11, gap: 10 } : undefined}
        contentContainerStyle={{ paddingHorizontal: viewMode === 'grid' ? 5 : 16, paddingBottom: selectMode ? 90 : 30, gap: 10 }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <EmptyState
            title={currentFolderId ? t('home.emptyFolder') : t('home.empty')}
            hint={currentFolderId ? undefined : t('home.emptyHint')}
          />
        )}
      />

      {selectMode ? (
        <View style={[styles.selectBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.selectCount, { color: colors.text }]}>
            {t('home.itemsSelected', { count: selectedIds.size })}
          </Text>
          <Pressable
            onPress={() => setFolderPickerVisible(true)}
            disabled={!selectedIds.size}
            style={[styles.selectBtn, { borderColor: colors.border, opacity: selectedIds.size ? 1 : 0.4 }]}
          >
            <Ionicons name="folder-outline" size={16} color={colors.text} />
            <Text style={[styles.selectBtnText, { color: colors.text }]}>{t('home.moveToFolder')}</Text>
          </Pressable>
          <Pressable
            onPress={bulkDelete}
            disabled={!selectedIds.size}
            style={[styles.selectBtn, { borderColor: colors.danger, opacity: selectedIds.size ? 1 : 0.4 }]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.selectBtnText, { color: colors.danger }]}>{t('common.delete')}</Text>
          </Pressable>
        </View>
      ) : null}

      <FolderPickerModal
        visible={folderPickerVisible}
        folders={folders}
        onClose={() => setFolderPickerVisible(false)}
        onCreateAndMove={createAndMove}
        onMoveToExisting={moveToExisting}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10,
  },
  cancelBtn: {
    width: undefined, minWidth: 42, paddingHorizontal: 16,
  },
  actions: { paddingHorizontal: 16, gap: 10 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, borderRadius: 16,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },

  searchBox0: { paddingHorizontal: 16, marginTop: 18 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14.5, padding: 0 },

  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 10 },
  toolBtn: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },

  sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.9, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 10 },

  folderChip: {
    width: 128, marginRight: 10, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  folderChipName: { fontSize: 13.5, fontWeight: '700', marginTop: 4 },
  folderChipCount: { fontSize: 11 },

  folderHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  folderBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  folderBackText: { fontSize: 13, fontWeight: '600' },
  folderTitle: { fontSize: 19, fontWeight: '700', marginTop: 6 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 16, borderWidth: 1.5,
  },
  thumb: { width: 58, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },

  gridCard: {
    flex: 1, alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1.5, gap: 8,
  },
  gridThumb: { width: '100%', height: 84, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  checkbox: {
    position: 'absolute', top: 8, right: 8, zIndex: 2,
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },

  selectBar: {
    position: 'absolute', left: 12, right: 12, bottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  selectCount: { fontSize: 12.5, fontWeight: '700', marginRight: 4 },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  selectBtnText: { fontSize: 12.5, fontWeight: '700' },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,16,0.5)' },
  modalCard: {
    position: 'absolute', left: 20, right: 20, top: '22%',
    borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18,
  },
  modalTitle: { fontSize: 16.5, fontWeight: '700', marginBottom: 10 },
  modalLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  modalRow: { flexDirection: 'row', gap: 8 },
  modalInput: { flex: 1, height: 42, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 14 },
  modalCreateBtn: { paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalCreateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderRowText: { flex: 1, fontSize: 14, fontWeight: '600' },
  modalCloseBtn: { alignItems: 'center', marginTop: 14 },
  modalCloseBtnText: { fontSize: 13.5, fontWeight: '600' },
});
