<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useBranchStore } from '@/stores/branch.js'
import { getAccounts, createAccountMovement, deleteAccountMovement } from '@/api/accounts.js'

const toast       = useToast()
const confirm     = useConfirm()
const branchStore = useBranchStore()

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
  opening:    { label: 'Opening Balance', emoji: '🏁', hint: 'The counted starting figure. Only activity from this date onward is added on top.' },
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

async function load() {
  if (!branchStore.currentBranchId) return
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

watch(() => branchStore.currentBranchId, (id) => {
  data.value = null
  if (id) load()
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

    <!-- Cash and GCash are per-branch, so a branch has to be picked first -->
    <div
      v-if="!branchStore.currentBranchId"
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
          every payment and expense ever recorded. Set what you actually counted to make them real.
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
            <div v-if="account.opening_date" class="text-xs text-gray-400 mt-1">
              Since {{ fmtDate(account.opening_date) }}
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

      <!-- Why this page is not the P&L -->
      <div class="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 leading-relaxed">
        Withdrawals are profit taken out, not a cost of doing business, so they are kept out of Expenses
        and leave your revenue, net profit, and margin in Reports untouched. This page is money actually
        on hand; Reports counts an order the day it is made, paid or not — so the two will not match, and
        the gap is unpaid orders.
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

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">
                {{ form.type === 'opening' ? 'Counted as of' : 'Date' }}
              </label>
              <input v-model="form.occurred_on" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
