<script setup>
import { ref, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { getActivityOrders } from '@/api/activity.js'
import { getBranches } from '@/api/branches.js'

const toast = useToast()

const data           = ref(null)
const branches       = ref([])
const loading        = ref(false)
const page           = ref(1)
const search         = ref('')
const filterBranch   = ref('')
const includeDeleted = ref(false)
const expanded       = ref(new Set())
let searchTimer = null

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtWhen(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}
function qty(n) {
  const num = Number(n || 0)
  return Number.isInteger(num) ? num : num.toFixed(2)
}

function toggle(id) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

// Compact always-visible summary of the services availed, grouped by name:
// "Wash ×3 · Dry ×1". Expanding the row still shows per-load line totals.
function servicesSummary(o) {
  const groups = {}
  for (const l of o.loads || []) {
    const name = l.service_name_snapshot || 'Unknown'
    groups[name] = (groups[name] || 0) + Number(l.quantity || 0)
  }
  return Object.entries(groups).map(([name, q]) => `${name} ×${qty(q)}`).join(' · ')
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, per_page: 20 }
    if (search.value.trim()) params.search = search.value.trim()
    if (filterBranch.value)  params.branch_id = filterBranch.value
    if (includeDeleted.value) params.include_deleted = 1
    const res = await getActivityOrders(params)
    data.value = res.data
    expanded.value = new Set()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load activity', life: 4000 })
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 350)
})
watch(page, load)
watch([filterBranch, includeDeleted], reload)

onMounted(async () => {
  load()
  try {
    const res = await getBranches()
    branches.value = res.data.data || res.data
  } catch {}
})
</script>

<template>
  <div class="p-4 sm:p-6 max-w-4xl mx-auto">

    <!-- Header -->
    <div class="mb-1 flex items-center gap-3">
      <h1 class="text-xl font-bold text-gray-900">Activity</h1>
    </div>
    <p class="text-sm text-gray-400 mb-5">Recent orders across all branches — who availed which services, rung up by whom. View-only.</p>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-4">
      <select v-model="filterBranch" class="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
        <option value="">All branches</option>
        <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>
      <label class="flex items-center gap-2 text-sm text-gray-600 select-none cursor-pointer">
        <input v-model="includeDeleted" type="checkbox" class="rounded border-gray-300" />
        Include deleted orders
      </label>
      <div class="relative w-full sm:w-auto sm:flex-none sm:ml-auto">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          v-model="search"
          type="search"
          placeholder="Search order #, customer, or service…"
          class="w-full sm:w-64 border border-gray-300 rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && !data" class="text-center py-16 text-gray-400">Loading…</div>

    <!-- List -->
    <div v-if="data" class="bg-white rounded-xl border border-gray-200 overflow-hidden" :class="loading ? 'opacity-60' : ''">
      <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 class="font-semibold text-gray-900">📋 Recent Orders</h3>
        <span class="text-xs text-gray-400">{{ data.total }} order{{ data.total !== 1 ? 's' : '' }}</span>
      </div>

      <div v-if="!(data.data && data.data.length)" class="px-5 py-10 text-center text-sm text-gray-400">
        No orders found.
      </div>

      <div v-else class="divide-y divide-gray-50">
        <div v-for="o in data.data" :key="o.id" :class="o.deleted_at ? 'bg-red-50/40' : ''">
          <!-- Order row -->
          <div class="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50/70" @click="toggle(o.id)">
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-800 truncate">
                {{ o.order_number }} — {{ o.customer?.name || 'Walk-in' }}
                <span v-if="o.deleted_at" class="ml-1 text-[10px] font-bold text-red-500 uppercase">deleted</span>
              </div>
              <div class="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                <span v-if="o.branch" class="font-medium text-gray-500">{{ o.branch.name }}</span>
                <span>· {{ o.loads?.length || 0 }} load{{ (o.loads?.length || 0) !== 1 ? 's' : '' }}</span>
                <span>· status: {{ o.status }}</span>
                <span v-if="o.user">· by {{ o.user.name }}</span>
                <span>· {{ fmtWhen(o.created_at) }}</span>
              </div>
              <div v-if="servicesSummary(o)" class="text-xs text-blue-600/80 mt-0.5 truncate">{{ servicesSummary(o) }}</div>
              <div v-if="o.deleted_at" class="text-xs text-red-500">
                deleted {{ fmtWhen(o.deleted_at) }}<span v-if="o.deleted_by" class="font-semibold text-gray-500"> by {{ o.deleted_by.name }}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="text-sm font-semibold tabular-nums text-gray-900">₱{{ fmt(o.total_amount) }}</div>
              <span class="text-gray-300 text-xs transition-transform" :class="expanded.has(o.id) ? 'rotate-90' : ''">▶</span>
            </div>
          </div>

          <!-- Loads detail -->
          <div v-if="expanded.has(o.id)" class="px-5 pb-3">
            <div class="rounded-lg bg-gray-50 border border-gray-100 divide-y divide-gray-100">
              <div v-if="!(o.loads && o.loads.length)" class="px-4 py-2.5 text-xs text-gray-400">No loads recorded.</div>
              <div v-for="l in o.loads" :key="l.id" class="flex items-center justify-between px-4 py-2 text-xs">
                <span class="text-gray-700">{{ l.service_name_snapshot }} <span class="text-gray-400">× {{ qty(l.quantity) }}</span></span>
                <span class="tabular-nums text-gray-600">₱{{ fmt(l.line_total) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="data.last_page > 1" class="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
          :disabled="page <= 1 || loading"
          @click="page--"
        >← Prev</button>
        <span class="text-xs text-gray-400">Page {{ data.current_page }} of {{ data.last_page }}</span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
          :disabled="page >= data.last_page || loading"
          @click="page++"
        >Next →</button>
      </div>
    </div>

  </div>
</template>
