import api from '@/api/index.js'
import { db } from './db.js'

async function getLastSynced(key) {
  const meta = await db.sync_meta.get(key)
  return meta?.value ?? null
}

async function setLastSynced(key) {
  await db.sync_meta.put({ key, value: new Date().toISOString() })
}

async function pullServices() {
  const res = await api.get('/services', { params: { active: 1 } })
  const services = res.data.data ?? res.data
  await db.transaction('rw', db.services, async () => {
    await db.services.clear()
    await db.services.bulkPut(services)
  })
  await setLastSynced('services')
}

async function pullServiceCategories() {
  const res = await api.get('/service-categories')
  const cats = res.data.data ?? res.data
  await db.transaction('rw', db.service_categories, async () => {
    await db.service_categories.clear()
    await db.service_categories.bulkPut(cats)
  })
  await setLastSynced('service_categories')
}

async function pullOrders() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const res = await api.get('/orders', { params: { date_from: since, per_page: 500 } })
  const orders = res.data.data ?? res.data
  if (orders.length > 0) {
    await db.orders.bulkPut(orders)
  }
  await setLastSynced('orders')
}

async function pullCustomers() {
  const lastSynced = await getLastSynced('customers')
  const params = { per_page: 500 }
  if (lastSynced) params.updated_after = lastSynced

  const res = await api.get('/customers', { params })
  const customers = res.data.data ?? res.data
  if (customers.length > 0) {
    await db.customers.bulkPut(customers)
  }
  await setLastSynced('customers')
}

async function pullSettings() {
  const res = await api.get('/settings')
  const settings = res.data.settings ?? []
  // Store as flat {key, value} pairs — branch-merged values already resolved by API
  const rows = settings.map(s => ({ key: s.key, value: s.value, group: s.group }))
  await db.transaction('rw', db.settings, async () => {
    await db.settings.clear()
    await db.settings.bulkPut(rows)
  })
  await setLastSynced('settings')
}

export async function runPull() {
  await Promise.all([
    pullServices().catch(() => {}),
    pullServiceCategories().catch(() => {}),
    pullCustomers().catch(() => {}),
    pullOrders().catch(() => {}),
    pullSettings().catch(() => {}),
  ])
}

/** Read a single setting value from local IndexedDB */
export async function getOfflineSetting(key) {
  const row = await db.settings.get(key)
  return row?.value ?? null
}
