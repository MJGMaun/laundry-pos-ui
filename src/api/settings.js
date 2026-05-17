import api from './index.js'

export const getSettings = (params) => api.get('/settings', { params })
export const updateSetting = (key, data) => api.put(`/settings/${key}`, data)
