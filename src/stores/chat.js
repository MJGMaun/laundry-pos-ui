import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUnreadCount } from '@/api/messages.js'

// Holds the global unread-message count for the sidebar badge and polls it
// on an interval. Chat is online-only, so failures (offline, or a super admin
// with no branch selected) just reset the badge to 0 rather than erroring.
export const useChatStore = defineStore('chat', () => {
  const unreadCount = ref(0)
  let timer = null

  async function refreshUnread() {
    try {
      const res = await getUnreadCount()
      unreadCount.value = Number(res.data.count || 0)
    } catch {
      unreadCount.value = 0
    }
  }

  function startPolling(intervalMs = 15000) {
    if (timer) return
    refreshUnread()
    timer = setInterval(refreshUnread, intervalMs)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { unreadCount, refreshUnread, startPolling, stopPolling }
})
