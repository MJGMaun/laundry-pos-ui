<script setup>
import { ref, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { getCashBalance, setCashBalance } from '@/api/cashBalance.js'

const toast       = useToast()
const branchStore = useBranchStore()
const authStore   = useAuthStore()

const cashRange    = ref([new Date(), new Date()]) // [from, to] — same day = single-day drawer view
const cashData     = ref(null)
const cashLoading  = ref(false)
const editingStart = ref(false)
const startInput   = ref('')
const savingStart  = ref(false)

const presets = [
  { label: 'Today',     range: () => [new Date(), new Date()] },
  { label: 'Yesterday', range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [d, new Date(d)] } },
  { label: '7 days',    range: () => { const d = new Date(); d.setDate(d.getDate() - 6); return [d, new Date()] } },
  { label: 'This month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n] } },
]

function applyPreset(p) {
  cashRange.value = p.range()
}

function presetActive(p) {
  const [f, t] = p.range()
  return fromStr() === localYMD(f) && toStr() === localYMD(t)
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function localYMD(d) {
    const date = new Date(d)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fromStr() {
  return cashRange.value?.[0] ? localYMD(cashRange.value[0]) : localYMD(new Date())
}

function toStr() {
  // While picking a range the second date is null — treat as single day.
  return cashRange.value?.[1] ? localYMD(cashRange.value[1]) : fromStr()
}

async function load() {
  // super_admin must have a branch selected
  if (authStore.isSuperAdmin && !branchStore.currentBranchId) return
  // Wait until the range picker has both ends (it emits [from, null] mid-pick).
  if (cashRange.value?.[0] && cashRange.value?.[1] === null) return
  cashLoading.value = true
  cashData.value = null
  try {
    const res = await getCashBalance({ date_from: fromStr(), date_to: toStr() })
    cashData.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load', life: 3000 })
  } finally {
    cashLoading.value = false
  }
}

function openEditStart() {
  startInput.value = cashData.value?.starting_balance ?? 0
  editingStart.value = true
}

async function saveStartingBalance() {
  if (startInput.value === '' || Number(startInput.value) < 0) return
  savingStart.value = true
  try {
    const res = await setCashBalance({ date: fromStr(), starting_balance: Number(startInput.value) })
    cashData.value = res.data
    editingStart.value = false
    toast.add({ severity: 'success', summary: 'Starting balance saved', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    savingStart.value = false
  }
}

// Reload when the range changes (deep — the picker mutates the array)
watch(cashRange, load, { deep: true })

// Reload when super_admin switches branch
watch(() => branchStore.currentBranchId, (id) => {
  if (authStore.isSuperAdmin) {
    cashData.value = null
    if (id) load()
  }
})

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-3xl mx-auto">

    <!-- Header -->
    <div class="flex items-center gap-3 mb-5">
      <h1 class="text-xl font-bold text-gray-900">Cash Balance</h1>
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
      <!-- Date range picker -->
      <div class="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <span class="text-sm text-gray-500 font-medium">Date</span>
        <DatePicker
          v-model="cashRange"
          selection-mode="range"
          :manual-input="false"
          date-format="M dd"
          show-icon
          icon-display="input"
          placeholder="Select date or range"
          class="cash-datepicker cash-datepicker-range"
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
      </div>

      <!-- Loading -->
      <div v-if="cashLoading" class="text-center py-16 text-gray-400">Loading…</div>

      <div v-else-if="cashData" class="space-y-4">

        <!-- Range summary note -->
        <div v-if="cashData.is_range" class="flex items-center gap-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          📊 Totals for {{ fmtDate(cashData.date_from) }} – {{ fmtDate(cashData.date_to) }}. Starting float and drawer total are per-day, so they're hidden for ranges.
        </div>

        <!-- Starting balance card (single day only — the float is per-day) -->
        <div v-if="!cashData.is_range" class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-semibold text-gray-600">Starting Balance (float)</span>
            <button
              v-if="!editingStart"
              class="text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
              @click="openEditStart"
            >{{ cashData.starting_balance > 0 ? 'Edit' : 'Set' }}</button>
          </div>
          <div v-if="!editingStart" class="text-2xl font-bold text-gray-900">₱{{ fmt(cashData.starting_balance) }}</div>
          <div v-if="cashData.set_by && !editingStart" class="text-xs text-gray-400 mt-1">Set by {{ cashData.set_by }}</div>

          <!-- Inline edit -->
          <div v-if="editingStart" class="flex items-center gap-2 mt-2">
            <div class="relative flex-1">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
              <input
                v-model="startInput"
                type="number" min="0" step="1"
                class="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                autofocus
                @keyup.enter="saveStartingBalance"
                @keyup.escape="editingStart = false"
              />
            </div>
            <button
              class="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
              :disabled="savingStart"
              @click="saveStartingBalance"
            >{{ savingStart ? 'Saving…' : 'Save' }}</button>
            <button
              class="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all"
              @click="editingStart = false"
            >Cancel</button>
          </div>
        </div>

        <!-- Cash section -->
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-base">💵</span>
            <h3 class="font-semibold text-gray-900">Cash</h3>
          </div>
          <div class="divide-y divide-gray-50">
            <div class="flex items-center justify-between px-5 py-3">
              <div class="text-sm text-gray-600">Cash payments in <span class="text-xs text-gray-400">(net of refunds)</span></div>
              <span class="font-semibold text-green-700">+₱{{ fmt(cashData.cash_in) }}</span>
            </div>
            <div class="flex items-center justify-between px-5 py-3">
              <div class="text-sm text-gray-600">Expenses</div>
              <span class="font-semibold text-red-600">−₱{{ fmt(cashData.expenses) }}</span>
            </div>
            <div class="flex items-center justify-between px-5 py-3 bg-gray-50">
              <div class="text-sm font-medium text-gray-700">{{ cashData.is_range ? 'Net Cash' : 'Total in Drawer' }}</div>
              <span class="font-bold text-gray-900">₱{{ fmt(cashData.is_range ? cashData.to_remit_cash : cashData.total_in_drawer) }}</span>
            </div>
          </div>
        </div>

        <!-- GCash section -->
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-base">📱</span>
            <h3 class="font-semibold text-gray-900">GCash</h3>
          </div>
          <div class="divide-y divide-gray-50">
            <div class="flex items-center justify-between px-5 py-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded-md text-white" style="background: #005eaa;">GCash</span>
                <span class="text-xs text-gray-400">net of refunds</span>
              </div>
              <span class="font-semibold" :class="cashData.gcash_in > 0 ? 'text-green-700' : 'text-gray-400'">
                +₱{{ fmt(cashData.gcash_in) }}
              </span>
            </div>
            <div v-if="cashData.gcash_expenses > 0" class="flex items-center justify-between px-5 py-3">
              <div class="text-sm text-gray-600">GCash Expenses</div>
              <span class="font-semibold text-red-600">−₱{{ fmt(cashData.gcash_expenses) }}</span>
            </div>
          </div>
        </div>

        <!-- To Remit summary -->
        <div class="grid sm:grid-cols-2 gap-4">
          <div
            class="rounded-xl border p-5"
            :class="cashData.to_remit_cash >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'"
          >
            <div class="text-xs font-semibold mb-1" :class="cashData.to_remit_cash >= 0 ? 'text-green-700' : 'text-red-700'">
              💵 To Remit (Cash)
            </div>
            <div class="text-2xl font-bold" :class="cashData.to_remit_cash >= 0 ? 'text-green-800' : 'text-red-700'">
              {{ cashData.to_remit_cash < 0 ? '-' : '' }}₱{{ fmt(Math.abs(cashData.to_remit_cash)) }}
            </div>
            <div class="text-xs mt-1" :class="cashData.to_remit_cash >= 0 ? 'text-green-600' : 'text-red-500'">
              {{ cashData.is_range ? 'Cash payments minus cash expenses' : 'Drawer total minus starting float' }}
            </div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div class="text-xs font-semibold text-blue-700 mb-1">📱 To Remit (GCash)</div>
            <div class="text-2xl font-bold text-blue-900">{{ cashData.to_remit_gcash < 0 ? '-' : '' }}₱{{ fmt(Math.abs(cashData.to_remit_gcash)) }}</div>
            <div class="text-xs text-blue-500 mt-1">GCash payments minus GCash expenses</div>
          </div>
        </div>

        <!-- Unpaid orders: orders made in this range that still owe money -->
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">⚠️</span>
              <h3 class="font-semibold text-gray-900">Not Yet Paid</h3>
            </div>
            <span v-if="(cashData.unpaid || []).length" class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              ₱{{ fmt(cashData.unpaid_total) }} outstanding
            </span>
            <span v-else class="text-xs text-gray-400">All paid 🎉</span>
          </div>

          <div v-if="!(cashData.unpaid && cashData.unpaid.length)" class="px-5 py-6 text-center text-sm text-gray-400">
            Every order {{ cashData.is_range ? 'in this range' : 'on this date' }} is fully paid.
          </div>

          <div v-else class="divide-y divide-gray-50">
            <div
              v-for="o in cashData.unpaid"
              :key="o.order_id"
              class="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-800 truncate">{{ o.customer_name || 'Walk-in' }}</div>
                <div class="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                  <RouterLink :to="`/orders/${o.order_id}`" class="font-mono text-blue-500 hover:text-blue-700 hover:underline">
                    {{ o.order_number }}
                  </RouterLink>
                  <span v-if="cashData.is_range">· made {{ fmtDate(o.created_at) }}</span>
                  <span>· paid ₱{{ fmt(o.net_paid) }} of ₱{{ fmt(o.total_amount) }}</span>
                </div>
              </div>
              <span class="text-sm font-bold tabular-nums text-amber-700 shrink-0">₱{{ fmt(o.balance_due) }} due</span>
            </div>
          </div>
        </div>

		<!-- Payments today (what makes up the totals) -->
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">🧾</span>
              <h3 class="font-semibold text-gray-900">{{ cashData.is_range ? `Payments (${fmtDate(cashData.date_from)} – ${fmtDate(cashData.date_to)})` : 'Payments This Day' }}</h3>
            </div>
            <span class="text-xs text-gray-400">{{ (cashData.payments || []).length }} payment{{ (cashData.payments || []).length !== 1 ? 's' : '' }}</span>
          </div>

          <div v-if="!(cashData.payments && cashData.payments.length)" class="px-5 py-8 text-center text-sm text-gray-400">
            No payments recorded {{ cashData.is_range ? 'in this range' : 'on this date' }}.
          </div>

          <div v-else class="divide-y divide-gray-50">
            <div
              v-for="p in cashData.payments"
              :key="p.id"
              class="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-800 truncate">
                  {{ p.customer_name || 'Walk-in' }}
                </div>
                <div class="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                  <span class="font-mono">{{ p.order_number }}</span>
                  <span v-if="p.order_created_at">·</span>
                  <span v-if="p.order_created_at">made {{ fmtDate(p.order_created_at) }}</span>
                  <span>·</span>
                  <span>paid {{ cashData.is_range ? fmtDate(p.created_at) + ' ' : '' }}{{ fmtTime(p.created_at) }}</span>
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
              </div>
            </div>
          </div>
        </div>

      </div>
    </template>

  </div>
</template>

<style>
.cash-datepicker .p-datepicker-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 14px;
  color: #111827;
  width: 150px;
}
.cash-datepicker-range .p-datepicker-input {
  width: 210px;
}
.cash-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
