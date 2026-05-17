import api from './index.js'

const bc = (branchId) =>
  branchId ? { skipBranchId: true, headers: { 'X-Branch-Id': branchId } } : {}

export const getSalesSummary = (params, branchId = null) => api.get('/reports/sales-summary', { params, ...bc(branchId) })
export const getRevenue = (params, branchId = null) => api.get('/reports/revenue', { params, ...bc(branchId) })
export const getTopCustomers = (params, branchId = null) => api.get('/reports/top-customers', { params, ...bc(branchId) })
export const getServiceReport = (params, branchId = null) => api.get('/reports/services', { params, ...bc(branchId) })
export const getProfitLoss = (params, branchId = null) => api.get('/reports/profit-loss', { params, ...bc(branchId) })
export const getBranchComparison = (params) => api.get('/reports/branches', { params, skipBranchId: true })
