import api from '@/api/index.js'
import { db } from './db.js'

export async function runSync() {
  const items = await db.queue.where('status').equals('pending').sortBy('createdAt')

  // Map of offline temp IDs → real server IDs, built as we process create_customer items.
  // Orders queued after an offline customer creation carry offline_customer_temp_id and
  // need this map to resolve the real customer_id before posting.
  const tempIdMap = {}

  let synced = 0

  for (const item of items) {
    try {
      const cfg = {
        skipBranchId: true,
        headers: item.branchId ? { 'X-Branch-Id': item.branchId } : {},
      }

      if (item.type === 'create_customer') {
        // ── Offline new customer ────────────────────────────────────────────
        const res = await api.post('/customers', item.data, cfg)
        const real = res.data.data || res.data
        // Remember the mapping so subsequent orders can use the real id
        tempIdMap[item.tempId] = real.id
        // Replace the temp record in local db with the real one
        await db.customers.delete(item.tempId)
        await db.customers.put(real)

      } else if (item.type === 'order_with_payments') {
        // ── Offline order (with optional offline-customer resolution) ───────
        const orderData = { ...item.orderData }

        if (orderData.offline_customer_temp_id) {
          // Resolve to real server id if we just created the customer above;
          // fall back to null (walk-in) if customer creation failed or wasn't queued
          orderData.customer_id = tempIdMap[orderData.offline_customer_temp_id] ?? null
          delete orderData.offline_customer_temp_id
        }

        const orderRes = await api.post('/orders', orderData, cfg)
        const orderId = orderRes.data.data?.id ?? orderRes.data?.id
        for (const p of item.payments) {
          await api.post(`/orders/${orderId}/payments`, p, cfg)
        }

      } else {
        // ── Generic queued request ──────────────────────────────────────────
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
