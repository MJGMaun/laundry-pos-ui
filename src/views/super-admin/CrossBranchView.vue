<script setup>
import { ref, onMounted } from 'vue'
import { getBranchComparison } from '@/api/reports.js'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const loading = ref(false)
const data = ref([])
const chart = ref({ labels: [], datasets: [] })

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: {
    y: { ticks: { callback: (v) => '₱' + v.toLocaleString() }, grid: { color: '#f1f5f9' } },
    x: { grid: { display: false } },
  },
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function load() {
  loading.value = true
  try {
    const res = await getBranchComparison()
    data.value = res.data.data || res.data

    chart.value = {
      labels: data.value.map((b) => b.branch_name || b.name),
      datasets: [
        {
          label: 'Revenue',
          data: data.value.map((b) => Number(b.revenue || b.total_revenue || 0)),
          backgroundColor: '#2563eb',
          borderRadius: 6,
        },
        {
          label: 'Expenses',
          data: data.value.map((b) => Number(b.expenses || b.total_expenses || 0)),
          backgroundColor: '#ef4444',
          borderRadius: 6,
        },
        {
          label: 'Net Profit',
          data: data.value.map((b) => Number(b.net_profit || 0)),
          backgroundColor: '#16a34a',
          borderRadius: 6,
        },
      ],
    }
  } finally {
    loading.value = false
  }
}

const totals = () => ({
  revenue: data.value.reduce((s, b) => s + Number(b.revenue || b.total_revenue || 0), 0),
  expenses: data.value.reduce((s, b) => s + Number(b.expenses || b.total_expenses || 0), 0),
  net_profit: data.value.reduce((s, b) => s + Number(b.net_profit || 0), 0),
})

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold text-gray-900">All Branches Overview</h1>
      <button class="text-sm text-blue-600 hover:text-blue-700" @click="load">Refresh</button>
    </div>

    <div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

    <div v-else class="space-y-5">
      <!-- Summary totals -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Total Revenue</div>
          <div class="text-xl font-bold text-green-700">₱{{ fmt(totals().revenue) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Total Expenses</div>
          <div class="text-xl font-bold text-red-600">₱{{ fmt(totals().expenses) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Total Net Profit</div>
          <div class="text-xl font-bold" :class="totals().net_profit >= 0 ? 'text-green-700' : 'text-red-600'">
            ₱{{ fmt(totals().net_profit) }}
          </div>
        </div>
      </div>

      <!-- Branch comparison chart -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="font-semibold text-gray-900 mb-4">Branch Comparison</h3>
        <div class="h-72">
          <Bar v-if="chart.labels.length" :data="chart" :options="chartOptions" />
          <div v-else class="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>
        </div>
      </div>

      <!-- Per-branch table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200">
          <h3 class="font-semibold text-gray-900">Per Branch</h3>
        </div>
        <div v-if="!data.length" class="px-5 py-8 text-sm text-center text-gray-400">No data</div>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Branch</th>
              <th class="text-right px-5 py-2.5 font-medium text-gray-600">Orders</th>
              <th class="text-right px-5 py-2.5 font-medium text-gray-600">Revenue</th>
              <th class="text-right px-5 py-2.5 font-medium text-gray-600">Expenses</th>
              <th class="text-right px-5 py-2.5 font-medium text-gray-600">Net Profit</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="b in data" :key="b.branch_id || b.id">
              <td class="px-5 py-3 font-medium text-gray-900">{{ b.branch_name || b.name }}</td>
              <td class="px-5 py-3 text-right text-gray-600">{{ b.order_count || b.orders || 0 }}</td>
              <td class="px-5 py-3 text-right font-semibold text-green-700">₱{{ fmt(b.revenue || b.total_revenue) }}</td>
              <td class="px-5 py-3 text-right text-red-600">₱{{ fmt(b.expenses || b.total_expenses) }}</td>
              <td class="px-5 py-3 text-right font-bold" :class="Number(b.net_profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'">
                ₱{{ fmt(b.net_profit) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
