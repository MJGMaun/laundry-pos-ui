import api from '@/api/index.js'
import { db } from './db.js'

export async function runSync() {
  const items = await db.queue.where('status').equals('pending').sortBy('createdAt')
  let synced = 0

  for (const item of items) {
    try {
      const cfg = {
        skipBranchId: true,
        headers: item.branchId ? { 'X-Branch-Id': item.branchId } : {},
      }

      if (item.type === 'order_with_payments') {
        const orderRes = await api.post('/orders', item.orderData, cfg)
        const orderId = orderRes.data.data?.id ?? orderRes.data?.id
        for (const p of item.payments) {
          await api.post(`/orders/${orderId}/payments`, p, cfg)
        }
      } else {
        await api.request({ method: item.method, url: item.url, data: item.data, ...cfg })
      }

      await db.queue.delete(item.id)
      synced++
    } catch (e) {
      await db.queue.update(item.id, {
        status: 'failed',
        retries: (item.retries || 0) + 1,
        lastError: e.message,
      })
    }
  }

  return synced
}
