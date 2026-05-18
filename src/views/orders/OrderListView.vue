<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getOrders } from '@/api/orders.js'

const router = useRouter()
const orders = ref([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const perPage = ref(20)
const filters = ref({ status: '', search: '', unpaid: false })

const totalPages = computed(() => Math.ceil(total.value / perPage.value))

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_process', label: 'In Process' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
]

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, per_page: perPage.value }
    if (filters.value.status) params.status = filters.value.status
    if (filters.value.search) params.search = filters.value.search
    if (filters.value.unpaid) params.unpaid = 1
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

onMounted(load)
</script>

<template>
  <div class="p-5 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-5 animate-slide-up">
      <h1 class="text-2xl font-bold text-slate-900">Orders</h1>
      <div class="text-sm text-slate-400">{{ total }} total</div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2 mb-4 animate-slide-up stagger-1">
      <div class="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
        <button
          v-for="s in statusOptions"
          :key="s.value"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
          :class="filters.status === s.value
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'"
          @click="filters.status = s.value; applyFilters()"
        >
          {{ s.label }}
        </button>
      </div>

      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all duration-150"
        :class="filters.unpaid
          ? 'bg-amber-50 border-amber-300 text-amber-700'
          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'"
        @click="filters.unpaid = !filters.unpaid; applyFilters()"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        Unpaid
      </button>

      <div class="relative ml-auto">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          v-model="filters.search"
          placeholder="Search order # or customer…"
          class="border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm w-60 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all hover:border-slate-300"
          @keyup.enter="applyFilters"
        />
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

      <table v-else class="w-full text-sm">
        <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
          <tr>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order #</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Loads</th>
            <th class="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(order, i) in orders"
            :key="order.id"
            class="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors duration-100 animate-slide-up"
            :style="`animation-delay: ${i * 25}ms`"
            @click="router.push('/orders/' + order.id)"
          >
            <td class="px-5 py-3.5 font-mono text-xs text-slate-600 font-medium">{{ order.order_number }}</td>
            <td class="px-5 py-3.5">
              <div v-if="order.customer" class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  :style="`background: hsl(${(order.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`">
                  {{ order.customer.name?.charAt(0).toUpperCase() }}
                </div>
                <span class="text-slate-700 font-medium">{{ order.customer.name }}</span>
              </div>
              <span v-else class="text-slate-400">—</span>
            </td>
            <td class="px-5 py-3.5">
              <span :class="['badge', `badge-${order.status}`]">
                {{ order.status?.replace('_', ' ') }}
              </span>
            </td>
            <td class="px-5 py-3.5 text-slate-500">{{ order.loads?.length ?? order.loads_count ?? '—' }}</td>
            <td class="px-5 py-3.5 text-right font-bold text-slate-900">₱{{ fmt(order.total_amount) }}</td>
            <td class="px-5 py-3.5 text-slate-400 text-xs">{{ fmtDate(order.created_at) }}</td>
          </tr>
        </tbody>
      </table>
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
