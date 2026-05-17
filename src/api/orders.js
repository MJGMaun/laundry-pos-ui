import api from './index.js'

export const getOrders = (params) => api.get('/orders', { params })
export const getOrder = (id) => api.get(`/orders/${id}`)
export const createOrder = (data) => api.post('/orders', data)
export const updateOrder = (id, data) => api.put(`/orders/${id}`, data)
export const updateOrderStatus = (id, data) => api.patch(`/orders/${id}/status`, data)
export const deleteOrder = (id) => api.delete(`/orders/${id}`)
