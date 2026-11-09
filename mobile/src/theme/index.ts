/** MOSHINA BOR design tokens — dark only. */
export const colors = {
  bg: '#0B0D10',
  surface: '#12161C',
  surfaceRaised: '#181D25',
  surfaceHigh: '#1F2530',
  border: '#262D38',
  borderStrong: '#323B48',
  text: '#F4F6FA',
  textSecondary: '#A3ADBD',
  textMuted: '#6B7686',
  accent: '#2F7BFF',
  accentPressed: '#1F63E0',
  accentSoft: 'rgba(47,123,255,0.14)',
  success: '#2BC48A',
  successSoft: 'rgba(43,196,138,0.14)',
  warning: '#F5B544',
  warningSoft: 'rgba(245,181,68,0.14)',
  danger: '#FF5A5F',
  dangerSoft: 'rgba(255,90,95,0.14)',
  overlay: 'rgba(5,7,10,0.72)',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.6 },
  number: { fontSize: 26, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.3 },
} as const;

export const MIN_TOUCH = 44;
