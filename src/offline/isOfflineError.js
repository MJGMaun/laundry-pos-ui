export function isOfflineError(e) {
  return !navigator.onLine || e.code === 'ERR_NETWORK' || (!e.response && !!e.request)
}
