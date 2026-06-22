<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getCustomer, updateCustomer, deleteCustomer } from '@/api/customers.js'
import { getOrders } from '@/api/orders.js'
import { createPayment } from '@/api/payments.js'
import { getCustomerLoyalty, adjustStamps } from '@/api/loyalty.js'
import { useAuthStore } from '@/stores/auth.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()

const customer = ref(null)
const orders   = ref([])
const loading  = ref(true)
const deleted  = ref(false)
const editing  = ref(false)
const form     = ref({})
const saving   = ref(false)
const filter   = ref('all') // 'all' | 'unpaid' | 'paid'

// ── Loyalty stamps ──
const stampCount  = ref(0)
const cycleSize   = ref(0)
// Loyalty is "active" for this branch only when it has active loyalty rules
const loyaltyActive = ref(false)

// Adjust-stamps modal (admin / super-admin only)
const showAdjust   = ref(false)
const adjustMode   = ref('add') // 'add' | 'set'
const adjustValue  = ref('')
const adjustNote   = ref('')
const adjustError  = ref('')
const adjusting    = ref(false)

const adjustedTotal = computed(() => {
  const v = Number(adjustValue.value || 0)
  if (adjustMode.value === 'set') return Math.max(0, Math.trunc(v))
  return stampCount.value + Math.trunc(v)
})

function openAdjust() {
  adjustMode.value  = 'add'
  adjustValue.value = ''
  adjustNote.value  = ''
  adjustError.value = ''
  showAdjust.value  = true
}

async function confirmAdjust() {
  adjustError.value = ''
  const raw = Math.trunc(Number(adjustValue.value || 0))
  if (adjustMode.value === 'add' && raw === 0) {
    adjustError.value = 'Enter a non-zero amount to add or remove.'
    return
  }
  if (adjustMode.value === 'set' && raw < 0) {
    adjustError.value = 'Stamp total cannot be negative.'
    return
  }
  if (adjustedTotal.value < 0) {
    adjustError.value = 'That would make the stamp total negative.'
    return
  }
  adjusting.value = true
  try {
    const res = await adjustStamps(customer.value.id, {
      mode:   adjustMode.value,
      stamps: raw,
      note:   adjustNote.value || undefined,
    })
    stampCount.value = res.data.total_stamps
    showAdjust.value = false
    toast.add({ severity: 'success', summary: 'Stamps updated', detail: `Balance is now ${stampCount.value}`, life: 3000 })
  } catch (e) {
    adjustError.value = e.response?.data?.message || 'Failed to adjust stamps.'
  } finally {
    adjusting.value = false
  }
}

// Actual outstanding balance per order (accounts for partial payments)
function orderBalance(o) {
  return Math.max(0, Number(o.total_amount || 0) - Number(o.paid_amount || 0))
}

const unpaidOrders  = computed(() => orders.value.filter((o) => orderBalance(o) > 0.009))
const paidOrders    = computed(() => orders.value.filter((o) => orderBalance(o) <= 0.009))
const unpaidTotal   = computed(() => unpaidOrders.value.reduce((s, o) => s + orderBalance(o), 0))
const totalSpent    = computed(() => orders.value.reduce((s, o) => s + Number(o.paid_amount || 0), 0))

const filteredOrders = computed(() => {
  if (filter.value === 'unpaid') return unpaidOrders.value
  if (filter.value === 'paid')   return paidOrders.value
  return orders.value
})

// ── Pay All ───────────────────────────────────────────────────────────────────
const showPayAll     = ref(false)
const payAllMethod     = ref('cash')
const payAllTendered   = ref('')
const payAllRef        = ref('')
const payAllError      = ref('')
const payAllShowCustom = ref(false)
const payingAll      = ref(false)
const payAllProgress = ref({ done: 0, total: 0 })

const payAllChange = computed(() =>
  payAllMethod.value === 'cash'
    ? Math.max(0, Number(payAllTendered.value || 0) - unpaidTotal.value)
    : 0
)

function openPayAll() {
  payAllMethod.value     = 'cash'
  payAllTendered.value   = String(Math.ceil(unpaidTotal.value))
  payAllRef.value        = ''
  payAllError.value      = ''
  payAllShowCustom.value = false
  showPayAll.value       = true
}

async function confirmPayAll() {
  payingAll.value      = true
  payAllError.value    = ''
  const targets        = unpaidOrders.value.slice()
  payAllProgress.value = { done: 0, total: targets.length }
  try {
    for (const o of targets) {
      const balance = orderBalance(o)
      const payData = { method: payAllMethod.value, amount: balance, type: 'payment' }
      if (payAllMethod.value === 'cash') payData.tendered = balance
      else payData.reference_number = payAllRef.value || ''
      await createPayment(o.id, payData)
      // A claimed order that's now fully paid is auto-completed by the backend.
      payAllProgress.value.done++
    }
    showPayAll.value = false
    toast.add({ severity: 'success', summary: 'All paid', detail: `${targets.length} order${targets.length !== 1 ? 's' : ''} settled`, life: 3500 })
    await load()
  } catch (e) {
    payAllError.value = e.response?.data?.message || 'Failed to record payment.'
  } finally {
    payingAll.value = false
  }
}
// ─────────────────────────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  deleted.value = false
  try {
    const [custRes, ordersRes, loyaltyRes] = await Promise.all([
      getCustomer(route.params.id),
      getOrders({ customer_id: route.params.id, per_page: 100 }),
      getCustomerLoyalty(route.params.id).catch(() => null),
    ])
    customer.value = custRes.data.data || custRes.data
    orders.value   = ordersRes.data.data || ordersRes.data
    stampCount.value  = loyaltyRes?.data?.total_stamps ?? 0
    loyaltyActive.value = (loyaltyRes?.data?.rules?.length ?? 0) > 0
    cycleSize.value   = loyaltyRes?.data?.rules?.[0]?.every_n_stamps ?? 0
    form.value = {
      name:     customer.value.name,
      username: customer.value.username || '',
      phone:    customer.value.phone,
      email:    customer.value.email || '',
      address:  customer.value.address || '',
      notes:    customer.value.notes || '',
    }
  } catch (e) {
    if (e.response?.status === 404) {
      deleted.value = true
    }
  } finally {
    loading.value = false
  }
}

function capitalizeField(field) {
  if (form.value[field]) {
    form.value[field] = form.value[field].replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

async function save() {
  saving.value = true
  try {
    await updateCustomer(customer.value.id, form.value)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Customer updated successfully', life: 3000 })
    editing.value = false
    load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to update', life: 4000 })
  } finally {
    saving.value = false
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function confirmDelete() {
  const message = orders.value.length > 0
    ? `${customer.value.name} will be removed from the customer list but their ${orders.value.length} order${orders.value.length !== 1 ? 's' : ''} will remain in history.`
    : `${customer.value.name} will be removed from the customer list.`

  confirm.require({
    message,
    header: 'Remove Customer',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Remove', severity: 'danger' },
    accept: async () => {
      try {
        await deleteCustomer(customer.value.id)
        toast.add({ severity: 'success', summary: 'Removed', detail: `${customer.value.name} has been removed`, life: 3000 })
        router.replace('/customers')
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to remove customer', life: 4000 })
      }
    },
  })
}

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-4xl mx-auto">
    <div class="flex items-center gap-3 mb-5 animate-slide-up">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95"
        @click="router.back()"
      >←</button>
      <h1 class="text-xl font-bold text-slate-900">Customer Detail</h1>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="skeleton h-44 rounded-2xl" />
      <div class="skeleton h-64 rounded-2xl" />
    </div>

    <div v-else-if="deleted" class="bg-white rounded-2xl border border-slate-200 p-10 text-center animate-slide-up" style="box-shadow: var(--shadow-card);">
      <div class="text-4xl mb-3">🗑️</div>
      <h2 class="text-lg font-bold text-slate-700 mb-1">Customer Removed</h2>
      <p class="text-sm text-slate-400">This customer has been removed and their profile is no longer available.</p>
      <button class="mt-5 text-sm text-blue-600 hover:text-blue-700 font-medium" @click="router.replace('/customers')">← Back to Customers</button>
    </div>

    <div v-else-if="customer" class="space-y-4">

      <!-- ── Customer info card ── -->
      <div class="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up" style="box-shadow: var(--shadow-card);">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold shrink-0"
              :style="`background: hsl(${(customer.name?.charCodeAt(0) * 7) % 360}, 60%, 52%);`"
            >{{ customer.name?.charAt(0).toUpperCase() }}</div>
            <div>
              <h2 class="text-xl font-bold text-slate-900">{{ customer.name }}</h2>
              <div class="text-sm text-slate-500 mt-0.5 break-all sm:break-normal">
                {{ customer.phone }}{{ customer.username ? ' · @' + customer.username : '' }}{{ customer.email ? ' · ' + customer.email : '' }}
              </div>
              <div v-if="customer.address" class="text-sm text-slate-400 mt-0.5">{{ customer.address }}</div>
              <div v-if="customer.notes" class="text-sm text-slate-400 mt-0.5 italic">{{ customer.notes }}</div>
            </div>
          </div>
          <div class="flex gap-2 items-center shrink-0 flex-wrap">
            <a
              v-if="customer.username"
              :href="`/c/${customer.username}`"
              target="_blank"
              class="text-sm text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all hover:bg-indigo-50"
            >🎴 Loyalty Card</a>
            <span
              v-else
              class="text-sm text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl cursor-default"
            >🎴 No username</span>
            <button
              class="text-sm text-blue-600 hover:text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl transition-all hover:bg-blue-50"
              @click="editing = !editing"
            >{{ editing ? 'Cancel' : 'Edit' }}</button>
            <button
              v-if="auth.isAdmin"
              class="text-sm text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-xl transition-all hover:bg-red-50"
              @click="confirmDelete"
            >Remove</button>
          </div>
        </div>

        <!-- Edit form -->
        <div v-if="editing" class="space-y-3 border-t border-slate-100 pt-4">
          <input v-model="form.name"     @input="capitalizeField('name')"    placeholder="Name"               class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.phone"    placeholder="Phone"              class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.username" placeholder="Username (optional)" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.email"    placeholder="Email (optional)"   class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.address"  @input="capitalizeField('address')" placeholder="Address"            class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <textarea v-model="form.notes" placeholder="Notes" rows="3"    class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400 transition-all" />
          <button
            class="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60 hover:bg-blue-700 transition-all active:scale-95"
            :disabled="saving"
            @click="save"
          >{{ saving ? 'Saving…' : 'Save Changes' }}</button>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div class="text-center p-3 bg-slate-50 rounded-xl">
            <div class="text-2xl font-bold text-slate-900">{{ orders.length }}</div>
            <div class="text-xs text-slate-500 mt-0.5">Total Orders</div>
          </div>
          <div
            class="text-center p-3 rounded-xl transition-all"
            :class="unpaidTotal > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'"
          >
            <div class="text-2xl font-bold" :class="unpaidTotal > 0 ? 'text-amber-700' : 'text-slate-900'">
              ₱{{ fmt(unpaidTotal) }}
            </div>
            <div class="text-xs mt-0.5" :class="unpaidTotal > 0 ? 'text-amber-600 font-medium' : 'text-slate-500'">
              Unpaid Balance
            </div>
          </div>
          <div class="text-center p-3 bg-slate-50 rounded-xl">
            <div class="text-2xl font-bold text-slate-900">₱{{ fmt(totalSpent) }}</div>
            <div class="text-xs text-slate-500 mt-0.5">Total Spent</div>
          </div>
          <div class="text-center p-3 bg-slate-50 rounded-xl">
            <div class="text-2xl font-bold text-slate-900">{{ customer.loyalty_points || 0 }}</div>
            <div class="text-xs text-slate-500 mt-0.5">Points</div>
          </div>
        </div>

        <!-- Loyalty stamps (only when the branch has active loyalty) -->
        <div v-if="loyaltyActive" class="mt-3 flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl">
          <div class="text-2xl">⭐</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-indigo-900">
              <template v-if="cycleSize">{{ stampCount % cycleSize }}/{{ cycleSize }} stamps</template>
              <template v-else>{{ stampCount }} stamp{{ stampCount !== 1 ? 's' : '' }}</template>
            </div>
            <div class="text-xs text-indigo-500">{{ cycleSize ? 'Progress toward next reward' : 'Current stamp balance' }}</div>
          </div>
          <button
            v-if="auth.isAdmin"
            class="text-sm font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl transition-all hover:bg-indigo-100 active:scale-95 shrink-0"
            @click="openAdjust"
          >Adjust</button>
        </div>

        <!-- Unpaid alert banner -->
        <div
          v-if="unpaidTotal > 0"
          class="mt-3 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm"
        >
          <svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <div class="flex-1 min-w-0">
            <span class="font-semibold text-amber-800">{{ unpaidOrders.length }} unpaid order{{ unpaidOrders.length !== 1 ? 's' : '' }}</span>
            <span class="text-amber-700"> · </span>
            <span class="font-bold text-amber-800">₱{{ fmt(unpaidTotal) }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              class="text-xs font-semibold text-amber-700 hover:text-amber-900 underline transition-colors"
              @click="filter = 'unpaid'"
            >View</button>
            <button
              class="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition-all active:scale-95"
              @click="openPayAll"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
              Pay All
            </button>
          </div>
        </div>
      </div>

      <!-- ── Order history ── -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-1" style="box-shadow: var(--shadow-card);">
        <div class="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 class="font-bold text-slate-900">Order History</h3>

          <!-- Filter tabs -->
          <div class="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl">
            <button
              class="filter-tab"
              :class="filter === 'all' ? 'filter-tab-active' : 'filter-tab-inactive'"
              @click="filter = 'all'"
            >
              All
              <span class="filter-count">{{ orders.length }}</span>
            </button>
            <button
              class="filter-tab"
              :class="filter === 'unpaid' ? 'filter-tab-active-amber' : 'filter-tab-inactive'"
              @click="filter = 'unpaid'"
            >
              Unpaid
              <span
                class="filter-count"
                :class="filter === 'unpaid' ? 'bg-amber-200 text-amber-800' : unpaidOrders.length > 0 ? 'bg-amber-100 text-amber-700' : ''"
              >{{ unpaidOrders.length }}</span>
            </button>
            <button
              class="filter-tab"
              :class="filter === 'paid' ? 'filter-tab-active-green' : 'filter-tab-inactive'"
              @click="filter = 'paid'"
            >
              Paid
              <span class="filter-count">{{ paidOrders.length }}</span>
            </button>
          </div>
        </div>

        <div v-if="!filteredOrders.length" class="px-5 py-10 text-sm text-center text-slate-400 space-y-1">
          <div class="text-3xl">{{ filter === 'unpaid' ? '✅' : '🧾' }}</div>
          <div>{{ filter === 'unpaid' ? 'No unpaid orders' : filter === 'paid' ? 'No paid orders yet' : 'No orders yet' }}</div>
        </div>

        <table v-else class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="text-left px-4 sm:px-5 py-2.5 font-medium text-slate-600">Order #</th>
              <th class="text-left px-4 sm:px-5 py-2.5 font-medium text-slate-600">Status</th>
              <th class="text-right px-4 sm:px-5 py-2.5 font-medium text-slate-600">Total</th>
              <th class="hidden sm:table-cell text-left px-5 py-2.5 font-medium text-slate-600">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            <tr
              v-for="o in filteredOrders"
              :key="o.id"
              class="hover:bg-slate-50 cursor-pointer transition-colors"
              @click="router.push('/orders/' + o.id)"
            >
              <td class="px-4 sm:px-5 py-3 font-mono text-slate-900 text-xs">{{ o.order_number }}</td>
              <td class="px-4 sm:px-5 py-3">
                <span :class="['badge', `badge-${o.status}`]">
                  {{ o.status?.replace('_', ' ') }}
                </span>
              </td>
              <td class="px-4 sm:px-5 py-3 text-right">
                <div class="font-semibold text-slate-900">₱{{ fmt(o.total_amount) }}</div>
                <div v-if="orderBalance(o) > 0.009" class="text-[11px] text-amber-600 font-medium mt-0.5">
                  balance ₱{{ fmt(orderBalance(o)) }}
                </div>
              </td>
              <td class="hidden sm:table-cell px-5 py-3 text-slate-500">{{ fmtDate(o.created_at) }}</td>
            </tr>
          </tbody>

          <!-- Footer totals row when filtering -->
          <tfoot v-if="filter !== 'all'" class="border-t-2 border-slate-200 bg-slate-50">
            <tr>
              <td colspan="2" class="px-4 sm:px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {{ filter === 'unpaid' ? 'Total Unpaid' : 'Total Paid' }}
              </td>
              <td class="px-4 sm:px-5 py-2.5 text-right font-bold text-sm"
                :class="filter === 'unpaid' ? 'text-amber-700' : 'text-green-700'"
              >
                ₱{{ fmt(filteredOrders.reduce((s, o) => s + (filter === 'unpaid' ? orderBalance(o) : Number(o.total_amount || 0)), 0)) }}
              </td>
              <td class="hidden sm:table-cell px-5 py-2.5 text-xs text-slate-400">
                {{ filteredOrders.length }} order{{ filteredOrders.length !== 1 ? 's' : '' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>

    <!-- ── Adjust Stamps Modal (admin / super-admin) ── -->
    <Teleport to="body">
    <div
      v-if="showAdjust"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style="background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);"
      @click.self="showAdjust = false"
    >
      <div class="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" style="box-shadow: 0 32px 80px rgba(0,0,0,0.3);">

        <!-- Header -->
        <div class="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Adjust Stamps</h2>
            <p class="text-sm text-slate-400 mt-0.5">Current balance: <span class="font-bold text-indigo-600">{{ stampCount }}</span></p>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            @click="showAdjust = false"
          >✕</button>
        </div>

        <div class="px-6 py-5 space-y-4">

          <!-- Mode toggle -->
          <div class="flex gap-1 p-0.5 bg-slate-100 rounded-xl">
            <button
              v-for="m in [{ k: 'add', l: 'Add / Remove' }, { k: 'set', l: 'Set Total' }]"
              :key="m.k"
              class="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              :class="adjustMode === m.k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
              @click="adjustMode = m.k; adjustValue = ''; adjustError = ''"
            >{{ m.l }}</button>
          </div>

          <!-- Value -->
          <div>
            <label class="text-xs text-slate-500">{{ adjustMode === 'set' ? 'New stamp total' : 'Stamps to add (use a negative number to remove)' }}</label>
            <input
              v-model="adjustValue"
              type="number" step="1"
              :placeholder="adjustMode === 'set' ? 'e.g. 10' : 'e.g. 5 or -2'"
              class="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-right focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          <!-- Quick add buttons -->
          <div v-if="adjustMode === 'add'" class="flex gap-1 flex-wrap">
            <button
              v-for="d in [1, 5, 10]"
              :key="'p'+d"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 active:scale-95 transition-all"
              @click="adjustValue = String(Math.trunc(Number(adjustValue || 0)) + d)"
            >+{{ d }}</button>
            <button
              v-for="d in [1, 5]"
              :key="'m'+d"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
              @click="adjustValue = String(Math.trunc(Number(adjustValue || 0)) - d)"
            >−{{ d }}</button>
          </div>

          <!-- Resulting total preview -->
          <div class="flex items-center justify-between px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl">
            <span class="text-sm font-medium text-indigo-800">New balance</span>
            <span class="text-xl font-bold text-indigo-700">{{ adjustedTotal }}</span>
          </div>

          <!-- Reason -->
          <input
            v-model="adjustNote"
            placeholder="Reason (optional)"
            maxlength="255"
            class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          />

          <div v-if="adjustError" class="text-xs text-red-500 font-medium px-1">{{ adjustError }}</div>
        </div>

        <!-- Actions -->
        <div class="px-6 pb-6 flex gap-3">
          <button
            class="flex-1 py-3 rounded-2xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all"
            :disabled="adjusting"
            @click="showAdjust = false"
          >Cancel</button>
          <button
            class="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style="background: linear-gradient(135deg, #4f46e5, #6366f1); box-shadow: 0 4px 14px rgba(99,102,241,0.35);"
            :disabled="adjusting"
            @click="confirmAdjust"
          >
            <span v-if="!adjusting">Save</span>
            <span v-else>Saving…</span>
          </button>
        </div>

      </div>
    </div>
    </Teleport>

    <!-- ── Pay All Modal ── -->
    <Teleport to="body">
    <div
      v-if="showPayAll"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style="background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);"
      @click.self="showPayAll = false"
    >
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden" style="box-shadow: 0 32px 80px rgba(0,0,0,0.3);">

            <!-- Header -->
            <div class="px-6 pt-6 pb-4 border-b border-slate-100">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-bold text-slate-900">Pay All Unpaid Orders</h2>
                  <p class="text-sm text-slate-400 mt-0.5">
                    {{ unpaidOrders.length }} order{{ unpaidOrders.length !== 1 ? 's' : '' }} ·
                    <span class="font-bold text-amber-600">₱{{ fmt(unpaidTotal) }}</span>
                  </p>
                </div>
                <button
                  class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                  @click="showPayAll = false"
                >✕</button>
              </div>
            </div>

            <div class="px-6 py-5 space-y-4">

              <!-- Order breakdown -->
              <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                <div
                  v-for="o in unpaidOrders"
                  :key="o.id"
                  class="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl"
                >
                  <span class="font-mono text-slate-600 text-xs">{{ o.order_number }}</span>
                  <div class="flex items-center gap-2">
                    <span :class="['badge', `badge-${o.status}`]">{{ o.status?.replace('_', ' ') }}</span>
                    <span class="text-sm font-semibold text-amber-700">₱{{ fmt(orderBalance(o)) }}</span>
                  </div>
                </div>
              </div>

              <div class="h-px bg-slate-100" />

              <!-- Method -->
              <div class="flex gap-1">
                <button
                  v-for="m in ['cash','gcash']"
                  :key="m"
                  class="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  :class="payAllMethod === m
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'"
                  @click="payAllMethod = m"
                >{{ m.toUpperCase() }}</button>
              </div>

              <!-- Total -->
              <div class="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <span class="text-sm font-medium text-amber-800">Total to collect</span>
                <span class="text-xl font-bold text-amber-700">₱{{ fmt(unpaidTotal) }}</span>
              </div>

              <!-- Cash tendered -->
              <template v-if="payAllMethod === 'cash'">
                <div class="grid grid-cols-4 gap-1">
                  <button
                    class="col-span-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    :class="!payAllShowCustom && Number(payAllTendered) === Math.ceil(unpaidTotal)
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
                    @click="payAllTendered = String(Math.ceil(unpaidTotal)); payAllShowCustom = false"
                  >Exact</button>
                  <button
                    v-for="d in [20, 50, 100, 200]"
                    :key="d"
                    class="py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    :class="!payAllShowCustom && Number(payAllTendered) === d
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
                    @click="payAllTendered = String(d); payAllShowCustom = false"
                  >₱{{ d }}</button>
                  <button
                    class="py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    :class="!payAllShowCustom && Number(payAllTendered) === 500
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
                    @click="payAllTendered = '500'; payAllShowCustom = false"
                  >₱500</button>
                  <button
                    class="py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    :class="!payAllShowCustom && Number(payAllTendered) === 1000
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
                    @click="payAllTendered = '1000'; payAllShowCustom = false"
                  >₱1000</button>
                  <button
                    class="col-span-2 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    :class="payAllShowCustom
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
                    @click="payAllShowCustom = !payAllShowCustom; if (!payAllShowCustom) payAllTendered = ''"
                  >Custom</button>
                </div>
                <div v-if="payAllShowCustom" class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                  <input
                    v-model="payAllTendered"
                    type="number" step="0.01" min="0"
                    placeholder="Enter amount…"
                    autofocus
                    class="w-full border border-blue-300 rounded-xl pl-7 pr-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div
                  v-if="Number(payAllTendered) >= unpaidTotal && unpaidTotal > 0"
                  class="flex items-center justify-between px-4 py-2.5 rounded-2xl"
                  style="background: linear-gradient(135deg, #dcfce7, #bbf7d0);"
                >
                  <span class="text-sm font-medium text-green-700">Change</span>
                  <span class="text-lg font-bold text-green-700">₱{{ fmt(payAllChange) }}</span>
                </div>
              </template>

              <!-- Digital ref -->
              <div v-else class="flex items-center gap-2">
                <span class="text-xs text-slate-500 w-16 shrink-0">Ref #</span>
                <input
                  v-model="payAllRef"
                  placeholder="Transaction reference (optional)"
                  class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <!-- Progress -->
              <div v-if="payingAll" class="flex items-center gap-3 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
                <svg class="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(59,130,246,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/></svg>
                Processing {{ payAllProgress.done }} / {{ payAllProgress.total }}…
              </div>

              <div v-if="payAllError" class="text-xs text-red-500 font-medium px-1">{{ payAllError }}</div>
            </div>

            <!-- Actions -->
            <div class="px-6 pb-6 flex gap-3">
              <button
                class="flex-1 py-3 rounded-2xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all"
                :disabled="payingAll"
                @click="showPayAll = false"
              >Cancel</button>
              <button
                class="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
                style="background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 4px 14px rgba(22,163,74,0.35);"
                :disabled="payingAll"
                @click="confirmPayAll"
              >
                <span v-if="!payingAll">✓ Confirm · ₱{{ fmt(unpaidTotal) }}</span>
                <span v-else>Processing…</span>
              </button>
            </div>

        </div>
    </div>
  </Teleport>
</div>
</template>

<style scoped>
.animate-spin { animation: spin 800ms linear infinite; }

.filter-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}
.filter-tab-inactive {
  background: transparent;
  color: #64748b;
}
.filter-tab-inactive:hover { background: white; color: #334155; }
.filter-tab-active {
  background: white;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.filter-tab-active-amber {
  background: white;
  color: #92400e;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.filter-tab-active-green {
  background: white;
  color: #166534;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  background: #e2e8f0;
  color: #64748b;
}

</style>
