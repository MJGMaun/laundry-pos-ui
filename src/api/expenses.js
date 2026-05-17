import api from './index.js'

export const getExpenses = (params) => api.get('/expenses', { params })
export const createExpense = (data) => api.post('/expenses', data)
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data)
export const deleteExpense = (id) => api.delete(`/expenses/${id}`)
export const getExpenseCategories = () => api.get('/expense-categories')
export const createExpenseCategory = (data) => api.post('/expense-categories', data)
