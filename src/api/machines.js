import api from './index.js'

export const getMachines       = ()         => api.get('/machines')
export const createMachine     = (data)     => api.post('/machines', data)
export const updateMachine     = (id, data) => api.put(`/machines/${id}`, data)
export const deleteMachine     = (id)       => api.delete(`/machines/${id}`)
export const getMachineCycles  = (date)     => api.get('/machine-cycles', { params: { date } })
export const saveMachineCycles = (data)     => api.post('/machine-cycles', data)
