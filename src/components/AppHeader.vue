<script setup>
import { ref } from 'vue'
import { useOnline } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { useQueueStore } from '@/stores/queue.js'
import { useRouter } from 'vue-router'

defineEmits(['toggle-sidebar'])

const auth = useAuthStore()
const branch = useBranchStore()
const router = useRouter()
const isOnline = useOnline()
const queue = useQueueStore()

const showUserMenu = ref(false)

async function logout() {
  showUserMenu.value = false
  await auth.logout()
  window.location.href = '/login'
}
</script>

<template>
  <header
    class="flex items-center gap-3 h-16 px-4 shrink-0 border-b sticky top-0 z-50"
    style="background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border-color: #e2e8f0;"
  >
    <!-- Hamburger -->
    <button
      class="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-95"
      @click="$emit('toggle-sidebar')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <div class="flex-1" />

    <!-- Offline / pending indicator -->
    <Transition name="fade">
      <div
        v-if="!isOnline"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
        Offline
      </div>
    </Transition>
    <Transition name="fade">
      <div
        v-if="isOnline && queue.pendingCount > 0"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
        Syncing {{ queue.pendingCount }}…
      </div>
    </Transition>

    <!-- Branch selector -->
    <div v-if="branch.branches.length > 1 || auth.isSuperAdmin" class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
        <span class="text-xs text-slate-400">🏪</span>
        <select
          :value="branch.currentBranchId"
          class="text-sm font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer max-w-[90px] sm:max-w-none"
          @change="branch.selectBranch($event.target.value ? Number($event.target.value) : null)"
        >
          <option v-if="auth.isSuperAdmin" :value="null">All branches</option>
          <option v-for="b in branch.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>
    </div>

    <div v-else-if="branch.currentBranch">
      <div class="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
        <span class="text-xs">🏪</span>
        <span class="text-sm font-medium text-blue-700 max-w-[90px] sm:max-w-none truncate">{{ branch.currentBranch.name }}</span>
      </div>
    </div>

    <!-- User menu -->
    <div class="relative">
      <button
        class="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 active:scale-95"
        @click="showUserMenu = !showUserMenu"
      >
        <div
          class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white"
          style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"
        >
          {{ auth.user?.name?.charAt(0).toUpperCase() }}
        </div>
        <span class="text-sm font-medium text-slate-700 hidden sm:block">{{ auth.user?.name }}</span>
        <svg
          class="w-4 h-4 text-slate-400 transition-transform duration-200"
          :class="showUserMenu ? 'rotate-180' : ''"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <!-- Dropdown -->
      <Transition name="dropdown">
        <div
          v-if="showUserMenu"
          class="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
          style="box-shadow: 0 8px 24px rgba(0,0,0,0.12);"
        >
          <div class="px-3 py-2.5 border-b border-slate-100">
            <div class="text-sm font-semibold text-slate-800">{{ auth.user?.name }}</div>
            <div class="text-xs text-slate-400 capitalize">{{ auth.user?.role?.replace('_', ' ') }}</div>
          </div>
          <button
            class="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            @click="logout"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </Transition>
    </div>
  </header>

  <!-- Dismiss dropdown on outside click -->
  <div v-if="showUserMenu" class="fixed inset-0 z-40" @click="showUserMenu = false" />
</template>

<style scoped>
.dropdown-enter-active { animation: slide-down 180ms cubic-bezier(0.22,1,0.36,1) both; }
.dropdown-leave-active { animation: slide-down 120ms ease reverse both; }
@keyframes slide-down {
  from { opacity: 0; transform: translateY(-8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.fade-enter-active, .fade-leave-active { transition: opacity 300ms, transform 300ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: scale(0.9); }
</style>
