<script setup>
import { ref, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { getDeletedRecords } from '@/api/deletedRecords.js'

const toast   = useToast()
const type    = ref('payments')
const page    = ref(1)
const data    = ref(null)
const loading = ref(false)

const tabs = [
  { value: 'payments',  label: '💳 Payments' },
  { value: 'orders',    label: '📋 Orders' },
  { value: 'expenses',  label: '💸 Expenses' },
  { value: 'customers', label: '👥 Customers' },
  { value: 'services',  label: '🧺 Services' },
  { value: 'machines',  label: '🔄 Machines' },
]

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtWhen(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

// One display line per record type, so the list template stays generic.
function title(r) {
  switch (type.value) {
    case 'payments':  return `${r.customer_name || 'Walk-in'} — ${r.method === 'gcash' ? 'GCash' : 'Cash'} ${r.type}`
    case 'orders':    return `${r.order_number} — ${r.customer_name || 'Walk-in'}`
    case 'expenses':  return r.description || r.category_name || 'Expense'
    case 'customers': return `${r.name}${r.phone ? ' · ' + r.phone : ''}`
    case 'services':  return `${r.name}${r.category_name ? ' · ' + r.category_name : ''}`
    case 'machines':  return `${r.name} (${r.type})`
    default:          return ''
  }
}
function subtitle(r) {
  switch (type.value) {
    case 'payments': return r.order_number
    case 'orders':   return `status: ${r.status}`
    case 'expenses': return [r.category_name, r.expense_date].filter(Boolean).join(' · ')
    default:         return ''
  }
}
function hasAmount() {
  return ['payments', 'orders', 'expenses', 'customers', 'services'].includes(type.value)
}
function amountLabel() {
  return { payments: '', orders: 'total', expenses: '', customers: 'spent', services: 'price' }[type.value] || ''
}

async function load() {
  loading.value = true
  try {
    const res = await getDeletedRecords({ type: type.value, page: page.value })
    data.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load deleted records', life: 3000 })
  } finally {
    loading.value = false
  }
}

watch(type, () => { page.value = 1; data.value = null; load() })
watch(page, load)
onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-4xl mx-auto">

    <!-- Header -->
    <div class="mb-1 flex items-center gap-3">
      <h1 class="text-xl font-bold text-gray-900">Deleted Records</h1>
    </div>
    <p class="text-sm text-gray-400 mb-5">Audit log of soft-deleted data across all branches. View-only — nothing here is removed from the database.</p>

    <!-- Type tabs -->
    <div class="flex flex-wrap items-center gap-1.5 mb-4">
      <button
        v-for="t in tabs"
        :key="t.value"
        class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
        :class="type === t.value
          ? 'bg-slate-800 text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'"
        @click="type = t.value"
      >{{ t.label }}</button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !data" class="text-center py-16 text-gray-400">Loading…</div>

    <!-- List -->
    <div v-if="data" class="bg-white rounded-xl border border-gray-200 overflow-hidden" :class="loading ? 'opacity-60' : ''">
      <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-semibold text-gray-900">🗑️ {{ tabs.find(t => t.value === type)?.label.replace(/^\S+\s/, '') }}</h3>
        <span class="text-xs text-gray-400">{{ data.total }} deleted record{{ data.total !== 1 ? 's' : '' }}</span>
      </div>

      <div v-if="!(data.data && data.data.length)" class="px-5 py-10 text-center text-sm text-gray-400">
        No deleted {{ type }} found. 🎉
      </div>

      <div v-else class="divide-y divide-gray-50">
        <div
          v-for="r in data.data"
          :key="r.id"
          class="flex items-center justify-between gap-3 px-5 py-3"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate">{{ title(r) }}</div>
            <div class="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
              <span v-if="r.branch_name" class="font-medium text-gray-500">{{ r.branch_name }}</span>
              <template v-if="subtitle(r)">
                <span v-if="r.branch_name">·</span>
                <span class="font-mono">{{ subtitle(r) }}</span>
              </template>
              <span v-if="r.created_at">· created {{ fmtWhen(r.created_at) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0 text-right">
            <div v-if="hasAmount()" class="text-sm font-semibold tabular-nums text-gray-900">
              ₱{{ fmt(r.amount) }}<span v-if="amountLabel()" class="ml-1 text-[10px] font-normal text-gray-400">{{ amountLabel() }}</span>
            </div>
            <div class="text-xs text-red-500 font-medium whitespace-nowrap text-right">
              deleted {{ fmtWhen(r.deleted_at) }}
              <div v-if="r.deleted_by_name" class="text-gray-500 font-semibold">by {{ r.deleted_by_name }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="data.last_page > 1" class="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
          :disabled="page <= 1"
          @click="page--"
        >← Prev</button>
        <span class="text-xs text-gray-400">Page {{ data.current_page }} of {{ data.last_page }}</span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
          :disabled="page >= data.last_page"
          @click="page++"
        >Next →</button>
      </div>
    </div>

  </div>
</template>
