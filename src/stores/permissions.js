import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getMyPageAccess } from '@/api/pageAccess.js'

const CACHE_KEY = 'page_access'

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * The signed-in user's page permissions at the active branch.
 *
 * Cached in localStorage so the app still knows its own menu offline, and
 * keyed by branch because the matrix is per-branch — a cached answer for
 * another branch would be the wrong answer, not a stale one.
 */
export const usePermissionsStore = defineStore('permissions', () => {
  const cached = readCache()

  const pages = ref(cached?.pages || null)
  const branchId = ref(cached?.branchId ?? null)
  const loading = ref(false)

  const loaded = computed(() => pages.value !== null)

  async function load(currentBranchId = null) {
    loading.value = true
    try {
      const res = await getMyPageAccess()
      pages.value = res.data.pages || {}
      branchId.value = res.data.branch_id ?? currentBranchId
      localStorage.setItem(CACHE_KEY, JSON.stringify({ branchId: branchId.value, pages: pages.value }))
    } catch {
      // Offline or a failed request: keep whatever was cached rather than
      // dropping the user to a permission-less state mid-shift.
    } finally {
      loading.value = false
    }
  }

  // Discard a matrix that belongs to a different branch, then refetch.
  async function refresh(currentBranchId) {
    if (branchId.value !== currentBranchId) {
      pages.value = null
    }
    await load(currentBranchId)
  }

  /**
   * null means "not known yet" — callers fall back to the role rules rather
   * than guessing, so a cold offline start never hides the whole app.
   */
  const canView = (page) => (pages.value ? !!pages.value[page]?.view : null)
  const canEdit = (page) => (pages.value ? !!pages.value[page]?.edit : null)

  function clear() {
    pages.value = null
    branchId.value = null
    localStorage.removeItem(CACHE_KEY)
  }

  return { pages, branchId, loading, loaded, load, refresh, canView, canEdit, clear }
})
