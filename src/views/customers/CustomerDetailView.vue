<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getCustomer, updateCustomer } from '@/api/customers.js'
import { getOrders } from '@/api/orders.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const customer = ref(null)
const orders   = ref([])
const loading  = ref(true)
const editing  = ref(false)
const form     = ref({})
const saving   = ref(false)
const filter   = ref('all') // 'all' | 'unpaid' | 'paid'

// Orders that haven't reached 'completed' are considered unpaid
const unpaidOrders  = computed(() => orders.value.filter((o) => o.status !== 'completed'))
const paidOrders    = computed(() => orders.value.filter((o) => o.status === 'completed'))
const unpaidTotal   = computed(() => unpaidOrders.value.reduce((s, o) => s + Number(o.total_amount || 0), 0))

const filteredOrders = computed(() => {
  if (filter.value === 'unpaid') return unpaidOrders.value
  if (filter.value === 'paid')   return paidOrders.value
  return orders.value
})

async function load() {
  loading.value = true
  try {
    const [custRes, ordersRes] = await Promise.all([
      getCustomer(route.params.id),
      getOrders({ customer_id: route.params.id, per_page: 100 }),
    ])
    customer.value = custRes.data.data || custRes.data
    orders.value   = ordersRes.data.data || ordersRes.data
    form.value = {
      name:     customer.value.name,
      username: customer.value.username || '',
      phone:    customer.value.phone,
      email:    customer.value.email || '',
      address:  customer.value.address || '',
      notes:    customer.value.notes || '',
    }
  } finally {
    loading.value = false
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
              <div v-if="customer.loyalty_tier" class="mt-1">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  {{ customer.loyalty_tier?.name || 'Bronze' }}
                </span>
              </div>
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
          </div>
        </div>

        <!-- Edit form -->
        <div v-if="editing" class="space-y-3 border-t border-slate-100 pt-4">
          <input v-model="form.name"     placeholder="Name"               class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.phone"    placeholder="Phone"              class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.username" placeholder="Username (optional)" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.email"    placeholder="Email (optional)"   class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
          <input v-model="form.address"  placeholder="Address"            class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
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
            <div class="text-2xl font-bold text-slate-900">₱{{ fmt(customer.total_spent) }}</div>
            <div class="text-xs text-slate-500 mt-0.5">Total Spent</div>
          </div>
          <div class="text-center p-3 bg-slate-50 rounded-xl">
            <div class="text-2xl font-bold text-slate-900">{{ customer.loyalty_points || 0 }}</div>
            <div class="text-xs text-slate-500 mt-0.5">Points</div>
          </div>
        </div>

        <!-- Unpaid alert banner -->
        <div
          v-if="unpaidTotal > 0"
          class="mt-3 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm"
        >
          <svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <div class="flex-1">
            <span class="font-semibold text-amber-800">{{ unpaidOrders.length }} unpaid order{{ unpaidOrders.length !== 1 ? 's' : '' }}</span>
            <span class="text-amber-700"> — outstanding balance of </span>
            <span class="font-bold text-amber-800">₱{{ fmt(unpaidTotal) }}</span>
          </div>
          <button
            class="text-xs font-semibold text-amber-700 hover:text-amber-900 underline shrink-0 transition-colors"
            @click="filter = 'unpaid'"
          >View</button>
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
                <div v-if="o.status !== 'completed'" class="text-[11px] text-amber-600 font-medium mt-0.5">unpaid</div>
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
                ₱{{ fmt(filteredOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)) }}
              </td>
              <td class="hidden sm:table-cell px-5 py-2.5 text-xs text-slate-400">
                {{ filteredOrders.length }} order{{ filteredOrders.length !== 1 ? 's' : '' }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  </div>
</template>

<style scoped>
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
