import api from './index.js'

export const getDataCounts = (branchId) =>
  api.get(`/branches/${branchId}/data-counts`)

export const purgeData = (branchId, types) =>
  api.delete(`/branches/${branchId}/purge`, {
    data: { types, confirm: 'DELETE' },
  })
