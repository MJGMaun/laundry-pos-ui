<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getOrders } from '@/api/orders.js'
import { updateLoadStatus } from '@/api/loads.js'

const router = useRouter()
const toast = useToast()
const loading = ref(false)
const orders = ref([])
const markingLoad = ref(null)

// Orders grouped with only their ready loads
const queue = computed(() =>
  orders.value
    .map((o) => ({ ...o, ready_loads: (o.loads || []).filter((l) => l.status === 'ready') }))
    .filter((o) => o.ready_loads.length > 0)
)

async function load() {
  loading.value = true
  try {
    const [inProcessRes, readyRes, completedRes] = await Promise.all([
      getOrders({ status: 'in_process', per_page: 100 }),
      getOrders({ status: 'ready', per_page: 100 }),
      getOrders({ status: 'completed', per_page: 100 }),
    ])
    const inProcess = inProcessRes.data.data || inProcessRes.data
    const ready = readyRes.data.data || readyRes.data
    const completed = completedRes.data.data || completedRes.data
    // Merge, dedupe by id
    const map = new Map()
    ;[...inProcess, ...ready, ...completed].forEach((o) => map.set(o.id, o))
    orders.value = Array.from(map.values()).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  } finally {
    loading.value = false
  }
}

async function markPickedUp(loadId) {
  markingLoad.value = loadId
  try {
    await updateLoadStatus(loadId, { status: 'picked_up' })
    toast.add({ severity: 'success', summary: 'Done', detail: 'Marked as picked up', life: 2500 })
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
  } finally {
    markingLoad.value = null
  }
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// Auto-refresh every 30s
let timer = null
onMounted(() => { load(); timer = setInterval(load, 30000) })
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="p-5 max-w-3xl mx-auto">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6 animate-slide-up">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Pickup Queue</h1>
        <p class="text-sm text-slate-400 mt-0.5">Loads ready for customer pickup</p>
      </div>
      <div class="flex items-center gap-3">
        <div
          v-if="queue.length"
          class="flex items-center justify-center min-w-8 h-8 px-2.5 rounded-full text-sm font-bold text-white"
          style="background: linear-gradient(135deg, #f59e0b, #f97316);"
        >{{ queue.length }}</div>
        <button
          class="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95"
          :class="loading ? 'opacity-60 pointer-events-none' : ''"
          @click="load"
        >
          <svg class="w-4 h-4" :class="loading ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Skeleton -->
    <div v-if="loading && !queue.length" class="space-y-4">
      <div v-for="n in 3" :key="n" class="skeleton rounded-2xl h-36" :class="`stagger-${n}`" />
    </div>

    <!-- Empty -->
    <div v-else-if="!queue.length" class="flex flex-col items-center justify-center py-24 text-slate-300 gap-3 animate-slide-up">
      <div class="text-6xl">🧺</div>
      <div class="text-center">
        <div class="text-lg font-semibold text-slate-400">All clear!</div>
        <div class="text-sm mt-1">No loads waiting for pickup right now.</div>
      </div>
    </div>

    <!-- Queue cards -->
    <div v-else class="space-y-4">
      <div
        v-for="(order, i) in queue"
        :key="order.id"
        class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up"
        :style="`box-shadow: var(--shadow-card); animation-delay: ${i * 40}ms`"
      >
        <!-- Order header -->
        <div
          class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
          @click="router.push('/orders/' + order.id)"
        >
          <div class="flex items-center gap-3">
            <!-- Pulsing dot -->
            <div class="relative w-2.5 h-2.5 shrink-0">
              <div class="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-75" />
              <div class="relative w-2.5 h-2.5 rounded-full bg-amber-400" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900 font-mono text-sm">{{ order.order_number }}</span>
                <span class="text-xs text-slate-400">{{ timeAgo(order.created_at) }}</span>
              </div>
              <div v-if="order.customer" class="flex items-center gap-1.5 mt-0.5">
                <div
                  class="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                  :style="`background: hsl(${(order.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                >{{ order.customer.name?.charAt(0).toUpperCase() }}</div>
                <span class="text-xs font-medium text-slate-700">{{ order.customer.name }}</span>
                <span v-if="order.customer.phone" class="text-xs text-slate-400">· {{ order.customer.phone }}</span>
              </div>
              <div v-else class="text-xs text-slate-400 mt-0.5">Walk-in customer</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {{ order.ready_loads.length }} ready
            </span>
            <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        </div>

        <!-- Ready loads -->
        <div class="divide-y divide-slate-50">
          <div
            v-for="load in order.ready_loads"
            :key="load.id"
            class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
          >
            <div class="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-slate-800">{{ load.service_name_snapshot }}</div>
              <div class="text-xs text-slate-400">{{ load.quantity }} × ₱{{ Number(load.unit_price_snapshot || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }) }}</div>
            </div>
            <button
              class="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 shrink-0"
              style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); box-shadow: 0 2px 8px rgba(139,92,246,0.35);"
              :disabled="markingLoad === load.id"
              @click="markPickedUp(load.id)"
            >
              <svg v-if="markingLoad === load.id" class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
              <span v-else>✓ Picked up</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-spin { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
.animate-ping { animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite; }
</style>
