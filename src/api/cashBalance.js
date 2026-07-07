import api from './index.js'

// params: { date } for a single day, or { date_from, date_to } for a range
export const getCashBalance  = (params)     => api.get('/cash-balance', { params })
export const setCashBalance  = (data)       => api.post('/cash-balance', data)
