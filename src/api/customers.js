import api from './index.js'

export const getCustomers = (params) => api.get('/customers', { params })
export const getCustomer = (id) => api.get(`/customers/${id}`)
export const createCustomer = (data) => api.post('/customers', data)
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data)
export const deleteCustomer = (id) => api.delete(`/customers/${id}`)

// Prepaid customer balance (admin-only)
export const getCustomerBalance = (id) => api.get(`/customers/${id}/balance`)
export const addCustomerDeposit = (id, data) => api.post(`/customers/${id}/balance/deposits`, data)
export const voidCustomerDeposit = (id, txId) => api.delete(`/customers/${id}/balance/transactions/${txId}`)
