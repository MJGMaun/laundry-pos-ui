import api from './index.js'

// params: { as_of } — defaults to today on the server
export const getAccounts           = (params) => api.get('/accounts', { params })
export const createAccountMovement = (data)   => api.post('/account-movements', data)
export const deleteAccountMovement = (id)     => api.delete(`/account-movements/${id}`)
