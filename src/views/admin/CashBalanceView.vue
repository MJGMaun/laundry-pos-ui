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

const cashDate     = ref(new Date())
const cashData     = ref(null)
const cashLoading  = ref(false)
const editingStart = ref(false)
const startInput   = ref('')
const savingStart  = ref(false)

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function localYMD(d) {
    const date = new Date(d)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function cashDateStr() {
    return cashDate.value ? localYMD(cashDate.value) : localYMD(new Date())
}

async function load() {
  // super_admin must have a branch selected
  if (authStore.isSuperAdmin && !branchStore.currentBranchId) return
  cashLoading.value = true
  cashData.value = null
  try {
    const res = await getCashBalance(cashDateStr())
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
    const res = await setCashBalance({ date: cashDateStr(), starting_balance: Number(startInput.value) })
    cashData.value = res.data
    editingStart.value = false
    toast.add({ severity: 'success', summary: 'Starting balance saved', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    savingStart.value = false
  }
}

// Reload when date changes
watch(cashDate, load)

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
      <!-- Date picker -->
      <div class="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <span class="text-sm text-gray-500 font-medium">Date</span>
        <DatePicker
          v-model="cashDate"
          date-format="M dd, yy"
          show-icon
          icon-display="input"
          placeholder="Select date"
          class="cash-datepicker"
          @update:model-value="load"
        />
      </div>

      <!-- Loading -->
      <div v-if="cashLoading" class="text-center py-16 text-gray-400">Loading…</div>

      <div v-else-if="cashData" class="space-y-4">

        <!-- Starting balance card -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
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
              <div class="text-sm font-medium text-gray-700">Total in Drawer</div>
              <span class="font-bold text-gray-900">₱{{ fmt(cashData.total_in_drawer) }}</span>
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
              Drawer total minus starting float
            </div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div class="text-xs font-semibold text-blue-700 mb-1">📱 To Remit (GCash)</div>
            <div class="text-2xl font-bold text-blue-900">{{ cashData.to_remit_gcash < 0 ? '-' : '' }}₱{{ fmt(Math.abs(cashData.to_remit_gcash)) }}</div>
            <div class="text-xs text-blue-500 mt-1">GCash payments minus GCash expenses</div>
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
.cash-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
