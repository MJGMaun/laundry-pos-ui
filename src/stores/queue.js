import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/offline/db.js'
import { runSync } from '@/offline/sync.js'

export const useQueueStore = defineStore('queue', () => {
  const pendingCount = ref(0)

  async function refresh() {
    pendingCount.value = await db.queue.where('status').equals('pending').count()
  }

  async function enqueueOrder(orderData, payments, branchId, displayOrder = null) {
    const offlineId = displayOrder?.id ?? null
    await db.queue.add({
      type: 'order_with_payments',
      orderData,
      payments,
      branchId: branchId ?? localStorage.getItem('branch_id'),
      createdAt: Date.now(),
      status: 'pending',
      retries: 0,
      lastError: null,
      offline_order_id: offlineId,
    })
    if (displayOrder) {
      await db.orders.put({ ...displayOrder, _offline: true })
    }
    await refresh()
  }

  /**
   * Queue a new-customer POST that was made while offline.
   * tempId is the local placeholder id (e.g. 'offline_<timestamp>') stored in
   * IndexedDB so the customer is immediately searchable on the POS screen.
   * sync.js resolves the real server id and patches any dependent order in the queue.
   */
  async function enqueueCustomer(customerData, tempId, branchId) {
    await db.queue.add({
      type: 'create_customer',
      data: customerData,
      tempId,
      branchId: branchId ?? localStorage.getItem('branch_id'),
      createdAt: Date.now(),
      status: 'pending',
      retries: 0,
      lastError: null,
    })
    await refresh()
  }

  async function enqueueRequest(method, url, data, branchId) {
    await db.queue.add({
      type: 'request',
      method,
      url,
      data,
      branchId: branchId ?? localStorage.getItem('branch_id'),
      createdAt: Date.now(),
      status: 'pending',
      retries: 0,
      lastError: null,
    })
    await refresh()
  }

  async function sync() {
    // Reset failed items so they get retried
    await db.queue.where('status').equals('failed').modify({ status: 'pending' })
    return await runSync()
  }

  return { pendingCount, refresh, enqueueOrder, enqueueCustomer, enqueueRequest, sync }
})
