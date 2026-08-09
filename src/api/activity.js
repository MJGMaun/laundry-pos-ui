import api from './index.js'

// super_admin only: cross-branch feed of recent orders with their loads
export const getActivityOrders = (params) => api.get('/activity/orders', { params, skipBranchId: true })
