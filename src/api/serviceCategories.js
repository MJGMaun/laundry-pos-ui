import api from './index.js'

export const getServiceCategories = () => api.get('/service-categories')
export const createServiceCategory = (data) => api.post('/service-categories', data)
export const updateServiceCategory = (id, data) => api.put(`/service-categories/${id}`, data)
export const deleteServiceCategory = (id) => api.delete(`/service-categories/${id}`)
