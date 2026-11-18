<script setup>
// GCash Matching (super admin): tick each GCash payment recorded in the POS
// off against the GCash app's transaction history. What stays unticked is the
// gap to chase; a GCash entry that was really cash can be switched right here.
import { ref, computed, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { useBranchStore } from '@/stores/branch.js'
import { getGcashMatching, setPaymentMatched } from '@/api/payments.js'
import PaymentReceiptButton from '@/components/common/PaymentReceiptButton.vue'
import ChangePaymentMethodDialog from '@/components/common/ChangePaymentMethodDialog.vue'

const toast       = useToast()
const router      = useRouter()
const branchStore = useBranchStore()

const range   = ref([new Date(), new Date()])
const status  = ref('all') // all | unmatched | matched
const data    = ref(null)
const loading = ref(false)
const busyId  = ref(null)

const showMethodDialog = ref(false)
const methodTarget     = ref(null)

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
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}
function hasProof(p) {
  return String(p.reference_number || '').trim().length >= 4 || p.has_receipt
}

const allBranches = computed(() => !branchStore.currentBranchId)
const summary = computed(() => data.value?.summary || {})

async function load() {
  if (range.value?.[0] && range.value?.[1] === null) return // mid-pick
  loading.value = true
  try {
    const res = await getGcashMatching({ date_from: fromStr(), date_to: toStr(), status: status.value })
    data.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load GCash payments', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function toggleMatched(p) {
  busyId.value = p.id
  try {
    await setPaymentMatched(p.id, !p.matched_at)
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to update', life: 3000 })
  } finally {
    busyId.value = null
  }
}

function openChangeMethod(p) {
  methodTarget.value = { ...p }
  showMethodDialog.value = true
}

watch(range, load, { deep: true })
watch(status, load)
watch(() => branchStore.currentBranchId, load)
onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-5xl mx-auto">
    <div class="flex items-center gap-3 mb-1">
      <h1 class="text-xl font-bold text-gray-900">GCash Matching</h1>
      <span class="text-sm text-gray-400">— {{ branchStore.currentBranch?.name || 'All branches' }}</span>
    </div>
    <p class="text-sm text-gray-500 mb-4">
      Open the GCash app's transaction history and tick each payment you find there. Whatever stays unticked is what doesn't match.
    </p>

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
        class="gm-datepicker"
      />
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="p in presets"
          :key="p.label"
          class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
          :class="presetActive(p) ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'"
          @click="applyPreset(p)"
        >{{ p.label }}</button>
      </div>
      <div class="flex items-center gap-1 p-0.5 bg-gray-100 rounded-xl sm:ml-auto">
        <button
          v-for="s in [{ v: 'all', l: 'All' }, { v: 'unmatched', l: 'Not matched' }, { v: 'matched', l: 'Matched' }]"
          :key="s.v"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="status === s.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          @click="status = s.v"
        >{{ s.l }}</button>
      </div>
    </div>

    <div v-if="allBranches" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      Showing every branch. If each branch has its own GCash number, pick a branch in the top bar so the totals line up with one GCash account.
    </div>

    <!-- Summary -->
    <div v-if="data" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <div class="text-xs font-semibold text-gray-500">GCash in POS</div>
        <div class="text-xl font-bold text-gray-900 tabular-nums">₱{{ fmt(summary.total) }}</div>
        <div class="text-xs text-gray-400">{{ summary.count }} payment{{ summary.count !== 1 ? 's' : '' }}</div>
      </div>
      <div class="bg-green-50 rounded-xl border border-green-200 p-4">
        <div class="text-xs font-semibold text-green-700">Matched</div>
        <div class="text-xl font-bold text-green-800 tabular-nums">₱{{ fmt(summary.matched) }}</div>
        <div class="text-xs text-green-600">{{ summary.matched_count }} found in GCash</div>
      </div>
      <div class="rounded-xl border p-4" :class="summary.unmatched_count ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'">
        <div class="text-xs font-semibold" :class="summary.unmatched_count ? 'text-amber-700' : 'text-gray-500'">Not matched yet</div>
        <div class="text-xl font-bold tabular-nums" :class="summary.unmatched_count ? 'text-amber-800' : 'text-gray-900'">₱{{ fmt(summary.unmatched) }}</div>
        <div class="text-xs" :class="summary.unmatched_count ? 'text-amber-600' : 'text-gray-400'">{{ summary.unmatched_count }} to check</div>
      </div>
      <div class="rounded-xl border p-4" :class="summary.no_proof_count ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'">
        <div class="text-xs font-semibold" :class="summary.no_proof_count ? 'text-red-700' : 'text-gray-500'">No ref # or photo</div>
        <div class="text-xl font-bold" :class="summary.no_proof_count ? 'text-red-700' : 'text-gray-900'">{{ summary.no_proof_count }}</div>
        <div class="text-xs" :class="summary.no_proof_count ? 'text-red-500' : 'text-gray-400'">recorded before proof was required</div>
      </div>
    </div>

    <!-- Payments -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading && !data" class="py-16 text-center text-sm text-gray-400">Loading…</div>
      <div v-else-if="!data?.payments?.length" class="py-16 text-center text-sm text-gray-400">
        {{ status === 'unmatched' ? 'Everything is matched 🎉' : 'No GCash payments in this range.' }}
      </div>
      <div v-else class="divide-y divide-gray-100">
        <div
          v-for="p in data.payments"
          :key="p.id"
          class="flex items-center gap-3 px-4 py-3"
          :class="p.matched_at ? 'bg-green-50/40' : ''"
        >
          <button
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            :class="p.matched_at ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 bg-white text-transparent hover:border-green-400'"
            :disabled="busyId === p.id"
            :title="p.matched_at ? 'Unmark' : 'Found it in the GCash app'"
            @click="toggleMatched(p)"
          >✓</button>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-mono text-sm font-semibold tracking-wider" :class="p.reference_number ? 'text-gray-900' : 'text-gray-300'">
                {{ p.reference_number ? `Ref …${p.reference_number}` : 'No ref #' }}
              </span>
              <PaymentReceiptButton v-if="p.has_receipt" :payment-id="p.id" />
              <span v-if="!hasProof(p)" class="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">no proof</span>
              <span v-if="p.type === 'refund'" class="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">refund</span>
              <span v-if="p.method_changed_from" class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">was {{ p.method_changed_from }}</span>
            </div>
            <div class="mt-0.5 text-xs text-gray-500 truncate">
              {{ fmtWhen(p.created_at) }} ·
              <button class="font-mono text-blue-600 hover:underline" @click="router.push('/orders/' + p.order_id)">{{ p.order_number }}</button>
              · {{ p.customer_name || 'Walk-in' }}
              <template v-if="allBranches && p.branch_name"> · {{ p.branch_name }}</template>
            </div>
            <div v-if="p.matched_at" class="text-[11px] text-green-700">Matched by {{ p.matched_by_name || '—' }} · {{ fmtWhen(p.matched_at) }}</div>
          </div>

          <div class="shrink-0 text-right">
            <div class="font-bold tabular-nums" :class="p.type === 'refund' ? 'text-red-600' : 'text-gray-900'">
              {{ p.type === 'refund' ? '−' : '' }}₱{{ fmt(p.amount) }}
            </div>
            <button
              v-if="!p.matched_at"
              class="mt-0.5 text-[11px] font-semibold text-blue-600 hover:underline"
              title="It was really cash — move it to the cash account"
              @click="openChangeMethod(p)"
            >⇄ It was cash</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Corrected away from GCash -->
    <div v-if="data?.changed_away?.length" class="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100">
        <h3 class="text-sm font-semibold text-gray-900">Switched from GCash to cash</h3>
        <p class="text-xs text-gray-500">Recorded as GCash, then corrected. These no longer count toward GCash.</p>
      </div>
      <div class="divide-y divide-gray-100">
        <div v-for="p in data.changed_away" :key="p.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
          <div class="min-w-0 flex-1">
            <button class="font-mono text-xs text-blue-600 hover:underline" @click="router.push('/orders/' + p.order_id)">{{ p.order_number }}</button>
            <span class="text-xs text-gray-500"> · {{ p.customer_name || 'Walk-in' }} · {{ fmtWhen(p.created_at) }}</span>
            <div class="text-[11px] text-amber-700">Changed by {{ p.method_changed_by_name || '—' }} · {{ fmtWhen(p.method_changed_at) }}</div>
          </div>
          <span class="font-semibold tabular-nums text-gray-700">₱{{ fmt(p.amount) }}</span>
        </div>
      </div>
    </div>

    <ChangePaymentMethodDialog v-model:visible="showMethodDialog" :payment="methodTarget" @changed="load" />
  </div>
</template>

<style>
.gm-datepicker .p-datepicker-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 14px;
  color: #111827;
  width: 200px;
}
</style>
