import api from './index.js'

// super_admin only: audit log of soft-deleted records across all branches
export const getDeletedRecords = (params) => api.get('/deleted-records', { params })
