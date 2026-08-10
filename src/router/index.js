import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { useSettingsStore } from '@/stores/settings.js'
import { usePermissionsStore } from '@/stores/permissions.js'

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
          meta: { page: 'pos', roles: ['super_admin', 'admin', 'cashier', 'staff'], fullHeight: true },
        },
        {
          path: 'orders',
          name: 'orders',
          component: () => import('@/views/orders/OrderListView.vue'),
          meta: { page: 'orders' },
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
          meta: { page: 'pickup-queue', roles: ['super_admin'] },
        },
        {
          path: 'customers',
          name: 'customers',
          component: () => import('@/views/customers/CustomerListView.vue'),
          meta: { page: 'customers', roles: ['super_admin', 'admin', 'cashier', 'staff'] },
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
          meta: { page: 'messages', roles: ['super_admin', 'admin', 'cashier', 'staff'], fullHeight: true },
        },
        {
          path: 'schedule',
          name: 'schedule',
          component: () => import('@/views/ScheduleView.vue'),
          meta: { page: 'schedule', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { page: 'dashboard', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'reports',
          name: 'reports',
          component: () => import('@/views/admin/ReportsView.vue'),
          meta: { page: 'reports', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'cash-balance',
          name: 'cash-balance',
          component: () => import('@/views/admin/CashBalanceView.vue'),
          meta: { page: 'cash-balance', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'accounts',
          name: 'accounts',
          component: () => import('@/views/admin/AccountsView.vue'),
          meta: { page: 'accounts', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'payments',
          name: 'payments',
          component: () => import('@/views/admin/PaymentsView.vue'),
          meta: { page: 'payments', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'day-summary',
          name: 'day-summary',
          // cashier/staff reach this only when a super admin opts them in —
          // enforced in the navigation guard below.
          component: () => import('@/views/DaySummaryView.vue'),
          meta: { page: 'day-summary', roles: ['super_admin', 'admin', 'cashier', 'staff'] },
        },
        {
          path: 'machine-cycles',
          name: 'machine-cycles',
          component: () => import('@/views/admin/MachineCyclesView.vue'),
          meta: { page: 'machine-cycles', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'expenses',
          name: 'expenses',
          component: () => import('@/views/admin/ExpensesView.vue'),
          meta: { page: 'expenses', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'services',
          name: 'services',
          component: () => import('@/views/admin/ServicesView.vue'),
          meta: { page: 'services', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'loyalty',
          name: 'loyalty',
          component: () => import('@/views/admin/LoyaltyView.vue'),
          meta: { page: 'loyalty', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/admin/SettingsView.vue'),
          meta: { page: 'settings', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/admin/UsersView.vue'),
          meta: { page: 'users', roles: ['super_admin', 'admin'] },
        },
        {
          path: 'branches',
          name: 'branches',
          component: () => import('@/views/super-admin/BranchesView.vue'),
          meta: { page: 'branches', roles: ['super_admin'] },
        },
        {
          path: 'cross-branch',
          name: 'cross-branch',
          component: () => import('@/views/super-admin/CrossBranchView.vue'),
          meta: { page: 'cross-branch', roles: ['super_admin'] },
        },
        {
          path: 'data-management',
          name: 'data-management',
          component: () => import('@/views/super-admin/DataManagementView.vue'),
          meta: { page: 'data-management', roles: ['super_admin'] },
        },
        {
          path: 'deleted-records',
          name: 'deleted-records',
          component: () => import('@/views/super-admin/DeletedRecordsView.vue'),
          meta: { page: 'deleted-records', roles: ['super_admin'] },
        },
        {
          path: 'activity',
          name: 'activity',
          component: () => import('@/views/super-admin/ActivityView.vue'),
          meta: { page: 'activity', roles: ['super_admin'] },
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

  // Page access: the per-branch matrix decides when we know it, the shipped
  // role rules when we don't (a cold offline start), so a failed fetch can
  // never blank the whole app. null = not known yet.
  let matrixAllows = null

  if (to.meta.page && auth.isAuthenticated) {
    const perms = usePermissionsStore()
    const branch = useBranchStore()

    if (!perms.loaded || perms.branchId !== branch.currentBranchId) {
      await perms.refresh(branch.currentBranchId)
    }

    matrixAllows = perms.canView(to.meta.page)
    if (matrixAllows === false) return { name: 'pos' }
  }

  // An explicit grant outranks the role rules — that is the whole point of the
  // matrix — but a page the matrix has no opinion on still obeys them.
  if (matrixAllows !== true && to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return { name: 'pos' }
  }

  // Day Summary is admin-only unless a super admin opted the branch's
  // cashiers/staff in. Settings load in AppLayout, which mounts after this
  // guard, so a direct page load has to fetch them before deciding.
  // A matrix grant supersedes this older opt-in, so the two cannot disagree.
  if (matrixAllows !== true && to.name === 'day-summary' && auth.isAuthenticated && !auth.isAdmin) {
    const settings = useSettingsStore()
    if (!settings.loaded) await settings.load()
    if (!settings.daySummaryEnabled || !settings.daySummaryStaffEnabled) {
      return { name: 'pos' }
    }
  }
})

export default router
