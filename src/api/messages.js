import api from './index.js'

export const getConversations = () => api.get('/messages/conversations')
export const getThread = (id) => api.get(`/messages/conversations/${id}`)
export const sendMessage = (id, body) => api.post(`/messages/conversations/${id}/messages`, { body })
export const startDirect = (username) => api.post('/messages/direct', { username })
export const searchChatUsers = (q) => api.get('/messages/users/search', { params: { q } })
export const getUnreadCount = () => api.get('/messages/unread-count')
