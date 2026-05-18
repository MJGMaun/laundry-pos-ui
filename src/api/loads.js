import api from './index.js'

export const updateLoadStatus = (id, data) => api.patch(`/loads/${id}/status`, data)
export const addLoads         = (orderId, data) => api.post(`/orders/${orderId}/loads`, data)
