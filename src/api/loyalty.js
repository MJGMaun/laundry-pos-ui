import api from './index.js'

export const getLoyaltyRules   = ()           => api.get('/loyalty-rules')
export const createLoyaltyRule = (data)        => api.post('/loyalty-rules', data)
export const updateLoyaltyRule = (id, data)    => api.put(`/loyalty-rules/${id}`, data)
export const deleteLoyaltyRule = (id)          => api.delete(`/loyalty-rules/${id}`)

export const getCustomerLoyalty = (customerId) => api.get(`/customers/${customerId}/loyalty-rewards`)
export const redeemReward        = (rewardId, orderId) =>
  api.post(`/loyalty-rewards/${rewardId}/redeem`, { order_id: orderId })
