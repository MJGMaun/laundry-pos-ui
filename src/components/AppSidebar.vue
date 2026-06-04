<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { useSettingsStore } from '@/stores/settings.js'

defineProps({ open: Boolean })
const emit = defineEmits(['close'])

function handleNav(navigate) {
  navigate()
  if (window.innerWidth < 1024) emit('close')
}

const route    = useRoute()
const auth     = useAuthStore()
const branch   = useBranchStore()
const settings = useSettingsStore()

// ── Nav items ─────────────────────────────────────────────────────────────────
const navItems = computed(() => {
  const items = []
  if (auth.isAdmin) {
    items.push({ to: '/dashboard', emoji: '📊', label: 'Dashboard',    color: '#fbbf24' })
    items.push({ to: '/schedule',  emoji: '🚗', label: 'Schedule',     color: '#38bdf8' })
  }
  if (auth.isCashier) {
    items.push({ to: '/pos',           emoji: '🛒', label: 'POS',          color: '#60a5fa' })
    items.push({ to: '/orders',        emoji: '📋', label: 'Orders',       color: '#a78bfa' })
    items.push({ to: '/customers',     emoji: '👥', label: 'Customers',    color: '#34d399' })
  } else {
    items.push({ to: '/orders',        emoji: '📋', label: 'Orders',       color: '#a78bfa' })
  }
  // Day Summary — printable end-of-day remittance, available to all roles
  // (can be turned off per branch from Branch Management)
  if (settings.daySummaryEnabled) {
    items.push({ to: '/day-summary',   emoji: '🧾', label: 'Day Summary',  color: '#fbbf24' })
  }
  if (auth.isAdmin) {
    items.push({ to: '/reports',       emoji: '📈', label: 'Reports',       color: '#fb923c' })
    items.push({ to: '/cash-balance',  emoji: '💰', label: 'Cash Balance',   color: '#34d399' })
    items.push({ to: '/expenses',  emoji: '💸', label: 'Expenses',     color: '#f87171' })
    items.push({ to: '/services',  emoji: '🧺', label: 'Services',     color: '#4ade80' })
    items.push({ to: '/loyalty',   emoji: '🎁', label: 'Loyalty',      color: '#f472b6' })
    items.push({ to: '/users',     emoji: '👤', label: 'Users',        color: '#818cf8' })
    items.push({ to: '/settings',  emoji: '⚙️', label: 'Settings',     color: '#94a3b8' })
  }
  if (auth.isSuperAdmin) {
    items.push({ to: '/pickup-queue',      emoji: '🧾', label: 'Pickup Queue',    color: '#f59e0b' })
    items.push({ to: '/branches',          emoji: '🏪', label: 'Branches',        color: '#c084fc' })
    items.push({ to: '/cross-branch',      emoji: '🌐', label: 'All Branches',    color: '#38bdf8' })
    items.push({ to: '/data-management',   emoji: '🗑️', label: 'Data Management', color: '#f87171' })
  }
  return items
})

const roleLabel = computed(() => ({
  super_admin: 'Super Admin',
  admin:       'Administrator',
  cashier:     'Cashier',
  staff:       'Staff',
}[auth.role] || auth.role))

function isActive(path) {
  if (path === '/pos') return route.path === '/pos'
  return route.path.startsWith(path)
}
</script>

<template>
  <!-- Mobile overlay -->
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-20 lg:hidden"
      style="background: rgba(15,23,42,0.5); backdrop-filter: blur(4px);"
      @click="$emit('close')"
    />
  </Transition>

  <!-- Sidebar -->
  <aside
    class="fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-out lg:relative shrink-0"
    :class="open ? 'w-60' : 'w-0 lg:w-[70px] overflow-hidden'"
    style="background: linear-gradient(180deg, #0f172a 0%, #0a1628 60%, #0f0f23 100%);"
  >
    <!-- Top accent line -->
    <div
      class="absolute top-0 left-0 right-0 h-px"
      style="background: linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent);"
    />

    <!-- Logo -->
    <div
      class="flex items-center gap-3 px-4 shrink-0 border-b"
      style="border-color: rgba(255,255,255,0.07); padding-top: env(safe-area-inset-top); min-height: calc(4rem + env(safe-area-inset-top));"
    >
      <img src="@/assets/logo-pos.png" alt="Laundry POS" class="w-9 h-9 rounded-xl shrink-0 object-contain" />
      <div v-if="open" class="overflow-hidden">
        <div class="text-xs truncate" style="color: rgba(148,163,184,0.6);">
          {{ branch.currentBranch?.name || 'Select branch' }}
        </div>
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 py-3 overflow-y-auto overflow-x-hidden" style="scrollbar-width: none;">
      <RouterLink
        v-for="(item, i) in navItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ navigate }"
      >
        <button
          class="relative flex items-center gap-3 w-full text-left transition-all duration-150 group py-2.5"
          :class="[
            open ? 'px-3 mx-2 my-0.5 rounded-xl' : 'justify-center px-0 my-0.5 w-full',
            isActive(item.to) ? '' : 'hover:bg-white/5',
          ]"
          :style="[
            open ? 'width: calc(100% - 16px);' : '',
            isActive(item.to)
              ? 'background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.12)); box-shadow: inset 0 0 0 1px rgba(99,102,241,0.25);'
              : '',
            `animation: sidebarSlide ${180 + i * 30}ms ease both;`,
          ]"
          @click="handleNav(navigate)"
        >
          <!-- Active left bar -->
          <div
            v-if="isActive(item.to)"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
            :style="`background: ${item.color}; box-shadow: 0 0 8px ${item.color};`"
          />

          <!-- Icon -->
          <span class="text-base leading-none shrink-0 transition-all duration-150 group-hover:scale-110">
            {{ item.emoji }}
          </span>

          <!-- Label -->
          <span
            v-if="open"
            class="text-sm font-medium whitespace-nowrap transition-colors duration-150"
            :style="isActive(item.to) ? 'color: white;' : 'color: rgba(148,163,184,0.75);'"
            :class="!isActive(item.to) ? 'group-hover:!text-white' : ''"
          >
            {{ item.label }}
          </span>

          <!-- Collapsed active dot -->
          <div
            v-if="!open && isActive(item.to)"
            class="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full"
            :style="`background: ${item.color};`"
          />
        </button>
      </RouterLink>
    </nav>

    <!-- Divider -->
    <div class="mx-4 h-px mb-3" style="background: rgba(255,255,255,0.07);" />

    <!-- User -->
    <div class="px-3 pb-4">
      <div
        class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
        :class="open ? '' : 'justify-center'"
        style="background: rgba(255,255,255,0.05);"
      >
        <div
          class="flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-sm font-bold text-white"
          style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"
        >
          {{ auth.user?.name?.charAt(0).toUpperCase() ?? '?' }}
        </div>
        <div v-if="open" class="min-w-0">
          <div class="text-sm font-medium text-white truncate">{{ auth.user?.name }}</div>
          <div class="text-xs truncate" style="color: rgba(148,163,184,0.55);">{{ roleLabel }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 200ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@keyframes sidebarSlide {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
</style>
