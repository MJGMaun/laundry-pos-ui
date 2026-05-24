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
  const res = await api.get('/services', { params: { active: true } })
  const services = res.data
  await db.transaction('rw', db.services, async () => {
    await db.services.clear()
    await db.services.bulkPut(services)
  })
  await setLastSynced('services')
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
    pullServices(),
    pullCustomers(),
    pullSettings().catch(() => {}), // silently skip if role doesn't allow (e.g. cashier 403)
  ])
}

/** Read a single setting value from local IndexedDB */
export async function getOfflineSetting(key) {
  const row = await db.settings.get(key)
  return row?.value ?? null
}
