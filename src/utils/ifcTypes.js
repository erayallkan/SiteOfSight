/* IFC tip kodlari icin ikon, renk ve okunabilir etiket eslemesi.
   (Viewer tarafindaki renk paleti ile ayni tutulur: assets/viewer/js/util.js) */

const MAP = {
  IFCPROJECT: { icon: 'cube-outline', color: '#8FA3C0', label: 'Proje' },
  IFCSITE: { icon: 'map-outline', color: '#8A7350', label: 'Saha' },
  IFCBUILDING: { icon: 'business-outline', color: '#7E97B8', label: 'Bina' },
  IFCBUILDINGSTOREY: { icon: 'layers-outline', color: '#7FA1B5', label: 'Kat' },
  IFCSPACE: { icon: 'square-outline', color: '#4CAF7D', label: 'Mekan' },
  IFCWALL: { icon: 'browsers-outline', color: '#BFC4CC', label: 'Duvar' },
  IFCWALLSTANDARDCASE: { icon: 'browsers-outline', color: '#BFC4CC', label: 'Duvar' },
  IFCSLAB: { icon: 'tablet-landscape-outline', color: '#8E9AAF', label: 'Doseme' },
  IFCROOF: { icon: 'home-outline', color: '#2F4A8C', label: 'Cati' },
  IFCCOLUMN: { icon: 'ellipsis-vertical', color: '#D98C4A', label: 'Kolon' },
  IFCBEAM: { icon: 'remove-outline', color: '#C2703D', label: 'Kiris' },
  IFCDOOR: { icon: 'exit-outline', color: '#B99B58', label: 'Kapi' },
  IFCWINDOW: { icon: 'grid-outline', color: '#6FB3D2', label: 'Pencere' },
  IFCSTAIR: { icon: 'trending-up-outline', color: '#A07CC5', label: 'Merdiven' },
  IFCSTAIRFLIGHT: { icon: 'trending-up-outline', color: '#A07CC5', label: 'Merdiven Kolu' },
  IFCRAILING: { icon: 'reorder-four-outline', color: '#7A6AA8', label: 'Korkuluk' },
  IFCFURNISHINGELEMENT: { icon: 'bed-outline', color: '#6FA88A', label: 'Mobilya' },
  IFCPLATE: { icon: 'square-outline', color: '#9AA5B1', label: 'Levha' },
  IFCMEMBER: { icon: 'git-commit-outline', color: '#B0752E', label: 'Eleman' },
  IFCCOVERING: { icon: 'copy-outline', color: '#CFCFCF', label: 'Kaplama' },
  IFCFOOTING: { icon: 'server-outline', color: '#6E6155', label: 'Temel' },
  IFCBUILDINGELEMENTPROXY: { icon: 'help-circle-outline', color: '#AAAAAA', label: 'Genel Eleman' },
  IFCFLOWSEGMENT: { icon: 'git-network-outline', color: '#59A5B8', label: 'Tesisat' },
  IFCFLOWTERMINAL: { icon: 'radio-outline', color: '#59A5B8', label: 'Tesisat Ucu' },
  IFCGROUP: { icon: 'folder-outline', color: '#9AA3B2', label: 'Grup' },
};

const FALLBACK = { icon: 'shapes-outline', color: '#AFAFAF', label: 'Eleman' };

export function typeInfo(type) {
  if (!type) return FALLBACK;
  return MAP[String(type).toUpperCase()] || FALLBACK;
}

/** IFCBUILDINGSTOREY -> "Building Storey" gibi okunabilir bir etiket. */
export function prettyType(type) {
  if (!type) return '-';
  const raw = String(type).replace(/^IFC/i, '');
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
