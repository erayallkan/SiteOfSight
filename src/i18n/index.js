/* Basit sozluk tabanli i18n - Turkce varsayilan, Ingilizce secenekli */

export const tr = {
  appName: 'SiteOfSight',
  common: {
    ok: 'Tamam', cancel: 'Vazgec', close: 'Kapat', delete: 'Sil', retry: 'Tekrar dene',
    loading: 'Yukleniyor...', search: 'Ara', all: 'Tumu', none: 'Yok', error: 'Hata',
    open: 'Ac', back: 'Geri', save: 'Kaydet', clear: 'Temizle', apply: 'Uygula',
  },
  onboarding: {
    skip: 'Atla', next: 'Ileri', start: 'Basla',
    slides: [
      { title: 'IFC modellerini cebinde tasi', text: 'Karmasik BIM modellerini telefonunda akici sekilde ac, dondur ve incele.' },
      { title: 'buildingSMART hiyerarsisi', text: 'Proje > Saha > Bina > Kat > Eleman agacinda gez, ara ve filtrele.' },
      { title: 'Olc ve incele', text: 'Kose ve kenar orta noktalarina yakalanarak hassas mesafe/aci olcumu al.' },
      { title: 'Her sey cihazinda', text: 'Hesap gerekmez. Modellerin ve olcumlerin cihazindan disari cikmaz.' },
    ],
  },
  home: {
    title: 'Modeller',
    openSample: 'Ornek Model Ac',
    openFile: 'Cihazdan IFC Sec',
    history: 'Gecmis',
    empty: 'Henuz model acmadin.',
    emptyHint: 'Basmak icin "Ornek Model Ac" veya cihazindan bir .ifc dosyasi sec.',
    lastOpened: 'Son acilma',
    noAccount: 'Hesap gerekmez - tum veriler cihazinda kalir.',
    deleteConfirm: 'Bu model gecmisten silinsin mi?',
  },
  viewer: {
    preparing: 'Goruntuleyici hazirlaniyor...',
    transferring: 'Dosya aktariliyor',
    parsing: 'IFC ayristiriliyor',
    geometry: 'Geometri olusturuluyor',
    building: 'Sahne kuruluyor',
    tree: 'Model agaci olusturuluyor',
    tools: 'Araclar',
    tree_: 'Model Agaci',
    properties: 'Ozellikler',
    measure: 'Olcum',
    section: 'Kesit',
    display: 'Goruntuleme',
    wireframe: 'Tel Kafes',
    colorByType: 'Tipe Gore Renk',
    isolate: 'Izole Et',
    hide: 'Gizle',
    showAll: 'Tumunu Goster',
    fit: 'Sigdir',
    explode: 'Patlat',
    bookmarks: 'Kayitli Gorunumler',
    saveView: 'Gorunumu Kaydet',
    viewName: 'Gorunum adi',
    perspective: 'Perspektif',
    orthographic: 'Ortografik',
    fps: 'FPS',
    noSelection: 'Bir eleman secmek icin modele dokun.',
    stats: '{elements} eleman - {triangles} ucgen',
  },
  tree: {
    structure: 'Yapi', type: 'Tip', searchPlaceholder: 'Mekan veya eleman ara...',
    noResult: 'Sonuc bulunamadi', truncated: 'Agac cok buyuk, kismen gosteriliyor.',
  },
  props: {
    identity: 'Kimlik', name: 'Ad', type: 'IFC Tipi', globalId: 'GlobalId',
    tag: 'Etiket', description: 'Aciklama', material: 'Malzeme',
    dimensions: 'Boyutlar (mm)', quantities: 'Miktarlar', psets: 'Ozellik Setleri',
    width: 'Genislik', height: 'Yukseklik', depth: 'Derinlik',
  },
  measure: {
    mode: 'Olcum tipi', off: 'Kapali', distance: 'Mesafe', angle: 'Aci',
    snap: 'Kose / kenar yakalama', unit: 'Uzunluk birimi',
    undo: 'Geri al', redo: 'Yinele', clearAll: 'Tumunu sil',
    history: 'Olcum gecmisi', hint: 'Baslangic ve bitis noktalarina dokun.',
    empty: 'Henuz olcum yok.',
  },
  section: {
    axis: 'Eksen', position: 'Konum', flip: 'Yonu cevir', off: 'Kesiti kaldir',
    hint: 'Ekseni sec, kaydiraci surukle.',
  },
  settings: {
    title: 'Ayarlar', theme: 'Tema', themeSystem: 'Sistem', themeLight: 'Acik', themeDark: 'Koyu',
    language: 'Dil', unit: 'Olcum birimi', showFps: 'FPS gostergesi',
    maxSize: 'Dosya boyutu siniri', storage: 'Depolama', clearCache: 'Onbellegi temizle',
    about: 'Hakkinda', privacy: 'Hicbir veri buluta gonderilmez.', version: 'Surum',
  },
  errors: {
    tooLarge: 'Dosya cok buyuk ({size} MB). Sinir {limit} MB.',
    notIfc: 'Bu bir IFC dosyasi degil. Lutfen .ifc uzantili bir dosya sec.',
    unreadable: 'Dosya okunamadi. Baska bir kopya deneyebilirsin.',
    parseFailed: 'IFC dosyasi ayristirilamadi. Dosya bozuk veya desteklenmeyen bir surumde olabilir.',
    noGeometry: 'Dosyada goruntulenebilir 3B geometri bulunamadi.',
    viewerCrashed: 'Goruntuleyici beklenmedik sekilde durdu.',
    lowMemory: 'Model cihaz belleginden buyuk gorunuyor. Daha kucuk bir dosya dene.',
  },
};

export const en = {
  appName: 'SiteOfSight',
  common: {
    ok: 'OK', cancel: 'Cancel', close: 'Close', delete: 'Delete', retry: 'Retry',
    loading: 'Loading...', search: 'Search', all: 'All', none: 'None', error: 'Error',
    open: 'Open', back: 'Back', save: 'Save', clear: 'Clear', apply: 'Apply',
  },
  onboarding: {
    skip: 'Skip', next: 'Next', start: 'Get started',
    slides: [
      { title: 'IFC models in your pocket', text: 'Open, orbit and inspect complex BIM models smoothly on your phone.' },
      { title: 'buildingSMART hierarchy', text: 'Browse Project > Site > Building > Storey > Element, search and filter.' },
      { title: 'Measure and inspect', text: 'Snap to corners and edge midpoints for precise distance and angle measurements.' },
      { title: 'Everything stays local', text: 'No account needed. Your models and measurements never leave the device.' },
    ],
  },
  home: {
    title: 'Models',
    openSample: 'Open Sample Model',
    openFile: 'Pick IFC from device',
    history: 'History',
    empty: 'No models opened yet.',
    emptyHint: 'Tap "Open Sample Model" or pick an .ifc file from your device.',
    lastOpened: 'Last opened',
    noAccount: 'No account needed - all data stays on your device.',
    deleteConfirm: 'Remove this model from history?',
  },
  viewer: {
    preparing: 'Preparing viewer...',
    transferring: 'Transferring file',
    parsing: 'Parsing IFC',
    geometry: 'Building geometry',
    building: 'Composing scene',
    tree: 'Building model tree',
    tools: 'Tools',
    tree_: 'Model Tree',
    properties: 'Properties',
    measure: 'Measure',
    section: 'Section',
    display: 'Display',
    wireframe: 'Wireframe',
    colorByType: 'Color by type',
    isolate: 'Isolate',
    hide: 'Hide',
    showAll: 'Show all',
    fit: 'Fit',
    explode: 'Explode',
    bookmarks: 'Saved views',
    saveView: 'Save view',
    viewName: 'View name',
    perspective: 'Perspective',
    orthographic: 'Orthographic',
    fps: 'FPS',
    noSelection: 'Tap the model to select an element.',
    stats: '{elements} elements - {triangles} triangles',
  },
  tree: {
    structure: 'Structure', type: 'Type', searchPlaceholder: 'Search spaces or elements...',
    noResult: 'No results', truncated: 'Tree is very large, showing a partial view.',
  },
  props: {
    identity: 'Identity', name: 'Name', type: 'IFC type', globalId: 'GlobalId',
    tag: 'Tag', description: 'Description', material: 'Material',
    dimensions: 'Dimensions (mm)', quantities: 'Quantities', psets: 'Property sets',
    width: 'Width', height: 'Height', depth: 'Depth',
  },
  measure: {
    mode: 'Measurement type', off: 'Off', distance: 'Distance', angle: 'Angle',
    snap: 'Vertex / edge snap', unit: 'Length unit',
    undo: 'Undo', redo: 'Redo', clearAll: 'Clear all',
    history: 'Measurement history', hint: 'Tap the start and end points.',
    empty: 'No measurements yet.',
  },
  section: {
    axis: 'Axis', position: 'Position', flip: 'Flip direction', off: 'Remove section',
    hint: 'Pick an axis, then drag the slider.',
  },
  settings: {
    title: 'Settings', theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
    language: 'Language', unit: 'Measurement unit', showFps: 'FPS overlay',
    maxSize: 'File size limit', storage: 'Storage', clearCache: 'Clear cache',
    about: 'About', privacy: 'Nothing is uploaded to any server.', version: 'Version',
  },
  errors: {
    tooLarge: 'File is too large ({size} MB). Limit is {limit} MB.',
    notIfc: 'This is not an IFC file. Please pick a .ifc file.',
    unreadable: 'The file could not be read. Try another copy.',
    parseFailed: 'The IFC file could not be parsed. It may be corrupt or an unsupported schema.',
    noGeometry: 'No displayable 3D geometry was found in this file.',
    viewerCrashed: 'The viewer stopped unexpectedly.',
    lowMemory: 'This model looks larger than the device memory. Try a smaller file.',
  },
};

export const LANGUAGES = [
  { key: 'tr', label: 'Turkce' },
  { key: 'en', label: 'English' },
];

const DICTS = { tr, en };

/** 'viewer.tools' gibi noktali anahtari cozer; bulunamazsa anahtari dondurur. */
export function translate(language, key, params) {
  const dict = DICTS[language] || tr;
  let value = key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), dict);
  if (value === undefined) {
    value = key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), tr);
  }
  if (typeof value !== 'string') return value === undefined ? key : value;
  if (!params) return value;
  return Object.keys(params).reduce(
    (text, p) => text.replace(new RegExp(`\\{${p}\\}`, 'g'), String(params[p])),
    value
  );
}
