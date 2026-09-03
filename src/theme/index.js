/* Yumusak renk paleti - koyu (varsayilan) ve acik tema */

export const dark = {
  key: 'dark',
  isDark: true,
  bg: '#0E1116',
  surface: '#171B22',
  surfaceAlt: '#1F242D',
  sheet: '#12161C',
  border: '#2A303B',
  text: '#E7EAF0',
  textMuted: '#9AA3B2',
  textFaint: '#6B7484',
  accent: '#5472E0',
  accentSoft: 'rgba(84,114,224,0.16)',
  info: '#4C8DF6',
  success: '#3FB27F',
  warning: '#E0A32E',
  danger: '#E05A4E',
  viewerBg: '#20232A',
  overlay: 'rgba(0,0,0,0.55)',
};

export const light = {
  key: 'light',
  isDark: false,
  bg: '#F4F6F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF0F5',
  sheet: '#FFFFFF',
  border: '#DDE2EA',
  text: '#1B2029',
  textMuted: '#5C6675',
  textFaint: '#8B94A3',
  accent: '#2A46B8',
  accentSoft: 'rgba(42,70,184,0.10)',
  info: '#2F6FD0',
  success: '#2E8F66',
  warning: '#B9821F',
  danger: '#C4453A',
  viewerBg: '#E9ECF1',
  overlay: 'rgba(20,24,32,0.35)',
};

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };

export function paletteFor(themeKey, systemIsDark) {
  if (themeKey === 'light') return light;
  if (themeKey === 'dark') return dark;
  return systemIsDark ? dark : light;
}
