import api from './index.js'

export const addLoads = (orderId, data) => api.post(`/orders/${orderId}/loads`, data)
