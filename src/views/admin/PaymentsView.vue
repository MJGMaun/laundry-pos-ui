<script setup>
import { ref, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { getAllPayments, deletePayment } from '@/api/payments.js'

const toast       = useToast()
const confirm     = useConfirm()
const branchStore = useBranchStore()
const authStore   = useAuthStore()

const range   = ref([new Date(), new Date()]) // [from, to]
const method  = ref('')                        // '' | 'cash' | 'gcash'
const query   = ref('')
const page    = ref(1)
const data    = ref(null)
const loading = ref(false)
let searchTimer = null

const presets = [
  { label: 'Today',      range: () => [new Date(), new Date()] },
  { label: 'Yesterday',  range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [d, new Date(d)] } },
  { label: '7 days',     range: () => { const d = new Date(); d.setDate(d.getDate() - 6); return [d, new Date()] } },
  { label: 'This month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n] } },
]

function localYMD(d) {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function fromStr() { return range.value?.[0] ? localYMD(range.value[0]) : localYMD(new Date()) }
function toStr()   { return range.value?.[1] ? localYMD(range.value[1]) : fromStr() }

function applyPreset(p) { range.value = p.range() }
function presetActive(p) {
  const [f, t] = p.range()
  return fromStr() === localYMD(f) && toStr() === localYMD(t)
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtWhen(d) {
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

async function load() {
  if (authStore.isSuperAdmin && !branchStore.currentBranchId) return
  if (range.value?.[0] && range.value?.[1] === null) return // mid-pick
  loading.value = true
  try {
    const res = await getAllPayments({
      date_from: fromStr(),
      date_to: toStr(),
      ...(method.value ? { method: method.value } : {}),
      ...(query.value.trim() ? { q: query.value.trim() } : {}),
      page: page.value,
    })
    data.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load payments', life: 3000 })
  } finally {
    loading.value = false
  }
}

function reload() { page.value = 1; load() }

function confirmDelete(p) {
  confirm.require({
    message: `Delete this ₱${fmt(p.amount)} ${p.method === 'gcash' ? 'GCash' : 'cash'} ${p.type} on ${p.order_number}? Reports, cash balance, and the customer's total spent will be updated.`,
    header: 'Delete payment',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deletePayment(p.id)
        toast.add({ severity: 'success', summary: 'Payment deleted', life: 2500 })
        load()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete payment', life: 4000 })
      }
    },
  })
}

watch(range, reload, { deep: true })
watch(method, reload)
watch(query, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 350)
})
watch(page, load)
watch(() => branchStore.currentBranchId, (id) => {
  if (authStore.isSuperAdmin) {
    data.value = null
    if (id) reload()
  }
})

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-4xl mx-auto">

    <!-- Header -->
    <div class="flex items-center gap-3 mb-5">
      <h1 class="text-xl font-bold text-gray-900">Payments</h1>
      <span v-if="branchStore.currentBranch" class="text-sm text-gray-400">
        — {{ branchStore.currentBranch.name }}
      </span>
    </div>

    <!-- Super admin: no branch selected -->
    <div
      v-if="authStore.isSuperAdmin && !branchStore.currentBranchId"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <div class="text-4xl mb-3">🏪</div>
      <div class="text-base font-semibold text-gray-700 mb-1">Select a branch first</div>
      <div class="text-sm text-gray-400">Use the branch selector in the top bar to choose a branch.</div>
    </div>

    <template v-else>
      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <DatePicker
          v-model="range"
          selection-mode="range"
          :manual-input="false"
          date-format="M dd"
          show-icon
          icon-display="input"
          placeholder="Select date or range"
          class="pay-datepicker"
        />
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="p in presets"
            :key="p.label"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="presetActive(p)
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'"
            @click="applyPreset(p)"
          >{{ p.label }}</button>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            v-for="m in [{ v: '', l: 'All' }, { v: 'cash', l: '💵 Cash' }, { v: 'gcash', l: '📱 GCash' }]"
            :key="m.v"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="method === m.v
              ? 'bg-slate-800 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'"
            @click="method = m.v"
          >{{ m.l }}</button>
        </div>
        <input
          v-model="query"
          placeholder="Search order # or customer…"
          class="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>

      <!-- Summary tiles -->
      <div v-if="data" class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Collected</div>
          <div class="text-lg font-bold text-green-700">₱{{ fmt(data.summary?.total_paid) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Refunds</div>
          <div class="text-lg font-bold text-red-600">−₱{{ fmt(data.summary?.total_refunds) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Net</div>
          <div class="text-lg font-bold text-gray-900">₱{{ fmt(data.summary?.net) }}</div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading && !data" class="text-center py-16 text-gray-400">Loading…</div>

      <!-- List -->
      <div v-if="data" class="bg-white rounded-xl border border-gray-200 overflow-hidden" :class="loading ? 'opacity-60' : ''">
        <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900">🧾 Payments</h3>
          <span class="text-xs text-gray-400">{{ data.total }} payment{{ data.total !== 1 ? 's' : '' }}</span>
        </div>

        <div v-if="!(data.data && data.data.length)" class="px-5 py-10 text-center text-sm text-gray-400">
          No payments found for these filters.
        </div>

        <div v-else class="divide-y divide-gray-50">
          <div
            v-for="p in data.data"
            :key="p.id"
            class="flex items-center justify-between gap-3 px-5 py-3"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-800 truncate">{{ p.customer_name || 'Walk-in' }}</div>
              <div class="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                <RouterLink :to="`/orders/${p.order_id}`" class="font-mono text-blue-500 hover:text-blue-700 hover:underline">
                  {{ p.order_number }}
                </RouterLink>
                <span>·</span>
                <span>{{ fmtWhen(p.created_at) }}</span>
                <span v-if="p.reference_number">· ref {{ p.reference_number }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                :style="p.method === 'gcash' ? 'background:#005eaa' : 'background:#16a34a'"
              >{{ p.method === 'gcash' ? 'GCash' : p.method?.toUpperCase() }}</span>
              <span
                class="text-sm font-semibold tabular-nums"
                :class="p.type === 'refund' ? 'text-red-600' : 'text-gray-900'"
              >{{ p.type === 'refund' ? '−' : '' }}₱{{ fmt(p.amount) }}</span>
              <button
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-xs text-red-500 hover:bg-red-100 transition-all active:scale-95"
                title="Delete payment"
                @click="confirmDelete(p)"
              >✕</button>
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
    </template>

  </div>
</template>

<style>
.pay-datepicker .p-datepicker-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 14px;
  color: #111827;
  width: 210px;
}
.pay-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
