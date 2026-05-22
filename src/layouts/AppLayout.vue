<script setup>
import { ref } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppHeader from '@/components/AppHeader.vue'
import { useBranchStore } from '@/stores/branch.js'

const sidebarOpen = ref(window.innerWidth >= 1024)
const branch = useBranchStore()
</script>

<template>
  <div class="flex overflow-hidden" style="background: #f8fafc; height: 100dvh;">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="flex flex-col flex-1 min-w-0">
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <RouterView v-slot="{ Component, route }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path + '_' + branch.currentBranchId" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
