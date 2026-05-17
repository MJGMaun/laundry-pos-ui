<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOrder, updateOrderStatus } from '@/api/orders.js'
import { updateLoadStatus } from '@/api/loads.js'
import { createPayment } from '@/api/payments.js'
import { useAuthStore } from '@/stores/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const order = ref(null)
const loading = ref(true)
const updatingStatus = ref(false)
const statusError = ref('')

const isPaid = computed(() => {
  if (!order.value) return false
  const paid = (order.value.payments || []).reduce((sum, p) => {
    return sum + (p.type === 'refund' ? -Number(p.amount) : Number(p.amount))
  }, 0)
  return paid >= Number(order.value.total_amount) - 0.01
})

const outstandingBalance = computed(() => {
  if (!order.value) return 0
  const paid = (order.value.payments || []).reduce((sum, p) => {
    return sum + (p.type === 'refund' ? -Number(p.amount) : Number(p.amount))
  }, 0)
  return Math.max(0, Number(order.value.total_amount) - paid)
})

const orderStatusNext = { pending: 'in_process', in_process: 'ready', ready: 'completed' }
const loadStatusNext  = { in_process: 'ready', ready: 'picked_up' }

const statusColor = {
  pending:    { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  in_process: { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  ready:      { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  completed:  { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
  picked_up:  { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
}

async function load() {
  loading.value = true
  try {
    const res = await getOrder(route.params.id)
    order.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
}

async function advanceOrderStatus() {
  const next = orderStatusNext[order.value.status]
  if (!next || !auth.isCashier) return
  if (next === 'completed' && !isPaid.value) {
    statusError.value = `Cannot complete — outstanding balance of ₱${fmt(outstandingBalance.value)}`
    return
  }
  statusError.value = ''
  updatingStatus.value = true
  try { await updateOrderStatus(order.value.id, { status: next }); await load() }
  finally { updatingStatus.value = false }
}

const showPaymentForm = ref(false)
const savingPayment = ref(false)
const paymentFormError = ref('')
const newPayment = ref({ method: 'cash', amount: '', tendered: '', reference_number: '' })

function openPaymentForm() {
  newPayment.value = { method: 'cash', amount: String(outstandingBalance.value.toFixed(2)), tendered: '', reference_number: '' }
  paymentFormError.value = ''
  showPaymentForm.value = true
}

async function recordPayment() {
  if (!(Number(newPayment.value.amount) > 0)) { paymentFormError.value = 'Enter an amount.'; return }
  savingPayment.value = true
  paymentFormError.value = ''
  try {
    const p = newPayment.value
    const payData = { method: p.method, amount: Number(p.amount), type: 'payment' }
    if (p.method === 'cash') payData.tendered = Number(p.tendered || p.amount)
    else payData.reference_number = p.reference_number || ''
    await createPayment(order.value.id, payData)
    showPaymentForm.value = false
    await load()
    if (isPaid.value && order.value.status !== 'completed') {
      await updateOrderStatus(order.value.id, { status: 'completed' })
      await load()
    }
  } catch (e) {
    paymentFormError.value = e.response?.data?.message || 'Failed to record payment.'
  } finally {
    savingPayment.value = false
  }
}

async function advanceLoadStatus(loadId, current) {
  const next = loadStatusNext[current]
  if (!next) return
  try { await updateLoadStatus(loadId, { status: next }); await load() }
  catch (e) { alert(e.response?.data?.message || 'Failed') }
}

function fmt(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

onMounted(load)
</script>

<template>
  <div class="p-5 max-w-4xl mx-auto">
    <div class="flex items-center gap-3 mb-5 animate-slide-up">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95"
        @click="router.back()"
      >←</button>
      <h1 class="text-2xl font-bold text-slate-900">Order Detail</h1>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-4">
      <div class="skeleton h-36 rounded-2xl" />
      <div class="skeleton h-48 rounded-2xl" />
      <div class="grid sm:grid-cols-2 gap-4">
        <div class="skeleton h-36 rounded-2xl" />
        <div class="skeleton h-36 rounded-2xl" />
      </div>
    </div>

    <div v-else-if="order" class="space-y-4">

      <!-- Header card -->
      <div class="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up" style="box-shadow: var(--shadow-card);">
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center flex-wrap gap-3 mb-3">
              <h2 class="text-lg font-bold text-slate-900 font-mono">{{ order.order_number }}</h2>
              <span
                class="badge"
                :class="`badge-${order.status}`"
              >{{ order.status?.replace('_', ' ') }}</span>
            </div>
            <div class="space-y-1 text-sm text-slate-500">
              <div>Created {{ fmtDate(order.created_at) }}</div>
              <div v-if="order.customer" class="flex items-center gap-2">
                <div
                  class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  :style="`background: hsl(${(order.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                >{{ order.customer.name?.charAt(0).toUpperCase() }}</div>
                <span class="font-medium text-slate-700">{{ order.customer.name }}</span>
                <span>·</span>
                <span>{{ order.customer.phone }}</span>
              </div>
              <div v-if="order.user">Staff: <span class="font-medium text-slate-700">{{ order.user.name }}</span></div>
            </div>
          </div>

          <div v-if="orderStatusNext[order.status] && auth.isCashier" class="flex flex-col items-end gap-2">
            <button
              :disabled="updatingStatus"
              class="btn btn-primary"
              @click="advanceOrderStatus"
            >
              <svg v-if="updatingStatus" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
              <span v-else>Mark {{ orderStatusNext[order.status]?.replace('_', ' ') }} →</span>
            </button>
            <div v-if="statusError" class="text-xs text-red-500 font-medium text-right max-w-48">{{ statusError }}</div>
          </div>
        </div>
      </div>

      <!-- Loads -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-1" style="box-shadow: var(--shadow-card);">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900">Loads</h3>
          <span class="text-xs text-slate-400">{{ order.loads?.length || 0 }} load{{ order.loads?.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="divide-y divide-slate-50">
          <div
            v-for="(load, i) in order.loads"
            :key="load.id"
            class="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors animate-slide-up"
            :style="`animation-delay: ${i * 30}ms`"
          >
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-slate-800">{{ load.service_name_snapshot }}</div>
              <div class="text-xs text-slate-400 mt-0.5">{{ load.quantity }} × ₱{{ fmt(load.unit_price_snapshot) }} = ₱{{ fmt(load.line_total) }}</div>
            </div>
            <span :class="['badge', `badge-${load.status}`]">{{ load.status?.replace('_', ' ') }}</span>
            <button
              v-if="loadStatusNext[load.status]"
              class="text-xs text-blue-600 font-medium border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 shrink-0"
              @click="advanceLoadStatus(load.id, load.status)"
            >
              → {{ loadStatusNext[load.status]?.replace('_', ' ') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Payments + Totals -->
      <div class="grid sm:grid-cols-2 gap-4">

        <!-- Payments -->
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-2" style="box-shadow: var(--shadow-card);">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900">Payments</h3>
              <div v-if="!isPaid" class="text-xs text-amber-600 font-medium mt-0.5">
                Balance: ₱{{ fmt(outstandingBalance) }}
              </div>
              <div v-else class="text-xs text-green-600 font-medium mt-0.5">Fully paid</div>
            </div>
            <button
              v-if="!isPaid && auth.isCashier && order.status !== 'completed'"
              class="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-all active:scale-95"
              @click="openPaymentForm"
            >
              + Record Payment
            </button>
          </div>

          <div v-if="!order.payments?.length" class="px-5 py-8 text-sm text-center text-slate-300">No payments recorded</div>
          <div v-else class="divide-y divide-slate-50">
            <div v-for="p in order.payments" :key="p.id" class="flex items-center gap-2 px-5 py-3">
              <div
                class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                :style="p.type === 'refund' ? 'background:#fee2e2;color:#dc2626;' : 'background:#dbeafe;color:#1d4ed8;'"
              >
                {{ p.method?.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-slate-700 capitalize">{{ p.method }}</div>
                <div class="text-xs text-slate-400 capitalize">{{ p.type }}</div>
              </div>
              <span :class="['text-sm font-bold', p.type === 'refund' ? 'text-red-600' : 'text-green-700']">
                {{ p.type === 'refund' ? '−' : '+' }}₱{{ fmt(p.amount) }}
              </span>
            </div>
          </div>

          <!-- Inline payment form -->
          <Transition name="slide-down">
            <div v-if="showPaymentForm" class="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
              <!-- Method -->
              <div class="flex gap-1">
                <button
                  v-for="m in ['cash','gcash','maya','card']"
                  :key="m"
                  class="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  :class="newPayment.method === m
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'"
                  @click="newPayment.method = m"
                >{{ m.toUpperCase() }}</button>
              </div>

              <!-- Amount -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-slate-500 w-16 shrink-0">Amount</span>
                <div class="relative flex-1">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                  <input
                    v-model="newPayment.amount"
                    type="number" step="0.01" min="0"
                    class="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm text-right bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <!-- Cash tendered -->
              <template v-if="newPayment.method === 'cash'">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-500 w-16 shrink-0">Tendered</span>
                  <div class="relative flex-1">
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                    <input
                      v-model="newPayment.tendered"
                      type="number" step="1" min="0"
                      placeholder="Amount given"
                      class="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm text-right bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      @focus="() => { if (!newPayment.tendered) newPayment.tendered = newPayment.amount }"
                    />
                  </div>
                </div>
                <div
                  v-if="Number(newPayment.tendered) >= Number(newPayment.amount) && Number(newPayment.amount) > 0"
                  class="flex justify-between px-3 py-2 rounded-xl text-sm font-bold text-green-700"
                  style="background: linear-gradient(135deg, #dcfce7, #bbf7d0);"
                >
                  <span>Change</span>
                  <span>₱{{ fmt(Number(newPayment.tendered) - Number(newPayment.amount)) }}</span>
                </div>
              </template>

              <!-- Digital ref -->
              <div v-else class="flex items-center gap-2">
                <span class="text-xs text-slate-500 w-16 shrink-0">Ref #</span>
                <input
                  v-model="newPayment.reference_number"
                  placeholder="Transaction reference"
                  class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div v-if="paymentFormError" class="text-xs text-red-500 font-medium px-1">{{ paymentFormError }}</div>

              <div class="flex gap-2 pt-1">
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-white transition-all active:scale-[0.98]"
                  @click="showPaymentForm = false"
                >Cancel</button>
                <button
                  class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  :disabled="savingPayment"
                  style="background: linear-gradient(135deg, #16a34a, #15803d);"
                  @click="recordPayment"
                >
                  <span v-if="!savingPayment">✓ Record</span>
                  <span v-else class="flex items-center justify-center gap-2">
                    <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
                    Saving…
                  </span>
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Totals -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up stagger-2" style="box-shadow: var(--shadow-card);">
          <h3 class="font-bold text-slate-900 mb-4">Summary</h3>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between text-slate-500"><span>Subtotal</span><span>₱{{ fmt(order.subtotal) }}</span></div>
            <div v-if="Number(order.pickup_fee)" class="flex justify-between text-slate-500"><span>Pickup fee</span><span>₱{{ fmt(order.pickup_fee) }}</span></div>
            <div v-if="Number(order.delivery_fee)" class="flex justify-between text-slate-500"><span>Delivery fee</span><span>₱{{ fmt(order.delivery_fee) }}</span></div>
            <div v-if="Number(order.discount_amount)" class="flex justify-between text-slate-500"><span>Discount</span><span class="text-red-500">−₱{{ fmt(order.discount_amount) }}</span></div>
            <div class="flex justify-between font-bold text-base text-slate-900 pt-2.5 border-t border-slate-100">
              <span>Total</span><span>₱{{ fmt(order.total_amount) }}</span>
            </div>
          </div>
          <div v-if="order.notes" class="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
            Notes: {{ order.notes }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-spin { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.slide-down-enter-active, .slide-down-leave-active { transition: all 220ms ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 600px; }
</style>
