<script setup>
import { ref, computed, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { getCashBalance } from '@/api/cashBalance.js'
import { getSettings } from '@/api/settings.js'
import { usePrinter } from '@/composables/usePrinter.js'
import { buildDaySummaryBytes } from '@/utils/escpos.js'

const toast       = useToast()
const branchStore = useBranchStore()
const authStore   = useAuthStore()
const printer     = usePrinter()

const date     = ref(new Date())
const data     = ref(null)
const settings = ref({})
const loading  = ref(false)
const printing = ref(false)

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function localYMD(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
function dateStr() {
  return date.value ? localYMD(date.value) : localYMD(new Date())
}
function fmtOrderDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''
}

const cashPayments  = computed(() => (data.value?.payments || []).filter((p) => p.method === 'cash'))
const gcashPayments = computed(() => (data.value?.payments || []).filter((p) => p.method === 'gcash'))

async function load() {
  if (authStore.isSuperAdmin && !branchStore.currentBranchId) return
  loading.value = true
  data.value = null
  try {
    const [cashRes, setRes] = await Promise.all([getCashBalance(dateStr()), getSettings()])
    data.value = cashRes.data
    const flat = {}
    ;(setRes.data.settings || []).forEach((s) => { flat[s.key] = s.value })
    settings.value = flat
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function connectAndPrint() {
  if (!data.value) return
  printing.value = true
  try {
    if (!printer.connected.value) {
      const ok = await printer.connect()
      if (!ok) {
        toast.add({ severity: 'error', summary: 'Printer', detail: 'Could not connect to printer', life: 4000 })
        return
      }
    }
    await printer.print(buildDaySummaryBytes({ ...data.value, date: dateStr() }, settings.value))
    toast.add({ severity: 'success', summary: 'Printed', detail: 'Summary sent to printer', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Print error', detail: e.message || 'Failed to print', life: 4000 })
  } finally {
    printing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-md mx-auto">
    <div class="flex items-center gap-3 mb-5">
      <h1 class="text-xl font-bold text-gray-900">Day Summary</h1>
      <span v-if="branchStore.currentBranch" class="text-sm text-gray-400">— {{ branchStore.currentBranch.name }}</span>
    </div>

    <div
      v-if="authStore.isSuperAdmin && !branchStore.currentBranchId"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <div class="text-4xl mb-3">🏪</div>
      <div class="text-base font-semibold text-gray-700 mb-1">Select a branch first</div>
      <div class="text-sm text-gray-400">Use the branch selector in the top bar.</div>
    </div>

    <template v-else>
      <!-- Date + print controls -->
      <div class="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <span class="text-sm text-gray-500 font-medium">Date</span>
        <DatePicker v-model="date" date-format="M dd, yy" show-icon icon-display="input" class="flex-1" @update:model-value="load" />
        <button
          class="text-sm font-bold text-white px-4 py-2 rounded-xl disabled:opacity-50 shrink-0"
          style="background: linear-gradient(135deg, #1d4ed8, #4f46e5);"
          :disabled="loading || !data || printing"
          @click="connectAndPrint"
        >
          <span v-if="printing">Printing…</span>
          <span v-else-if="printer.connected">🖨 Print</span>
          <span v-else>🔵 Connect &amp; Print</span>
        </button>
      </div>

      <div v-if="loading" class="text-center py-16 text-gray-400">Loading…</div>

      <!-- Paper-style preview -->
      <div v-else-if="data" class="bg-white rounded-xl border border-gray-200 p-5 font-mono text-[13px] text-gray-800 leading-relaxed">
        <div class="text-center font-bold text-sm">{{ settings.shop_name || 'Laundry Shop' }}</div>
        <div class="text-center font-bold">DAILY CASH SUMMARY</div>
        <div class="text-center text-gray-500 text-xs mb-2">
          {{ new Date(dateStr() + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }}
        </div>
        <div class="border-t border-dashed border-gray-300 my-2" />

        <div class="flex justify-between"><span>Starting Float</span><span>₱{{ fmt(data.starting_balance) }}</span></div>
        <div class="border-t border-dashed border-gray-300 my-2" />

        <!-- Cash -->
        <div class="font-bold">CASH</div>
        <div v-if="!cashPayments.length" class="text-gray-400 pl-2">(none)</div>
        <div v-for="p in cashPayments" :key="p.id" class="mb-1">
          <div class="flex justify-between">
            <span>{{ p.customer_name || 'Walk-in' }}</span>
            <span :class="p.type === 'refund' ? 'text-red-600' : ''">{{ p.type === 'refund' ? '−' : '' }}₱{{ fmt(p.amount) }}</span>
          </div>
          <div class="text-xs text-gray-400 pl-2">{{ p.order_number }} · {{ fmtOrderDate(p.order_created_at || p.created_at) }}</div>
        </div>
        <div v-if="data.cash_expenses > 0" class="flex justify-between text-red-600"><span>Cash Expenses</span><span>−₱{{ fmt(data.cash_expenses) }}</span></div>
        <div class="flex justify-between font-bold mt-1"><span>CASH TO REMIT</span><span>₱{{ fmt(data.to_remit_cash) }}</span></div>

        <div class="border-t border-dashed border-gray-300 my-2" />

        <!-- GCash -->
        <div class="font-bold">GCASH</div>
        <div v-if="!gcashPayments.length" class="text-gray-400 pl-2">(none)</div>
        <div v-for="p in gcashPayments" :key="p.id" class="mb-1">
          <div class="flex justify-between">
            <span>{{ p.customer_name || 'Walk-in' }}</span>
            <span :class="p.type === 'refund' ? 'text-red-600' : ''">{{ p.type === 'refund' ? '−' : '' }}₱{{ fmt(p.amount) }}</span>
          </div>
          <div class="text-xs text-gray-400 pl-2">{{ p.order_number }} · {{ fmtOrderDate(p.order_created_at || p.created_at) }}</div>
        </div>
        <div v-if="data.gcash_expenses > 0" class="flex justify-between text-red-600"><span>GCash Expenses</span><span>−₱{{ fmt(data.gcash_expenses) }}</span></div>
        <div class="flex justify-between font-bold mt-1"><span>GCASH TO REMIT</span><span>₱{{ fmt(data.to_remit_gcash) }}</span></div>

        <div class="border-t border-dashed border-gray-300 my-2" />
        <div class="flex justify-between"><span>Total in Drawer</span><span>₱{{ fmt(data.total_in_drawer) }}</span></div>
      </div>
    </template>
  </div>
</template>
