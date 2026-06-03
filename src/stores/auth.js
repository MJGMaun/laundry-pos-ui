import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, logout as apiLogout, getUser } from '@/api/auth.js'
import { runPull } from '@/offline/pull.js'

function loadCachedUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
}

export const useAuthStore = defineStore('auth', () => {
  const user  = ref(loadCachedUser())
  const token = ref(localStorage.getItem('token'))

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const role = computed(() => user.value?.role)
  const isSuperAdmin = computed(() => role.value === 'super_admin')
  const isAdmin = computed(() => ['super_admin', 'admin'].includes(role.value))
  const isCashier = computed(() => ['super_admin', 'admin', 'cashier', 'staff'].includes(role.value))

  async function login(credentials) {
    const res = await apiLogin(credentials)
    token.value = res.data.access_token
    user.value = res.data.user
    localStorage.setItem('token', token.value)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    runPull().catch(() => {})
    return res.data
  }

  async function fetchUser() {
    try {
      const res = await getUser()
      user.value = res.data
      localStorage.setItem('user', JSON.stringify(res.data))
      runPull().catch(() => {})
    } catch (e) {
      // Network/offline error — keep the cached user so offline reload works
      if (!e.response) return
      // Real auth failure (401/403) — clear everything
      token.value = null
      user.value = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }

  async function logout() {
    try {
      await apiLogout()
    } catch {}
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('branch_id')
  }

  return { user, token, isAuthenticated, role, isSuperAdmin, isAdmin, isCashier, login, fetchUser, logout }
})
