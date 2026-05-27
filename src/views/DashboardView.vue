<script setup>
import { ref, computed, onMounted } from 'vue'
import { getSalesSummary, getRevenue, getTopCustomers, getServiceReport } from '@/api/reports.js'
import { getExpenses } from '@/api/expenses.js'
import { getCashBalance } from '@/api/cashBalance.js'
import { useCountUp } from '@/composables/useCountUp.js'
import { Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler)

const loading = ref(true)
const period = ref('daily')

const rawRevenue      = ref(0)
const rawUncollected  = ref(0)
const rawOrders       = ref(0)
const rawExpenses     = ref(0)
const rawCash         = ref(0)

const animRevenue      = useCountUp(rawRevenue,     1000, 2)
const animUncollected  = useCountUp(rawUncollected,  950, 2)
const animOrders       = useCountUp(rawOrders,        800, 0)
const animExpenses     = useCountUp(rawExpenses,      900, 2)
const animCash         = useCountUp(rawCash,          950, 2)

const revenueData  = ref([])
const topCustomers = ref([])
const services     = ref([])

const revenueChart = ref({ labels: [], datasets: [] })
const serviceChart = ref({ labels: [], datasets: [] })

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0f172a',
      titleColor: '#94a3b8',
      bodyColor: '#fff',
      borderColor: '#1e293b',
      borderWidth: 1,
      padding: 10,
      callbacks: { label: (ctx) => ` ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` },
    },
  },
  scales: {
    y: {
      ticks: { callback: (v) => '₱' + Number(v).toLocaleString(), color: '#94a3b8', font: { size: 11 } },
      grid: { color: '#f1f5f9' },
      border: { display: false },
    },
    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
  },
}

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { boxWidth: 10, padding: 12, font: { size: 11 }, color: '#475569' } },
    tooltip: {
      backgroundColor: '#0f172a',
      callbacks: { label: (ctx) => ` ₱${Number(ctx.raw).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` },
    },
  },
  cutout: '68%',
}

function fmt(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

async function load() {
  loading.value = true
  const today = new Date().toISOString().slice(0, 10)
  try {
    const [sumRes, revRes, custRes, svcRes, expRes, cashRes] = await Promise.all([
      getSalesSummary(),
      getRevenue({ period: period.value }),
      getTopCustomers({ limit: 5 }),
      getServiceReport(),
      getExpenses({ date_from: today, date_to: today, per_page: 500 }),
      getCashBalance(today),
    ])

    const sum = sumRes.data.data || sumRes.data
    rawRevenue.value     = Number(sum?.total_revenue || sum?.revenue || 0)
    rawUncollected.value = Number(sum?.uncollected_revenue || 0)
    rawOrders.value      = Number(sum?.order_count || sum?.orders || 0)

    const expList = expRes.data.expenses?.data || []
    rawExpenses.value = expList.reduce((s, e) => s + Number(e.amount || 0), 0)
    rawCash.value = Number(cashRes.data.total_in_drawer || 0)

    revenueData.value  = revRes.data.data || revRes.data
    topCustomers.value = custRes.data.data || custRes.data
    services.value     = svcRes.data.data || svcRes.data

    buildCharts()
  } finally {
    loading.value = false
  }
}

function buildCharts() {
  const rev = Array.isArray(revenueData.value) ? revenueData.value : (revenueData.value.data || [])
  revenueChart.value = {
    labels: rev.map((r) => r.label || r.date || r.period),
    datasets: [{
      label: 'Revenue',
      data: rev.map((r) => Number(r.revenue || r.total || 0)),
      borderColor: '#3b82f6',
      backgroundColor: (ctx) => {
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height)
        g.addColorStop(0, 'rgba(59,130,246,0.18)')
        g.addColorStop(1, 'rgba(59,130,246,0.01)')
        return g
      },
      fill: true,
      tension: 0.45,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: '#3b82f6',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
    }],
  }

  const svcArr = Array.isArray(services.value) ? services.value : []
  const colors = ['#3b82f6','#6366f1','#8b5cf6','#a78bfa','#ec4899','#f43f5e','#f97316']
  serviceChart.value = {
    labels: svcArr.slice(0, 7).map((s) => s.service_name || s.name),
    datasets: [{
      data: svcArr.slice(0, 7).map((s) => Number(s.total_revenue || s.revenue || 0)),
      backgroundColor: colors,
      borderWidth: 3,
      borderColor: '#fff',
      hoverBorderWidth: 4,
    }],
  }
}

onMounted(load)
</script>

<template>
  <div class="p-5 max-w-7xl mx-auto">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6 animate-slide-up">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p class="text-sm text-slate-400 mt-0.5">
          {{ new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }) }}
        </p>
      </div>
      <select
        v-model="period"
        class="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 transition-all hover:border-slate-300"
        @change="load"
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-5">
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div v-for="n in 5" :key="n" class="skeleton h-28 rounded-2xl" :class="`stagger-${n}`" />
      </div>
      <div class="grid lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 skeleton h-64 rounded-2xl" />
        <div class="skeleton h-64 rounded-2xl" />
      </div>
    </div>

    <div v-else class="space-y-5">

      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="stat-card animate-slide-up stagger-1">
          <div class="stat-icon" style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1d4ed8;">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div class="stat-label">Today's Revenue</div>
          <div class="stat-value">₱{{ fmt(animRevenue) }}</div>
          <div class="stat-bar" style="background: linear-gradient(90deg, #3b82f6, #6366f1);" />
        </div>

        <div class="stat-card animate-slide-up stagger-2">
          <div class="stat-icon" style="background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e;">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div class="stat-label">Uncollected</div>
          <div class="stat-value text-amber-600">₱{{ fmt(animUncollected) }}</div>
          <div class="stat-bar" style="background: linear-gradient(90deg, #f59e0b, #fbbf24);" />
        </div>

        <div class="stat-card animate-slide-up stagger-3">
          <div class="stat-icon" style="background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #166534;">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          </div>
          <div class="stat-label">Orders Today</div>
          <div class="stat-value">{{ animOrders }}</div>
          <div class="stat-bar" style="background: linear-gradient(90deg, #16a34a, #4ade80);" />
        </div>

        <div class="stat-card animate-slide-up stagger-4">
          <div class="stat-icon" style="background: linear-gradient(135deg, #fee2e2, #fecaca); color: #991b1b;">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          </div>
          <div class="stat-label">Expenses Today</div>
          <div class="stat-value text-red-600">₱{{ fmt(animExpenses) }}</div>
          <div class="stat-bar" style="background: linear-gradient(90deg, #ef4444, #f87171);" />
        </div>

        <div class="stat-card animate-slide-up stagger-5">
          <div class="stat-icon" style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #065f46;">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
          </div>
          <div class="stat-label">Cash on Hand</div>
          <div class="stat-value text-emerald-700">₱{{ fmt(animCash) }}</div>
          <div class="stat-bar" style="background: linear-gradient(90deg, #10b981, #34d399);" />
        </div>
      </div>

      <!-- Charts row -->
      <div class="grid lg:grid-cols-3 gap-4">

        <!-- Revenue chart -->
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up stagger-1" style="box-shadow: var(--shadow-card);">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-900">Revenue Trend</h3>
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-blue-500" />
              <span class="text-xs text-slate-400">Revenue</span>
            </div>
          </div>
          <div class="h-56">
            <Line v-if="revenueChart.labels.length" :data="revenueChart" :options="lineOptions" />
            <div v-else class="flex items-center justify-center h-full text-slate-300 text-sm">No data yet</div>
          </div>
        </div>

        <!-- Service mix -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up stagger-2" style="box-shadow: var(--shadow-card);">
          <h3 class="font-bold text-slate-900 mb-4">Service Mix</h3>
          <div class="h-56">
            <Doughnut v-if="serviceChart.labels.length" :data="serviceChart" :options="doughnutOptions" />
            <div v-else class="flex items-center justify-center h-full text-slate-300 text-sm">No data yet</div>
          </div>
        </div>
      </div>

      <!-- Top customers -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-3" style="box-shadow: var(--shadow-card);">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900">Top Customers</h3>
          <RouterLink to="/customers" class="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</RouterLink>
        </div>
        <div v-if="!topCustomers.length" class="px-5 py-10 text-center text-slate-300 text-sm">No data yet</div>
        <div v-else class="divide-y divide-slate-50">
          <div
            v-for="(c, i) in topCustomers"
            :key="c.id || i"
            class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
          >
            <div class="text-sm font-bold text-slate-300 w-4">{{ i + 1 }}</div>
            <div
              class="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
              :style="`background: hsl(${(i * 67 + 210) % 360}, 70%, 55%);`"
            >
              {{ c.name?.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-slate-800">{{ c.name }}</div>
              <div class="text-xs text-slate-400">{{ c.total_visits }} visit{{ c.total_visits !== 1 ? 's' : '' }}</div>
            </div>
            <div class="text-sm font-bold text-slate-900">₱{{ fmt(c.total_spent) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  position: relative;
  background: white;
  border-radius: 18px;
  border: 1px solid #e2e8f0;
  padding: 18px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: all 200ms cubic-bezier(0.22,1,0.36,1);
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lifted);
}
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}
.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.stat-value {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.stat-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 0 0 18px 18px;
  opacity: 0;
  transition: opacity 200ms ease;
}
.stat-card:hover .stat-bar { opacity: 1; }
</style>
