import api from './index.js'

export const getPayments = (orderId) => api.get(`/orders/${orderId}/payments`)
export const createPayment = (orderId, data) => api.post(`/orders/${orderId}/payments`, data)
// admin-only: cross-order payment list + delete
export const getAllPayments = (params) => api.get('/payments', { params })
export const deletePayment = (id) => api.delete(`/payments/${id}`)
