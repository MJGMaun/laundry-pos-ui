<script setup>
import { ref, onMounted } from 'vue'
import { getRevenue, getProfitLoss, getServiceReport, getTopCustomers } from '@/api/reports.js'
import { Bar } from 'vue-chartjs'
import {
	Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const loading = ref(false)
const period = ref('monthly')
const dateFrom = ref('')
const dateTo = ref('')

const revenue = ref([])
const pl = ref(null)
const services = ref([])
const topCustomers = ref([])

const revenueChart = ref({ labels: [], datasets: [] })

const chartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: { legend: { display: false } },
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
		const params = { period: period.value }
		if (dateFrom.value) params.date_from = dateFrom.value
		if (dateTo.value) params.date_to = dateTo.value

		const [revRes, plRes, svcRes, custRes] = await Promise.all([
			getRevenue(params),
			getProfitLoss(params),
			getServiceReport(params),
			getTopCustomers({ limit: 10 }),
		])

		revenue.value = revRes.data.data || revRes.data
		pl.value = plRes.data.data || plRes.data
		services.value = svcRes.data.data || svcRes.data
		topCustomers.value = custRes.data.data || custRes.data

		buildChart()
	} finally {
		loading.value = false
	}
}

function buildChart() {
	const rev = Array.isArray(revenue.value) ? revenue.value : (revenue.value.data || [])
	revenueChart.value = {
		labels: rev.map((r) => r.label || r.date || r.period),
		datasets: [
			{
				label: 'Revenue',
				data: rev.map((r) => Number(r.revenue || r.total || 0)),
				backgroundColor: '#2563eb',
				borderRadius: 6,
			},
			{
				label: 'Expenses',
				data: rev.map((r) => Number(r.expenses || 0)),
				backgroundColor: '#ef4444',
				borderRadius: 6,
			},
		],
	}
}

onMounted(load)
</script>

<template>
	<div class="p-4 sm:p-6 max-w-6xl mx-auto">
		<h1 class="text-xl font-bold text-gray-900 mb-5">Reports</h1>

		<!-- Filters -->
		<div class="flex flex-wrap gap-2 mb-5 bg-white rounded-xl border border-gray-200 p-3">
			<select v-model="period" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" @change="load">
				<option value="daily">Daily</option>
				<option value="weekly">Weekly</option>
				<option value="monthly">Monthly</option>
			</select>
			<input v-model="dateFrom" type="date" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
			<input v-model="dateTo" type="date" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
			<button class="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700"
				@click="load">Apply</button>
		</div>

		<div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

		<div v-else class="space-y-5">
			<!-- P&L Summary -->
			<div v-if="pl" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Revenue</div>
					<div class="text-xl font-bold text-green-700">₱{{ fmt(pl.total_revenue || pl.revenue) }}</div>
				</div>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Expenses</div>
					<div class="text-xl font-bold text-red-600">₱{{ fmt(pl.expenses.total || pl.expenses) }}</div>
				</div>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Net Profit</div>
					<div class="text-xl font-bold"
						:class="(pl.net_profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'">
						₱{{ fmt(pl.net_profit) }}
					</div>
				</div>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Margin</div>
					<div class="text-xl font-bold text-gray-900">{{ Number(pl.margin || pl.profit_margin ||
						0).toFixed(1) }}%</div>
				</div>
			</div>

			<!-- Revenue chart -->
			<div class="bg-white rounded-xl border border-gray-200 p-5">
				<h3 class="font-semibold text-gray-900 mb-4">Revenue vs Expenses</h3>
				<div class="h-64">
					<Bar v-if="revenueChart.labels.length" :data="revenueChart" :options="chartOptions" />
					<div v-else class="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>
				</div>
			</div>

			<!-- Service performance -->
			<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
				<div class="px-5 py-3 border-b border-gray-200">
					<h3 class="font-semibold text-gray-900">Service Performance</h3>
				</div>
				<div v-if="!services.length" class="px-5 py-8 text-sm text-center text-gray-400">No data</div>
				<table v-else class="w-full text-sm">
					<thead class="bg-gray-50 border-b border-gray-200">
						<tr>
							<th class="text-left px-5 py-2.5 font-medium text-gray-600">Service</th>
							<th class="text-right px-5 py-2.5 font-medium text-gray-600">Orders</th>
							<th class="text-right px-5 py-2.5 font-medium text-gray-600">Qty</th>
							<th class="text-right px-5 py-2.5 font-medium text-gray-600">Revenue</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						<tr v-for="s in services" :key="s.service_id || s.id">
							<td class="px-5 py-3 text-gray-900">{{ s.service_name || s.name }}</td>
							<td class="px-5 py-3 text-right text-gray-600">{{ s.order_count || s.orders || 0 }}</td>
							<td class="px-5 py-3 text-right text-gray-600">{{ s.total_quantity || s.quantity || 0 }}
							</td>
							<td class="px-5 py-3 text-right font-semibold text-gray-900">₱{{ fmt(s.revenue) }}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<!-- Top customers -->
			<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
				<div class="px-5 py-3 border-b border-gray-200">
					<h3 class="font-semibold text-gray-900">Top Customers</h3>
				</div>
				<div v-if="!topCustomers.length" class="px-5 py-8 text-sm text-center text-gray-400">No data</div>
				<table v-else class="w-full text-sm">
					<thead class="bg-gray-50 border-b border-gray-200">
						<tr>
							<th class="text-left px-5 py-2.5 font-medium text-gray-600">Customer</th>
							<th class="text-right px-5 py-2.5 font-medium text-gray-600">Visits</th>
							<th class="text-right px-5 py-2.5 font-medium text-gray-600">Total Spent</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						<tr v-for="(c, i) in topCustomers" :key="c.id || i">
							<td class="px-5 py-3 font-medium text-gray-900">{{ c.name }}</td>
							<td class="px-5 py-3 text-right text-gray-600">{{ c.total_visits }}</td>
							<td class="px-5 py-3 text-right font-semibold text-gray-900">₱{{ fmt(c.total_spent) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</template>
