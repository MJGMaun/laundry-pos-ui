<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppHeader from '@/components/AppHeader.vue'
import { useBranchStore } from '@/stores/branch.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useChatStore } from '@/stores/chat.js'
import { usePermissionsStore } from '@/stores/permissions.js'

const sidebarOpen = ref(window.innerWidth >= 1024)
const branch = useBranchStore()
const settings = useSettingsStore()
const chat = useChatStore()
const perms = usePermissionsStore()
const route = useRoute()

onMounted(() => {
  settings.load()
  perms.refresh(branch.currentBranchId)
  chat.startPolling()
})
onUnmounted(() => chat.stopPolling())
// Page access is per branch, so switching branches must refetch it — the
// router guard only runs on navigation, and the sidebar would otherwise keep
// showing the previous branch's menu.
watch(() => branch.currentBranchId, (id) => {
  settings.load()
  perms.refresh(id)
  chat.refreshUnread()
})
</script>

<template>
  <div class="flex overflow-hidden" style="background: #f8fafc; height: 100dvh;">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="flex flex-col flex-1 min-w-0">
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main class="flex-1 min-h-0 overflow-x-hidden" :class="route.meta.fullHeight ? 'overflow-hidden' : 'overflow-y-auto'">
        <RouterView v-slot="{ Component, route }">
          <component :is="Component" :key="route.path + '_' + branch.currentBranchId" />
        </RouterView>
      </main>
    </div>
  </div>
</template>
