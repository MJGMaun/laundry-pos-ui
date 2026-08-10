<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useChatStore } from '@/stores/chat.js'
import { usePermissionsStore } from '@/stores/permissions.js'

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
const chat     = useChatStore()
const perms    = usePermissionsStore()

// ── Nav items ─────────────────────────────────────────────────────────────────
// Every page the app has, in menu order, each tagged with its registry key and
// the roles that shipped with it. The matrix decides what actually appears;
// `roles` is only the fallback for a cold offline start where it isn't known
// yet. This has to be one declarative list rather than role-branched pushes —
// the point of the matrix is that a branch can *grant* a page to a role that
// never had it, which a list built out of `if (auth.isAdmin)` cannot express.
const ALL_ITEMS = [
  { to: '/dashboard',      page: 'dashboard',       emoji: '📊',  label: 'Dashboard',       color: '#fbbf24', roles: ['super_admin', 'admin'] },
  { to: '/schedule',       page: 'schedule',        emoji: '🚗',  label: 'Schedule',        color: '#38bdf8', roles: ['super_admin', 'admin'], requires: () => settings.pickupDeliveryEnabled },
  { to: '/pos',            page: 'pos',             emoji: '🛒',  label: 'POS',             color: '#60a5fa', roles: ['super_admin', 'admin', 'cashier', 'staff'] },
  { to: '/orders',         page: 'orders',          emoji: '📋',  label: 'Orders',          color: '#a78bfa', roles: ['super_admin', 'admin', 'cashier', 'staff'] },
  { to: '/customers',      page: 'customers',       emoji: '👥',  label: 'Customers',       color: '#34d399', roles: ['super_admin', 'admin', 'cashier', 'staff'] },
  { to: '/messages',       page: 'messages',        emoji: '💬',  label: 'Messages',        color: '#38bdf8', roles: ['super_admin', 'admin', 'cashier', 'staff'], badge: () => chat.unreadCount },
  { to: '/day-summary',    page: 'day-summary',     emoji: '🧾',  label: 'Day Summary',     color: '#fbbf24', roles: ['super_admin', 'admin'], requires: () => settings.daySummaryEnabled },
  { to: '/reports',        page: 'reports',         emoji: '📈',  label: 'Reports',         color: '#fb923c', roles: ['super_admin', 'admin'] },
  { to: '/cash-balance',   page: 'cash-balance',    emoji: '💰',  label: 'Cash Balance',    color: '#34d399', roles: ['super_admin', 'admin'] },
  { to: '/accounts',       page: 'accounts',        emoji: '🏦',  label: 'Accounts',        color: '#2dd4bf', roles: ['super_admin', 'admin'] },
  { to: '/payments',       page: 'payments',        emoji: '🧾',  label: 'Payments',        color: '#2dd4bf', roles: ['super_admin', 'admin'] },
  { to: '/machine-cycles', page: 'machine-cycles',  emoji: '🔄',  label: 'Machine Cycles',  color: '#22d3ee', roles: ['super_admin', 'admin'] },
  { to: '/expenses',       page: 'expenses',        emoji: '💸',  label: 'Expenses',        color: '#f87171', roles: ['super_admin', 'admin'] },
  { to: '/services',       page: 'services',        emoji: '🧺',  label: 'Services',        color: '#4ade80', roles: ['super_admin', 'admin'] },
  { to: '/loyalty',        page: 'loyalty',         emoji: '🎁',  label: 'Loyalty',         color: '#f472b6', roles: ['super_admin', 'admin'] },
  { to: '/users',          page: 'users',           emoji: '👤',  label: 'Users',           color: '#818cf8', roles: ['super_admin', 'admin'] },
  { to: '/settings',       page: 'settings',        emoji: '⚙️',  label: 'Settings',        color: '#94a3b8', roles: ['super_admin', 'admin'] },
  { to: '/pickup-queue',   page: 'pickup-queue',    emoji: '🧾',  label: 'Pickup Queue',    color: '#f59e0b', roles: ['super_admin'] },
  { to: '/branches',       page: 'branches',        emoji: '🏪',  label: 'Branches',        color: '#c084fc', roles: ['super_admin'] },
  { to: '/cross-branch',   page: 'cross-branch',    emoji: '🌐',  label: 'All Branches',    color: '#38bdf8', roles: ['super_admin'] },
  { to: '/data-management', page: 'data-management', emoji: '🗑️', label: 'Data Management', color: '#f87171', roles: ['super_admin'] },
  { to: '/deleted-records', page: 'deleted-records', emoji: '📜', label: 'Deleted Records', color: '#fb7185', roles: ['super_admin'] },
  { to: '/activity',       page: 'activity',        emoji: '🕒',  label: 'Activity',        color: '#34d399', roles: ['super_admin'] },
]

const navItems = computed(() => {
  // Day Summary's older cashier/staff opt-in still stands alongside the matrix.
  const daySummaryLegacy = settings.daySummaryEnabled && settings.daySummaryStaffEnabled

  return ALL_ITEMS
    .filter((item) => {
      if (item.requires && !item.requires()) return false

      const granted = perms.canView(item.page)
      if (granted !== null) {
        if (granted) return true
        // A grant the matrix hasn't heard of, kept so enabling the old toggle
        // still works for branches that never touch the matrix.
        return item.page === 'day-summary' && !auth.isAdmin && daySummaryLegacy
      }

      // Matrix unknown — fall back to the rules the app shipped with.
      if (item.roles.includes(auth.role)) return true
      return item.page === 'day-summary' && !auth.isAdmin && daySummaryLegacy
    })
    .map((item) => ({ ...item, badge: item.badge ? item.badge() : undefined }))
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

          <!-- Unread badge (expanded) -->
          <span
            v-if="open && item.badge > 0"
            class="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style="background: #ef4444;"
          >{{ item.badge > 99 ? '99+' : item.badge }}</span>

          <!-- Unread badge (collapsed dot) -->
          <div
            v-if="!open && item.badge > 0"
            class="absolute right-1 top-1 h-2 w-2 rounded-full ring-2"
            style="background: #ef4444; --tw-ring-color: #0a1628;"
          />

          <!-- Collapsed active dot -->
          <div
            v-if="!open && isActive(item.to) && !(item.badge > 0)"
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
