<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useBranchStore } from '@/stores/branch.js'
import { useAuthStore } from '@/stores/auth.js'
import { getAccounts, createAccountMovement, deleteAccountMovement } from '@/api/accounts.js'

const toast       = useToast()
const confirm     = useConfirm()
const router      = useRouter()
const branchStore = useBranchStore()
const authStore   = useAuthStore()

// Only super admins can sit on "All branches", which this page cannot render —
// cash and GCash are held per branch. Everyone else is resolved to their own
// branch server-side and never sees a selector, so they must not be blocked.
const needsBranchPick = computed(() => authStore.isSuperAdmin && !branchStore.currentBranchId)

const data     = ref(null)
const loading  = ref(false)
const saving   = ref(false)
const showForm = ref(false)

const blankForm = () => ({
  type:        'withdrawal',
  method:      'cash',
  to_method:   'gcash',
  amount:      '',
  occurred_on: new Date().toLocaleDateString('en-CA'),
  recipient:   '',
  note:        '',
})

const form = ref(blankForm())

const TYPES = {
  withdrawal: { label: 'Withdrawal',      emoji: '💸', hint: 'Profit taken out for you or a partner. Does not affect margin.' },
  deposit:    { label: 'Money In',        emoji: '💰', hint: 'Cash put back into the business. Not counted as revenue.' },
  transfer:   { label: 'Transfer',        emoji: '🔁', hint: 'Moving money between your own accounts — nothing leaves the business.' },
  opening:    { label: 'Opening Balance', emoji: '🏁', hint: 'Count what is actually there right now and enter it. Everything recorded up to this moment is sealed into that figure, the other lines restart at zero, and only what comes after moves the balance.' },
}

const METHODS = {
  cash:  { label: 'Cash',  emoji: '💵' },
  gcash: { label: 'GCash', emoji: '📱' },
}

const accounts = computed(() => data.value?.accounts || [])
const missingOpening = computed(() => accounts.value.filter((a) => !a.has_opening))

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Keeps the minus outside the peso sign — "−₱1,200.00", never "₱-1,200.00".
function peso(n) {
  const value = Number(n || 0)
  return `${value < 0 ? '−' : ''}₱${fmt(Math.abs(value))}`
}

// Breakdown lines state their direction: 'in' adds to the balance, 'out'
// subtracts. A figure that arrives against its direction — refunds outweighing
// payments — flips the marker instead of printing "+₱-50.00".
function flow(n, direction = 'in') {
  const value = Number(n || 0) * (direction === 'out' ? -1 : 1)
  if (value === 0) return `₱${fmt(0)}`
  return `${value < 0 ? '−' : '+'}₱${fmt(Math.abs(value))}`
}

// Only withdrawals and deposits carry a direction on their own; an opening
// figure and a transfer are stated plainly, since the from → to says it.
function movementAmount(movement) {
  if (movement.type === 'withdrawal') return flow(movement.amount, 'out')
  if (movement.type === 'deposit') return flow(movement.amount)
  return peso(movement.amount)
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(d) {
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

// "2026-08" → "Aug 2026"
function fmtMonth(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
}

// Cash Balance itemizes the payments behind a month, so hand it that range.
function openMonth(key) {
  const [year, month] = key.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  router.push({
    path: '/cash-balance',
    query: { date_from: `${key}-01`, date_to: `${key}-${String(lastDay).padStart(2, '0')}` },
  })
}

// Movements recorded before an account's opening balance are already baked
// into the counted figure — they stay in the log but no longer move anything.
function isSealed(movement) {
  if (movement.type === 'opening') return false
  const account = accounts.value.find((a) => a.method === movement.method)
  return !!account?.cutover_at && new Date(movement.created_at) <= new Date(account.cutover_at)
}

async function load() {
  if (needsBranchPick.value) return
  loading.value = true
  try {
    const res = await getAccounts()
    data.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load accounts', life: 4000 })
  } finally {
    loading.value = false
  }
}

function openForm(type, method) {
  form.value = { ...blankForm(), type, method: method || 'cash' }
  // A transfer defaults to the other account, since source and target must differ.
  form.value.to_method = form.value.method === 'cash' ? 'gcash' : 'cash'
  showForm.value = true
}

function setMethod(method) {
  form.value.method = method
  if (form.value.to_method === method) {
    form.value.to_method = method === 'cash' ? 'gcash' : 'cash'
  }
}

const canSave = computed(() => {
  const amount = Number(form.value.amount)
  if (form.value.amount === '' || Number.isNaN(amount)) return false
  // Zero is a valid opening balance ("started empty"); nothing else may be zero.
  if (form.value.type === 'opening') return amount >= 0
  return amount > 0
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const payload = { ...form.value, amount: Number(form.value.amount) }
    if (payload.type !== 'transfer') delete payload.to_method
    const res = await createAccountMovement(payload)
    data.value = res.data
    showForm.value = false
    toast.add({ severity: 'success', summary: `${TYPES[form.value.type].label} recorded`, life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

function remove(movement) {
  confirm.require({
    message: `Delete this ${TYPES[movement.type].label.toLowerCase()} of ${peso(movement.amount)}? The balance will go back up.`,
    header: 'Delete movement',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        const res = await deleteAccountMovement(movement.id)
        data.value = res.data
        toast.add({ severity: 'success', summary: 'Movement deleted', life: 2500 })
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete', life: 4000 })
      }
    },
  })
}

watch(() => branchStore.currentBranchId, () => {
  data.value = null
  load()
})

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-3xl mx-auto">

    <!-- Header -->
    <div class="flex items-center gap-3 mb-5">
      <h1 class="text-xl font-bold text-gray-900">Accounts</h1>
      <span v-if="branchStore.currentBranch" class="text-sm text-gray-400">
        — {{ branchStore.currentBranch.name }}
      </span>
    </div>

    <!-- Cash and GCash are per-branch, so "All branches" has nothing to show -->
    <div
      v-if="needsBranchPick"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <div class="text-4xl mb-3">🏪</div>
      <div class="text-base font-semibold text-gray-700 mb-1">Select a branch first</div>
      <div class="text-sm text-gray-400">Cash and GCash are held per branch. Use the branch selector in the top bar.</div>
    </div>

    <div v-else-if="loading && !data" class="text-center py-16 text-gray-400">Loading…</div>

    <div v-else-if="data" class="space-y-4">

      <!-- Opening balance nudge — without it the numbers replay all history -->
      <div
        v-if="missingOpening.length"
        class="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
      >
        <span>🏁</span>
        <span class="flex-1 min-w-[200px]">
          No opening balance set for
          {{ missingOpening.map((a) => METHODS[a.method].label).join(' and ') }} — these totals add up
          every payment and expense ever recorded.
        </span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-all"
          @click="openForm('opening', missingOpening[0].method)"
        >Set opening balance</button>
      </div>

      <!-- Balance cards -->
      <div class="grid sm:grid-cols-2 gap-4">
        <div
          v-for="account in accounts"
          :key="account.method"
          class="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-base">{{ METHODS[account.method].emoji }}</span>
            <h3 class="font-semibold text-gray-900">{{ METHODS[account.method].label }}</h3>
          </div>

          <div class="px-5 py-4">
            <div class="text-xs font-semibold text-gray-500 mb-1">Balance on hand</div>
            <div class="text-3xl font-bold" :class="account.balance < 0 ? 'text-red-600' : 'text-gray-900'">
              {{ peso(account.balance) }}
            </div>
            <div v-if="account.cutover_at" class="text-xs text-gray-400 mt-1">
              Counted {{ fmtDateTime(account.cutover_at) }}
            </div>
          </div>

          <div class="divide-y divide-gray-50 border-t border-gray-100 text-sm">
            <div v-if="account.has_opening" class="flex items-center justify-between px-5 py-2.5">
              <span class="text-gray-500">Opening</span>
              <span class="font-medium tabular-nums text-gray-700">{{ peso(account.opening) }}</span>
            </div>
            <div class="flex items-center justify-between px-5 py-2.5">
              <span class="text-gray-500">Payments in</span>
              <span
                class="font-medium tabular-nums"
                :class="account.payments_in < 0 ? 'text-red-600' : 'text-green-700'"
              >{{ flow(account.payments_in) }}</span>
            </div>
            <div class="flex items-center justify-between px-5 py-2.5">
              <span class="text-gray-500">Expenses</span>
              <span class="font-medium tabular-nums" :class="account.expenses > 0 ? 'text-red-600' : 'text-gray-400'">
                {{ flow(account.expenses, 'out') }}
              </span>
            </div>
            <div class="flex items-center justify-between px-5 py-2.5">
              <span class="text-gray-500">Withdrawals</span>
              <span class="font-medium tabular-nums" :class="account.withdrawals > 0 ? 'text-red-600' : 'text-gray-400'">
                {{ flow(account.withdrawals, 'out') }}
              </span>
            </div>
            <div v-if="account.deposits > 0" class="flex items-center justify-between px-5 py-2.5">
              <span class="text-gray-500">Money in</span>
              <span class="font-medium tabular-nums text-green-700">{{ flow(account.deposits) }}</span>
            </div>
            <div v-if="account.transfer_in > 0 || account.transfer_out > 0" class="flex items-center justify-between px-5 py-2.5">
              <span class="text-gray-500">Transfers</span>
              <span class="font-medium tabular-nums text-gray-700">
                {{ flow(account.transfer_in) }} / {{ flow(account.transfer_out, 'out') }}
              </span>
            </div>
          </div>

          <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
            <button
              class="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-white border border-gray-200 hover:border-red-300 transition-all active:scale-95"
              @click="openForm('withdrawal', account.method)"
            >💸 Withdraw</button>
            <button
              class="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95"
              @click="openForm('deposit', account.method)"
            >💰 Money in</button>
          </div>
        </div>
      </div>

      <!-- Total + secondary actions -->
      <div class="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div>
          <div class="text-xs font-semibold text-gray-500">Total across accounts</div>
          <div class="text-2xl font-bold" :class="data.total_balance < 0 ? 'text-red-600' : 'text-gray-900'">
            {{ peso(data.total_balance) }}
          </div>
        </div>
        <div class="flex gap-2">
          <button
            class="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95"
            @click="openForm('transfer', 'gcash')"
          >🔁 Transfer</button>
          <button
            class="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95"
            @click="openForm('opening', 'cash')"
          >🏁 Opening balance</button>
        </div>
      </div>

      <!-- By month — every month on screen at once, no filtering needed -->
      <div v-if="data.months?.length" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">📅</span>
            <h3 class="font-semibold text-gray-900">By month</h3>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-gray-500 border-b border-gray-100">
                <th class="text-left font-medium px-5 py-2.5">Month</th>
                <th class="text-right font-medium px-3 py-2.5">Cash in</th>
                <th class="text-right font-medium px-3 py-2.5">GCash in</th>
                <th class="text-right font-medium px-3 py-2.5">Expenses</th>
                <th class="text-right font-medium px-3 py-2.5">Withdrawn</th>
                <th class="text-right font-medium px-5 py-2.5">Net</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr
                v-for="row in data.months"
                :key="row.month"
                class="cursor-pointer transition-colors hover:bg-blue-50"
                @click="openMonth(row.month)"
              >
                <td class="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">{{ fmtMonth(row.month) }}</td>
                <td class="px-3 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">₱{{ fmt(row.cash_in) }}</td>
                <td class="px-3 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">₱{{ fmt(row.gcash_in) }}</td>
                <td class="px-3 py-3 text-right tabular-nums whitespace-nowrap" :class="row.expenses > 0 ? 'text-red-600' : 'text-gray-300'">₱{{ fmt(row.expenses) }}</td>
                <td class="px-3 py-3 text-right tabular-nums whitespace-nowrap" :class="row.withdrawals > 0 ? 'text-purple-700' : 'text-gray-300'">₱{{ fmt(row.withdrawals) }}</td>
                <td class="px-5 py-3 text-right tabular-nums font-bold whitespace-nowrap" :class="row.net < 0 ? 'text-red-600' : 'text-gray-900'">{{ peso(row.net) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Movement history -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">📜</span>
            <h3 class="font-semibold text-gray-900">Movements</h3>
          </div>
          <span class="text-xs text-gray-400">{{ (data.movements || []).length }} record{{ (data.movements || []).length !== 1 ? 's' : '' }}</span>
        </div>

        <div v-if="!(data.movements && data.movements.length)" class="px-5 py-8 text-center text-sm text-gray-400">
          Nothing recorded yet. Withdrawals, money put back in, and transfers show up here.
        </div>

        <div v-else class="divide-y divide-gray-50">
          <div
            v-for="movement in data.movements"
            :key="movement.id"
            class="flex items-center justify-between gap-3 px-5 py-3"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-800 flex items-center gap-1.5 flex-wrap">
                <span>{{ TYPES[movement.type].emoji }}</span>
                <span>{{ TYPES[movement.type].label }}</span>
                <span class="text-xs text-gray-400">
                  {{ METHODS[movement.method].label }}<template v-if="movement.to_method"> → {{ METHODS[movement.to_method].label }}</template>
                </span>
                <span v-if="movement.recipient" class="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
                  {{ movement.recipient }}
                </span>
              </div>
              <div class="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                <span>{{ fmtDate(movement.occurred_on) }}</span>
                <span v-if="movement.user">· by {{ movement.user.name }}</span>
                <span v-if="movement.note" class="truncate">· {{ movement.note }}</span>
                <span
                  v-if="isSealed(movement)"
                  class="font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded"
                  title="Recorded before the opening balance — already counted in it, so it no longer moves the balance"
                >sealed</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="text-sm font-bold tabular-nums"
                :class="movement.type === 'withdrawal' ? 'text-red-600' : movement.type === 'deposit' ? 'text-green-700' : 'text-gray-700'"
              >{{ movementAmount(movement) }}</span>
              <button
                class="text-xs text-gray-300 hover:text-red-500 transition-colors px-1"
                title="Delete"
                @click="remove(movement)"
              >✕</button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Form modal -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 class="text-lg font-bold text-gray-900 mb-1">
            {{ TYPES[form.type].emoji }} {{ TYPES[form.type].label }}
          </h2>
          <p class="text-xs text-gray-500 mb-4 leading-relaxed">{{ TYPES[form.type].hint }}</p>

          <div class="space-y-3">
            <!-- Source account -->
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">
                {{ form.type === 'transfer' ? 'From' : 'Account' }}
              </label>
              <div class="flex rounded-lg overflow-hidden border border-gray-300 text-sm">
                <button
                  v-for="(meta, key) in METHODS"
                  :key="key"
                  type="button"
                  class="flex-1 py-2 font-medium transition-colors"
                  :class="form.method === key ? 'text-white' : 'bg-white text-gray-500 hover:bg-gray-50'"
                  :style="form.method === key ? (key === 'gcash' ? 'background:#005eaa' : 'background:#1f2937') : ''"
                  @click="setMethod(key)"
                >{{ meta.label }}</button>
              </div>
            </div>

            <!-- Destination account (transfers only) -->
            <div v-if="form.type === 'transfer'">
              <label class="block text-xs font-semibold text-gray-500 mb-1">To</label>
              <div class="flex rounded-lg overflow-hidden border border-gray-300 text-sm">
                <button
                  v-for="(meta, key) in METHODS"
                  :key="key"
                  type="button"
                  class="flex-1 py-2 font-medium transition-colors disabled:opacity-40"
                  :class="form.to_method === key ? 'text-white' : 'bg-white text-gray-500 hover:bg-gray-50'"
                  :style="form.to_method === key ? (key === 'gcash' ? 'background:#005eaa' : 'background:#1f2937') : ''"
                  :disabled="form.method === key"
                  @click="form.to_method = key"
                >{{ meta.label }}</button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Amount *</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
                <input
                  v-model="form.amount"
                  type="number" step="0.01" :min="form.type === 'opening' ? 0 : 0.01"
                  class="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm"
                  @keyup.enter="save"
                />
              </div>
            </div>

            <!-- An opening seals the account as of right now, so there is no date to pick -->
            <div v-if="form.type !== 'opening'">
              <label class="block text-xs font-semibold text-gray-500 mb-1">Date</label>
              <input v-model="form.occurred_on" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div v-else class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 leading-relaxed">
              Takes effect now. Payments in, expenses, and withdrawals for
              {{ METHODS[form.method].label }} all restart at ₱0.00.
            </div>

            <input
              v-if="form.type === 'withdrawal' || form.type === 'deposit'"
              v-model="form.recipient"
              type="text"
              maxlength="100"
              :placeholder="form.type === 'withdrawal' ? 'Who took it? e.g. partner name (optional)' : 'Who put it in? (optional)'"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <textarea
              v-model="form.note"
              placeholder="Note (optional)"
              rows="2"
              maxlength="500"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div class="flex gap-3 mt-5">
            <button class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50" @click="showForm = false">Cancel</button>
            <button
              class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
              :disabled="saving || !canSave"
              @click="save"
            >{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
