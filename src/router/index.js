import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { useSettingsStore } from '@/stores/settings.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/c/:username',
      name: 'customer-loyalty-card',
      component: () => import('@/views/CustomerLoyaltyCardView.vue'),
      meta: { public: true },
    },
    {
      path: '/changelog',
      name: 'changelog',
      component: () => import('@/views/ChangelogView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: () => {
            const auth = useAuthStore()
            return auth.isAdmin ? '/dashboard' : '/pos'
          },
        },
        {
          path: 'pos',
          name: 'pos',
          component: () => import('@/views/pos/PosView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier', 'staff'], fullHeight: true },
        },
        {
          path: 'orders',
          name: 'orders',
          component: () => import('@/views/orders/OrderListView.vue'),
        },
        {
          path: 'orders/:id',
          name: 'order-detail',
          component: () => import('@/views/orders/OrderDetailView.vue'),
        },
        {
          path: 'pickup-queue',
          name: 'pickup-queue',
          component: () => import('@/views/orders/PickupQueueView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'customers',
          name: 'customers',
          component: () => import('@/views/customers/CustomerListView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier', 'staff'] },
        },
        {
          path: 'customers/:id',
          name: 'customer-detail',
          component: () => import('@/views/customers/CustomerDetailView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier', 'staff'] },
        },
        {
          path: 'messages',
          name: 'messages',
          component: () => import('@/views/MessagesView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier', 'staff'], fullHeight: true },
        },
        {
          path: 'schedule',
          name: 'schedule',
          component: () => import('@/views/ScheduleView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('@/views/admin/ReportsView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'cash-balance',
          name: 'cash-balance',
          component: () => import('@/views/admin/CashBalanceView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'payments',
          name: 'payments',
          component: () => import('@/views/admin/PaymentsView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'day-summary',
          name: 'day-summary',
          // cashier/staff reach this only when a super admin opts them in —
          // enforced in the navigation guard below.
          component: () => import('@/views/DaySummaryView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier', 'staff'] },
        },
        {
          path: 'machine-cycles',
          name: 'machine-cycles',
          component: () => import('@/views/admin/MachineCyclesView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'expenses',
          name: 'expenses',
          component: () => import('@/views/admin/ExpensesView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'services',
          name: 'services',
          component: () => import('@/views/admin/ServicesView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'loyalty',
          name: 'loyalty',
          component: () => import('@/views/admin/LoyaltyView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/admin/SettingsView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/admin/UsersView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'branches',
          name: 'branches',
          component: () => import('@/views/super-admin/BranchesView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'accounts',
          name: 'accounts',
          component: () => import('@/views/super-admin/AccountsView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'cross-branch',
          name: 'cross-branch',
          component: () => import('@/views/super-admin/CrossBranchView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'data-management',
          name: 'data-management',
          component: () => import('@/views/super-admin/DataManagementView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'deleted-records',
          name: 'deleted-records',
          component: () => import('@/views/super-admin/DeletedRecordsView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'activity',
          name: 'activity',
          component: () => import('@/views/super-admin/ActivityView.vue'),
          meta: { roles: ['super_admin'] },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.user && auth.token) {
    await auth.fetchUser()
  }

  // The branch list lives in memory only. After a full reload the cached user
  // short-circuits the fetch above, so the list would otherwise stay empty and
  // the header dropdown would collapse to just "All branches". Repopulate it
  // whenever it's missing for an authenticated user. currentBranchId is
  // restored from localStorage separately, so the active selection is preserved.
  if (auth.isAuthenticated) {
    const branch = useBranchStore()
    if (!branch.branches.length) {
      if (auth.isSuperAdmin) {
        try { await branch.loadBranches() } catch {}
      } else if (auth.user?.branches?.length) {
        branch.setBranches(auth.user.branches)
      } else {
        try { await branch.loadBranches() } catch {}
      }
    }
  }

  if (to.meta.public) return true

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: auth.isAdmin ? 'dashboard' : 'pos' }
  }

  if (to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return { name: 'pos' }
  }

  // Day Summary is admin-only unless a super admin opted the branch's
  // cashiers/staff in. Settings load in AppLayout, which mounts after this
  // guard, so a direct page load has to fetch them before deciding.
  if (to.name === 'day-summary' && auth.isAuthenticated && !auth.isAdmin) {
    const settings = useSettingsStore()
    if (!settings.loaded) await settings.load()
    if (!settings.daySummaryEnabled || !settings.daySummaryStaffEnabled) {
      return { name: 'pos' }
    }
  }
})

export default router
