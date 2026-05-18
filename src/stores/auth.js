import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, logout as apiLogout, getUser } from '@/api/auth.js'
import { runPull } from '@/offline/pull.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem('token'))

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const role = computed(() => user.value?.role)
  const isSuperAdmin = computed(() => role.value === 'super_admin')
  const isAdmin = computed(() => ['super_admin', 'admin'].includes(role.value))
  const isCashier = computed(() => ['super_admin', 'admin', 'cashier'].includes(role.value))

  async function login(credentials) {
    const res = await apiLogin(credentials)
    token.value = res.data.access_token
    user.value = res.data.user
    localStorage.setItem('token', token.value)
    runPull().catch(() => {})
    return res.data
  }

  async function fetchUser() {
    try {
      const res = await getUser()
      user.value = res.data
    } catch {
      token.value = null
      user.value = null
      localStorage.removeItem('token')
    }
  }

  async function logout() {
    try {
      await apiLogout()
    } catch {}
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('branch_id')
  }

  return { user, token, isAuthenticated, role, isSuperAdmin, isAdmin, isCashier, login, fetchUser, logout }
})
