import api from './index.js'

// What the signed-in user may reach at the active branch.
export const getMyPageAccess = () => api.get('/my-page-access')

// Super-admin only: the full editable matrix for one branch.
export const getBranchPageAccess = (branchId) => api.get(`/branches/${branchId}/page-access`)
export const setBranchPageAccess = (branchId, data) => api.put(`/branches/${branchId}/page-access`, data)
