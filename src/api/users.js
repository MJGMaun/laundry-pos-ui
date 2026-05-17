import api from './index.js'

export const getUsers = (params) => api.get('/users', { params })
export const getAllUsers = (params) => api.get('/users', { params, skipBranchId: true })
export const getUser = (id) => api.get(`/users/${id}`)
export const createUser = (data) => api.post('/users', data)
export const updateUser = (id, data) => api.put(`/users/${id}`, data)
export const deleteUser = (id) => api.delete(`/users/${id}`)
