import api from './index.js'

export const getCashBalance  = (date)       => api.get('/cash-balance', { params: { date } })
export const setCashBalance  = (data)       => api.post('/cash-balance', data)
