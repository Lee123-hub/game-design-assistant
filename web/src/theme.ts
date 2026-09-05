/**
 * 外观主题：模式（系统/浅色/深色）+ 强调色。
 * 存 localStorage，启动时 initTheme() 应用；模式为「系统」时跟随 prefers-color-scheme。
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const MODE_KEY = 'gda:theme-mode';
const ACCENT_KEY = 'gda:accent';

export const DEFAULT_ACCENT = '#5b8cff';

export const PRESET_ACCENTS = [
  '#5b8cff',
  '#3ecf8e',
  '#22d3ee',
  '#a78bfa',
  '#f5a623',
  '#f2555a',
];

function modeFromStorage(): ThemeMode {
  const v = localStorage.getItem(MODE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function loadThemeMode(): ThemeMode {
  return modeFromStorage();
}

export function loadAccent(): string {
  return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT;
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function apply(mode: ThemeMode, accent: string): void {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  const root = document.documentElement;
  root.dataset.mode = resolved;
  // 强调色与选中底色（半透明，深浅两套主题下都能落在面板色上）
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-dim', hexToRgba(accent, 0.2));
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(MODE_KEY, mode);
  apply(mode, loadAccent());
}

export function setAccentColor(hex: string): void {
  localStorage.setItem(ACCENT_KEY, hex);
  apply(modeFromStorage(), hex);
}

export function initTheme(): void {
  apply(modeFromStorage(), loadAccent());
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (modeFromStorage() === 'system') apply('system', loadAccent());
    });
}
