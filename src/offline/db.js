import Dexie from 'dexie'

export const db = new Dexie('laundry-pos-offline')
db.version(1).stores({
  queue: '++id, status, createdAt',
})
db.version(2).stores({
  queue:     '++id, status, createdAt',
  services:  'id, branch_id',
  customers: 'id, branch_id, name, phone',
  sync_meta: 'key',
})
