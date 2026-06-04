import api from './index.js'

export const getBookings = (params) => api.get('/bookings', { params })
export const createBooking = (data) => api.post('/bookings', data)
export const updateBooking = (id, data) => api.put(`/bookings/${id}`, data)
export const cancelBooking = (id) => api.delete(`/bookings/${id}`)
export const markBookingPickedUp = (id) => api.patch(`/bookings/${id}/pickup`)
