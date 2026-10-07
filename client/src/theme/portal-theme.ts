export function clearPortalThemePreference() {
  document.documentElement.removeAttribute('data-theme');
  try {
    window.localStorage.removeItem('mt-color-theme');
  } catch {
    // The portal still uses light styles when browser storage is unavailable.
  }
}
