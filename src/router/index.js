import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'

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
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/pos' },
        {
          path: 'pos',
          name: 'pos',
          component: () => import('@/views/pos/PosView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier'] },
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
          meta: { roles: ['super_admin', 'admin', 'cashier'] },
        },
        {
          path: 'customers',
          name: 'customers',
          component: () => import('@/views/customers/CustomerListView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier'] },
        },
        {
          path: 'customers/:id',
          name: 'customer-detail',
          component: () => import('@/views/customers/CustomerDetailView.vue'),
          meta: { roles: ['super_admin', 'admin', 'cashier'] },
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
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/admin/SettingsView.vue'),
          meta: { roles: ['super_admin', 'admin'] },
        },
        {
          path: 'branches',
          name: 'branches',
          component: () => import('@/views/super-admin/BranchesView.vue'),
          meta: { roles: ['super_admin'] },
        },
        {
          path: 'cross-branch',
          name: 'cross-branch',
          component: () => import('@/views/super-admin/CrossBranchView.vue'),
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

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'pos' }
  }

  if (to.meta.roles && !to.meta.roles.includes(auth.role)) {
    return { name: 'pos' }
  }
})

export default router
