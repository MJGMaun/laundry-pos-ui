import api from './index.js'

export const getSalesSummary = (params) => api.get('/reports/sales-summary', { params })
export const getRevenue = (params) => api.get('/reports/revenue', { params })
export const getTopCustomers = (params) => api.get('/reports/top-customers', { params })
export const getServiceReport = (params) => api.get('/reports/services', { params })
export const getProfitLoss = (params) => api.get('/reports/profit-loss', { params })
export const getBranchComparison = (params) => api.get('/reports/branches', { params })
