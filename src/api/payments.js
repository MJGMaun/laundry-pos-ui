import api from './index.js'

export const getPayments = (orderId) => api.get(`/orders/${orderId}/payments`)
export const createPayment = (orderId, data) => api.post(`/orders/${orderId}/payments`, data)
