import api from './index.js'

const bc = (branchId) =>
  branchId ? { skipBranchId: true, headers: { 'X-Branch-Id': branchId } } : {}

export const getExpenses = (params, branchId = null) => api.get('/expenses', { params, ...bc(branchId) })
export const createExpense = (data, branchId = null) => api.post('/expenses', data, bc(branchId))
export const updateExpense = (id, data, branchId = null) => api.put(`/expenses/${id}`, data, bc(branchId))
export const deleteExpense = (id, branchId = null) => api.delete(`/expenses/${id}`, bc(branchId))
export const getExpenseCategories = () => api.get('/expense-categories')
export const createExpenseCategory = (data) => api.post('/expense-categories', data)
