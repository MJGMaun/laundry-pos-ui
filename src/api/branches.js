import api from './index.js'

export const getBranches = () => api.get('/branches', { skipBranchId: true })
export const createBranch = (data) => api.post('/branches', data)
export const updateBranch = (id, data) => api.put(`/branches/${id}`, data)
export const deleteBranch = (id) => api.delete(`/branches/${id}`)
export const getBranchUsers = (branchId) => api.get(`/branches/${branchId}/users`)
export const assignUser = (branchId, data) => api.post(`/branches/${branchId}/users`, data)
export const removeUser = (branchId, userId) => api.delete(`/branches/${branchId}/users/${userId}`)
export const getBranchServices = (branchId) => api.get(`/branches/${branchId}/services`)
export const createBranchService = (branchId, data) => api.post(`/branches/${branchId}/services`, data)
export const updateBranchService = (branchId, serviceId, data) => api.put(`/branches/${branchId}/services/${serviceId}`, data)
export const deleteBranchService = (branchId, serviceId) => api.delete(`/branches/${branchId}/services/${serviceId}`)
