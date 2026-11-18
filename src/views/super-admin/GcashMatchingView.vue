<script setup>
// GCash Matching (super admin): tick each GCash payment recorded in the POS
// off against the GCash app's transaction history. What stays unticked is the
// gap to chase; a GCash entry that was really cash can be switched right here.
import { ref, computed, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useRouter } from 'vue-router'
import { useBranchStore } from '@/stores/branch.js'
import { useConfirm } from 'primevue/useconfirm'
import { getGcashMatching, setPaymentMatched, getAccountChecks, createAccountCheck, deleteAccountCheck } from '@/api/payments.js'
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
const confirm          = useConfirm()

// ── End-of-day GCash check ──
const checks       = ref(null)  // { expected, has_opening, checked_today, checks[] }
const countedInput = ref('')
const checkNote    = ref('')
const savingCheck  = ref(false)
const showHistory  = ref(false)

const lastCheck   = computed(() => checks.value?.checks?.[0] || null)
const previewDiff = computed(() =>
  countedInput.value === '' ? null : Math.round((Number(countedInput.value) - Number(checks.value?.expected || 0)) * 100) / 100
)

async function loadChecks() {
  checks.value = null
  if (allBranches.value) return
  try {
    checks.value = (await getAccountChecks('gcash')).data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load GCash checks', life: 3000 })
  }
}

async function saveCheck() {
  if (countedInput.value === '' || Number(countedInput.value) < 0) return
  savingCheck.value = true
  try {
    checks.value = (await createAccountCheck({ method: 'gcash', counted_amount: Number(countedInput.value), note: checkNote.value || undefined })).data
    const d = Number(lastCheck.value?.difference || 0)
    toast.add({
      severity: Math.abs(d) < 0.01 ? 'success' : 'warn',
      summary: Math.abs(d) < 0.01 ? 'GCash matches 🎉' : 'GCash does not match',
      detail: Math.abs(d) < 0.01 ? 'The GCash app balance equals the expected balance.' : `${d > 0 ? 'Over' : 'Short'} by ₱${fmt(Math.abs(d))}. Check the unmatched payments below.`,
      life: 6000,
    })
    countedInput.value = ''
    checkNote.value = ''
    window.dispatchEvent(new Event('gcash-check-saved'))
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save the check', life: 4000 })
  } finally {
    savingCheck.value = false
  }
}

function removeCheck(c) {
  confirm.require({
    message: `Remove the ₱${fmt(c.counted_amount)} check from ${fmtWhen(c.created_at)}?`,
    header: 'Remove check',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Remove', severity: 'danger' },
    accept: async () => {
      try {
        checks.value = (await deleteAccountCheck(c.id)).data
        window.dispatchEvent(new Event('gcash-check-saved'))
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to remove', life: 4000 })
      }
    },
  })
}

function diffClass(d) {
  d = Number(d)
  if (Math.abs(d) < 0.01) return 'text-green-700'
  return d < 0 ? 'text-red-600' : 'text-amber-600'
}
function diffLabel(d) {
  d = Number(d)
  if (Math.abs(d) < 0.01) return 'Matches'
  return `${d < 0 ? 'Short' : 'Over'} ₱${fmt(Math.abs(d))}`
}

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
watch(() => branchStore.currentBranchId, () => { load(); loadChecks() })
onMounted(() => { load(); loadChecks() })
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

    <!-- End-of-day GCash check -->
    <div v-if="!allBranches && checks" class="mb-4 rounded-xl border p-4" :class="checks.checked_today ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'">
      <div class="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h3 class="font-semibold text-gray-900">📱 End-of-day GCash check</h3>
          <p class="text-xs text-gray-500">Open the GCash app, type the balance it shows, and save. Do this once a day, after the last customer.</p>
        </div>
        <span v-if="checks.checked_today && lastCheck" class="rounded-lg px-2 py-1 text-xs font-bold" :class="Math.abs(Number(lastCheck.difference)) < 0.01 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
          Today: {{ diffLabel(lastCheck.difference) }}
        </span>
        <span v-else class="rounded-lg bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">Not checked today</span>
      </div>

      <div v-if="!checks.has_opening" class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No GCash opening balance is set for this branch, so the expected figure counts every GCash payment ever recorded.
        Set one once on <button class="font-semibold underline" @click="router.push('/accounts')">Accounts</button> (enter what the GCash app shows right now), and from then on these checks are meaningful.
      </div>

      <div class="grid gap-3 sm:grid-cols-3 sm:items-end">
        <div>
          <div class="text-xs text-gray-500">Expected (from Accounts)</div>
          <div class="text-xl font-bold tabular-nums text-gray-900">₱{{ fmt(checks.expected) }}</div>
        </div>
        <div>
          <label class="text-xs text-gray-500">Balance in the GCash app</label>
          <div class="relative mt-1">
            <span class="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-gray-400">₱</span>
            <input
              v-model="countedInput"
              type="number" min="0" step="0.01" inputmode="decimal"
              placeholder="0.00"
              class="w-full rounded-xl border border-gray-200 bg-white py-2 pr-3 pl-7 text-right text-sm font-semibold focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              @keyup.enter="saveCheck"
            />
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500">Difference</div>
          <div class="text-xl font-bold tabular-nums" :class="previewDiff === null ? 'text-gray-300' : diffClass(previewDiff)">
            {{ previewDiff === null ? '—' : diffLabel(previewDiff) }}
          </div>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <input
          v-model="checkNote"
          maxlength="500"
          placeholder="Note (optional) — e.g. owner transferred ₱500 out"
          class="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <button
          class="rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
          :disabled="savingCheck || countedInput === ''"
          @click="saveCheck"
        >{{ savingCheck ? 'Saving…' : 'Save check' }}</button>
      </div>
      <p class="mt-2 text-[11px] text-gray-400">
        Money moved in or out of GCash outside of orders (owner transfers, GCash expenses, cash-ins) must be recorded on Accounts or Expenses, otherwise it shows up here as a difference.
      </p>

      <div v-if="checks.checks?.length" class="mt-3 border-t border-gray-100 pt-2">
        <button class="text-xs font-semibold text-blue-600 hover:underline" @click="showHistory = !showHistory">
          {{ showHistory ? 'Hide' : 'Show' }} past checks ({{ checks.checks.length }})
        </button>
        <div v-if="showHistory" class="mt-2 divide-y divide-gray-100">
          <div v-for="c in checks.checks" :key="c.id" class="flex items-center gap-3 py-2 text-sm">
            <div class="min-w-0 flex-1">
              <div class="font-medium text-gray-800">{{ fmtWhen(c.created_at) }}</div>
              <div class="text-xs text-gray-500 truncate">
                App ₱{{ fmt(c.counted_amount) }} · expected ₱{{ fmt(c.expected_amount) }}<template v-if="c.user"> · {{ c.user.name }}</template><template v-if="c.note"> · {{ c.note }}</template>
              </div>
            </div>
            <span class="shrink-0 text-xs font-bold" :class="diffClass(c.difference)">{{ diffLabel(c.difference) }}</span>
            <button class="shrink-0 text-xs text-red-500 hover:text-red-700" @click="removeCheck(c)">✕</button>
          </div>
        </div>
      </div>
    </div>

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
        <div class="text-xs text-gray-400">{{ summary.count }} payment{{ summary.count !== 1 ? 's' : '' }}<template v-if="summary.tips > 0"> · incl. ₱{{ fmt(summary.tips) }} tips</template></div>
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
              {{ p.type === 'refund' ? '−' : '' }}₱{{ fmt(Number(p.amount) + (p.type === 'refund' ? 0 : Number(p.tip_amount || 0))) }}
            </div>
            <div v-if="Number(p.tip_amount) > 0" class="text-[11px] text-violet-600">incl. ₱{{ fmt(p.tip_amount) }} tip</div>
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

    <ChangePaymentMethodDialog v-model:visible="showMethodDialog" :payment="methodTarget" @changed="() => { load(); loadChecks() }" />
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
