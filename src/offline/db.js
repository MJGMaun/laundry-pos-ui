import Dexie from 'dexie'

export const db = new Dexie('laundry-pos-offline')
db.version(1).stores({
  queue: '++id, status, createdAt',
})
