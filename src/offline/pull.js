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

export async function runPull() {
  await Promise.all([pullServices(), pullCustomers()])
}
