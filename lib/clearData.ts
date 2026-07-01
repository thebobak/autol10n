/**
 * Removes every localStorage key this app has ever written (config,
 * onboarding flag, and all translation-session types), regardless of which
 * module owns that key. Scanning by prefix — rather than importing each
 * module's key constant — means this stays correct automatically as new
 * session types (e.g. a future mode) are added.
 */
export function clearAllLocalData() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('autol10n_'))
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {}
}
