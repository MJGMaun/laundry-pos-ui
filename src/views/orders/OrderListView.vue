<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import { getOrders } from '@/api/orders.js'
import { useAuthStore } from '@/stores/auth.js'

const router = useRouter()
const auth = useAuthStore()
const orders = ref([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const perPage = ref(20)
const filters = ref({ status: '', search: '', unpaid: false })
const dateRange = ref(null)  // [Date, Date] when both picked

function toYMD(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null
}

const totalPages = computed(() => Math.ceil(total.value / perPage.value))

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'ready', label: 'Ready' },
  { value: 'to_collect', label: 'To Collect' },
  { value: 'completed', label: 'Completed' },
]

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, per_page: perPage.value }
    if (filters.value.status) params.status = filters.value.status
    if (filters.value.search) params.search = filters.value.search
    if (filters.value.unpaid) params.unpaid = 1
    if (dateRange.value?.[0]) params.date_from = toYMD(dateRange.value[0])
    if (dateRange.value?.[1]) params.date_to   = toYMD(dateRange.value[1])
    const res = await getOrders(params)
    orders.value = res.data.data || res.data
    total.value = res.data.total || orders.value.length
  } finally {
    loading.value = false
  }
}

function applyFilters() { page.value = 1; load() }

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isPaid(order) {
  return Number(order.paid_amount) >= Number(order.total_amount)
}

function isDone(order) {
  return order.status === 'completed'
}

// Left-border accent colour driven by urgency: unpaid > status
function accentClass(order) {
  if (!isPaid(order) && !isDone(order)) return 'border-l-4 border-amber-400'
  if (order.status === 'to_collect') return 'border-l-4 border-orange-400'
  if (order.status === 'ready')      return 'border-l-4 border-green-400'
  if (order.status === 'pending')    return 'border-l-4 border-slate-300'
  return 'border-l-4 border-transparent' // completed
}

onMounted(load)
</script>

<template>
  <div class="p-5 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-5 animate-slide-up">
      <h1 class="text-2xl font-bold text-slate-900">Orders</h1>
      <div class="text-sm text-slate-400">{{ total }} total</div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col gap-2 mb-4 animate-slide-up stagger-1">
      <!-- Row 1: status tabs + unpaid pill -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto shrink-0" style="scrollbar-width:none;">
          <button
            v-for="s in statusOptions"
            :key="s.value"
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap"
            :class="filters.status === s.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'"
            @click="filters.status = s.value; applyFilters()"
          >
            {{ s.label }}
          </button>
        </div>

        <button
          v-if="auth.isSuperAdmin"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all duration-150 whitespace-nowrap"
          :class="filters.unpaid
            ? 'bg-amber-50 border-amber-300 text-amber-700'
            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'"
          @click="filters.unpaid = !filters.unpaid; applyFilters()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Unpaid
        </button>
      </div>

      <!-- Row 2: date range + search -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative flex items-center">
          <DatePicker
            v-model="dateRange"
            selection-mode="range"
            :manual-input="false"
            date-format="M dd, yy"
            show-icon
            icon-display="input"
            placeholder="Date range…"
            class="orders-datepicker"
            @update:model-value="(v) => { if (!v || (v[0] && v[1])) applyFilters() }"
          />
          <button
            v-if="dateRange"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors leading-none"
            style="font-size: 16px; line-height: 1;"
            @click.stop="dateRange = null; applyFilters()"
          >×</button>
        </div>

        <div class="relative flex-1 min-w-[160px] sm:flex-none sm:ml-auto">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            v-model="filters.search"
            placeholder="Search order # or customer…"
            class="w-full sm:w-60 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all hover:border-slate-300"
            @keyup.enter="applyFilters"
          />
        </div>
      </div>
    </div>

    <!-- Table card -->
    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-2" style="box-shadow: var(--shadow-card);">

      <!-- Skeleton -->
      <div v-if="loading" class="divide-y divide-slate-100">
        <div v-for="n in 8" :key="n" class="flex items-center gap-4 px-5 py-4">
          <div class="skeleton h-4 w-28 rounded" />
          <div class="skeleton h-4 w-36 rounded flex-1" />
          <div class="skeleton h-5 w-20 rounded-full" />
          <div class="skeleton h-4 w-8 rounded" />
          <div class="skeleton h-4 w-20 rounded" />
          <div class="skeleton h-4 w-24 rounded" />
        </div>
      </div>

      <div v-else-if="!orders.length" class="flex flex-col items-center justify-center h-48 text-slate-300 gap-2">
        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <span class="text-sm">No orders found</span>
      </div>

      <template v-else>

        <!-- ── Mobile cards (< sm) ── -->
        <div class="sm:hidden divide-y divide-slate-100">
          <div
            v-for="(order, i) in orders"
            :key="order.id"
            class="pl-0 pr-4 py-3.5 cursor-pointer transition-colors animate-slide-up"
            :class="[
              accentClass(order),
              isDone(order)
                ? 'opacity-50 hover:opacity-75 bg-slate-50/60'
                : (!isPaid(order) ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-blue-50/40 active:bg-blue-50'),
            ]"
            :style="`animation-delay: ${i * 25}ms`"
            @click="router.push('/orders/' + order.id)"
          >
            <div class="pl-3">
              <!-- Row 1: order number + status badge -->
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <span class="font-mono text-xs font-semibold" :class="isDone(order) ? 'text-slate-400' : 'text-slate-600'">{{ order.order_number }}</span>
                <span :class="['badge', `badge-${order.status}`]">{{ order.status?.replace('_', ' ') }}</span>
              </div>

              <!-- Row 2: customer -->
              <div class="flex items-center gap-1.5 mb-2">
                <template v-if="order.customer">
                  <button
                    class="flex items-center gap-1.5 cursor-pointer hover:underline"
                    :class="isDone(order) ? 'text-slate-400' : 'text-slate-700'"
                    @click.stop="router.push('/customers/' + order.customer.id)"
                  >
                    <div
                      class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      :style="`background: hsl(${(order.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                    >{{ order.customer.name?.charAt(0).toUpperCase() }}</div>
                    <span class="text-sm font-medium">{{ order.customer.name }}</span>
                  </button>
                </template>
                <span v-else class="text-sm text-slate-400">Walk-in</span>
              </div>

              <!-- Row 3: loads · date  |  total + paid badge -->
              <div class="flex items-end justify-between gap-2">
                <div class="text-xs text-slate-400 leading-snug">
                  <span>{{ order.loads ? order.loads.reduce((s, l) => s + Number(l.quantity), 0) : (order.loads_count ?? 0) }} load(s)</span>
                  <span class="mx-1">·</span>
                  <span>{{ fmtDate(order.created_at) }}</span>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-bold text-sm" :class="isDone(order) ? 'text-slate-400' : 'text-slate-900'">₱{{ fmt(order.total_amount) }}</div>
                  <div
                    class="text-[11px] font-semibold mt-0.5"
                    :class="isPaid(order) ? 'text-green-600' : 'text-amber-600'"
                  >{{ isPaid(order) ? '✓ Paid' : '⚠ Unpaid' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Desktop table (≥ sm) ── -->
        <table class="hidden sm:table w-full text-sm">
          <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <tr>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Loads</th>
              <th class="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
              <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(order, i) in orders"
              :key="order.id"
              class="border-b border-slate-50 last:border-0 cursor-pointer transition-colors duration-100 animate-slide-up"
              :class="[
                isDone(order)
                  ? 'opacity-50 hover:opacity-75 bg-slate-50/60'
                  : (!isPaid(order) ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-blue-50/40'),
              ]"
              :style="`animation-delay: ${i * 25}ms`"
              @click="router.push('/orders/' + order.id)"
            >
              <!-- Accent bar via first cell left border -->
              <td
                class="py-3.5 font-mono text-xs font-medium"
                :class="[accentClass(order), isDone(order) ? 'text-slate-400 pl-4 pr-3' : 'text-slate-600 pl-4 pr-3']"
              >{{ order.order_number }}</td>
              <td class="px-5 py-3.5">
                <button
                  v-if="order.customer"
                  class="flex items-center gap-2 cursor-pointer hover:underline"
                  :class="isDone(order) ? 'text-slate-400' : 'text-slate-700'"
                  @click.stop="router.push('/customers/' + order.customer.id)"
                >
                  <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    :style="`background: hsl(${(order.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`">
                    {{ order.customer.name?.charAt(0).toUpperCase() }}
                  </div>
                  <span class="font-medium">{{ order.customer.name }}</span>
                </button>
                <span v-else class="text-slate-400">—</span>
              </td>
              <td class="px-5 py-3.5">
                <span :class="['badge', `badge-${order.status}`]">{{ order.status?.replace('_', ' ') }}</span>
              </td>
              <td class="px-5 py-3.5" :class="isDone(order) ? 'text-slate-400' : 'text-slate-500'">
                {{ order.loads ? order.loads.reduce((s, l) => s + Number(l.quantity), 0) : (order.loads_count ?? '—') }}
              </td>
              <td class="px-5 py-3.5 text-right">
                <div class="font-bold" :class="isDone(order) ? 'text-slate-400' : 'text-slate-900'">₱{{ fmt(order.total_amount) }}</div>
                <div class="text-xs mt-0.5 font-semibold"
                  :class="isPaid(order) ? 'text-green-600' : 'text-amber-600'">
                  {{ isPaid(order) ? '✓ Paid' : '⚠ Unpaid' }}
                </div>
              </td>
              <td class="hidden md:table-cell px-5 py-3.5 text-xs" :class="isDone(order) ? 'text-slate-300' : 'text-slate-400'">{{ fmtDate(order.created_at) }}</td>
            </tr>
          </tbody>
        </table>

      </template>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4 text-sm text-slate-500 animate-fade-in">
      <span>Page {{ page }} of {{ totalPages }}</span>
      <div class="flex gap-2">
        <button
          :disabled="page <= 1"
          class="px-4 py-2 border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.97]"
          @click="page--; load()"
        >← Previous</button>
        <button
          :disabled="page >= totalPages"
          class="px-4 py-2 border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.97]"
          @click="page++; load()"
        >Next →</button>
      </div>
    </div>
  </div>
</template>

<style>
.orders-datepicker .p-datepicker-input {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 6px 28px 6px 12px;
  font-size: 14px;
  color: #1e293b;
  width: 210px;
}
.orders-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
