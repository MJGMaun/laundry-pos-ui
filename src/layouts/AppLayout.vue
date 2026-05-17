<script setup>
import { ref } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppHeader from '@/components/AppHeader.vue'
import { useBranchStore } from '@/stores/branch.js'

const sidebarOpen = ref(true)
const branch = useBranchStore()
</script>

<template>
  <div class="flex h-screen overflow-hidden" style="background: #f8fafc;">
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main class="flex-1 overflow-y-auto">
        <RouterView v-slot="{ Component, route }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path + '_' + branch.currentBranchId" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
