import api from './index.js'

export const getPayments = (orderId) => api.get(`/orders/${orderId}/payments`)

// A GCash receipt photo (data.receipt: File/Blob) goes up as multipart;
// everything else stays JSON.
export const createPayment = (orderId, data) => {
  if (!(data?.receipt instanceof Blob)) {
    const { receipt, ...rest } = data || {}
    return api.post(`/orders/${orderId}/payments`, rest)
  }
  const form = new FormData()
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || v === '') continue
    if (k === 'receipt') form.append('receipt', v, v.name || 'receipt.jpg')
    else form.append(k, v)
  }
  return api.post(`/orders/${orderId}/payments`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// admin-only: cross-order payment list + delete + method correction
export const getAllPayments = (params) => api.get('/payments', { params })
export const deletePayment = (id) => api.delete(`/payments/${id}`)
export const changePaymentMethod = (id, data) => api.patch(`/payments/${id}/method`, data)

// GCash receipt photo, fetched with auth as a blob (no public URL)
export const getPaymentReceipt = (id) => api.get(`/payments/${id}/receipt`, { responseType: 'blob' })

// super-admin: GCash reconciliation
export const getGcashMatching = (params) => api.get('/gcash-matching', { params })
export const setPaymentMatched = (id, matched) => api.patch(`/payments/${id}/matched`, { matched })

// super-admin: end-of-day account check (GCash app balance vs expected)
export const getAccountChecks = (method = 'gcash') => api.get('/account-checks', { params: { method } })
export const createAccountCheck = (data) => api.post('/account-checks', data)
export const deleteAccountCheck = (id) => api.delete(`/account-checks/${id}`)

// admin: add or correct the tip on an existing payment
export const updatePaymentTip = (id, tip_amount) => api.patch(`/payments/${id}/tip`, { tip_amount })
