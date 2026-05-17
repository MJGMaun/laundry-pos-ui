import api from './index.js'

const branchOverride = (branchId) =>
  branchId ? { skipBranchId: true, headers: { 'X-Branch-Id': branchId } } : {}

export const getSettings = (branchId = null) => api.get('/settings', branchOverride(branchId))
export const updateSetting = (key, data, branchId = null) => api.put(`/settings/${key}`, data, branchOverride(branchId))
