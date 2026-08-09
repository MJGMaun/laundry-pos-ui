<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import { getRevenue, getProfitLoss, getServiceReport, getTopCustomers, getSalesSummary } from '@/api/reports.js'
import { useBranchStore } from '@/stores/branch.js'
import { useAuthStore } from '@/stores/auth.js'
import { rangeFromQuery } from '@/utils/dateRangeQuery.js'
import { useToast } from 'primevue/usetoast'
import { Bar } from 'vue-chartjs'
import {
	Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const toast = useToast()
const router = useRouter()
const route = useRoute()
const branch = useBranchStore()
const auth = useAuthStore()

const loading = ref(false)

function toYMD(d) {
	if (!d) return null
	const date = new Date(d)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayYMD() {
	return toYMD(new Date())
}

// Default today → today, unless a Dashboard card handed over its period.
const dateRange = ref(rangeFromQuery(route.query, [new Date(), new Date()]))

const revenue = ref([])
const pl = ref(null)
const services = ref([])
const topCustomers = ref([])
const summary = ref(null)
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

function buildParams() {
	const from = dateRange.value?.[0] ? toYMD(dateRange.value[0]) : todayYMD()
	const to   = dateRange.value?.[1] ? toYMD(dateRange.value[1]) : from
	return { period: 'daily', date_from: from, date_to: to }
}

// The factual cards drill into the page listing what they're made of, on the
// same date range. Net Profit and Margin are derived, so they stay inert.
const cardLinks = computed(() => {
	const { date_from, date_to } = buildParams()
	const range = { date_from, date_to }
	return {
		revenue:     { path: '/orders',   query: range },
		loads:       { path: '/orders',   query: range },
		uncollected: { path: '/orders',   query: { ...range, unpaid: 1 } },
		expenses:    { path: '/expenses', query: range },
	}
})

async function load() {
	loading.value = true
	try {
		const params = buildParams()
		const [revRes, plRes, svcRes, custRes, sumRes] = await Promise.all([
			getRevenue(params),
			getProfitLoss(params),
			getServiceReport(params),
			getTopCustomers({ limit: 10, date_from: params.date_from, date_to: params.date_to }),
			getSalesSummary({ date_from: params.date_from, date_to: params.date_to }),
		])

		revenue.value = revRes.data.data || revRes.data
		pl.value = plRes.data.data || plRes.data
		services.value = svcRes.data.data || svcRes.data
		topCustomers.value = custRes.data.data || custRes.data
		summary.value = sumRes.data.data || sumRes.data

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

// Every card here is branch-scoped server-side via the X-Branch-Id header, but
// nothing refetched when the header's branch selector changed — the page kept
// showing whichever branch was active when it was opened.
watch(() => branch.currentBranchId, load)

onMounted(load)
</script>

<template>
	<div class="p-4 sm:p-6 max-w-6xl mx-auto">
		<div class="flex items-center gap-3 mb-5">
			<h1 class="text-xl font-bold text-gray-900">Reports</h1>
			<span v-if="branch.currentBranch" class="text-sm text-gray-400">— {{ branch.currentBranch.name }}</span>
			<span v-else-if="auth.isSuperAdmin" class="text-sm text-gray-400">— All branches</span>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-2 mb-5 bg-white rounded-xl border border-gray-200 p-3">
			<div class="flex items-center gap-1.5">
				<DatePicker
					v-model="dateRange"
					selection-mode="range"
					:manual-input="false"
					date-format="M dd, yy"
					show-icon
					icon-display="input"
					placeholder="Date range…"
					class="reports-datepicker reports-datepicker--range"
					@update:model-value="(v) => { if (!v || (v[0] && v[1])) load() }"
				/>
				<button
					v-if="dateRange"
					class="flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-sm leading-none"
					@click.stop="dateRange = [new Date(), new Date()]; load()"
				>×</button>
			</div>
		</div>

		<div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

		<div v-else class="space-y-5">
			<!-- P&L Summary -->
			<div v-if="pl" class="grid grid-cols-2 lg:grid-cols-6 gap-3">
				<RouterLink :to="cardLinks.revenue" class="stat-link bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Revenue</div>
					<div class="text-xl font-bold text-green-700">₱{{ fmt(pl.total_revenue || pl.revenue) }}</div>
				</RouterLink>
				<RouterLink :to="cardLinks.loads" class="stat-link bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Loads</div>
					<div class="text-xl font-bold text-gray-900">{{ Number(summary?.load_count || 0).toLocaleString() }}</div>
				</RouterLink>
				<RouterLink :to="cardLinks.uncollected" class="stat-link bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Uncollected</div>
					<div class="text-xl font-bold text-amber-600">₱{{ fmt(pl.uncollected_revenue || 0) }}</div>
				</RouterLink>
				<RouterLink :to="cardLinks.expenses" class="stat-link bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Expenses</div>
					<div class="text-xl font-bold text-red-600">₱{{ fmt(pl.expenses?.total || 0) }}</div>
				</RouterLink>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Net Profit</div>
					<div class="text-xl font-bold"
						:class="(pl.net_profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'">
						₱{{ fmt(pl.net_profit) }}
					</div>
				</div>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Margin</div>
					<div class="text-xl font-bold text-gray-900">{{ Number(pl.profit_margin_pct ?? pl.margin ?? pl.profit_margin ?? 0).toFixed(1) }}%</div>
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
							<th class="hidden sm:table-cell text-right px-5 py-2.5 font-medium text-gray-600">Orders</th>
							<th class="hidden sm:table-cell text-right px-5 py-2.5 font-medium text-gray-600">Qty</th>
							<th class="text-right px-5 py-2.5 font-medium text-gray-600">Revenue</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						<tr v-for="s in services" :key="s.service_id || s.id">
							<td class="px-5 py-3 text-gray-900">{{ s.service_name || s.name }}</td>
							<td class="hidden sm:table-cell px-5 py-3 text-right text-gray-600">{{ s.order_count || s.orders || 0 }}</td>
							<td class="hidden sm:table-cell px-5 py-3 text-right text-gray-600">{{ s.total_quantity || s.quantity || 0 }}</td>
							<td class="px-5 py-3 text-right font-semibold text-gray-900">₱{{ fmt(s.total_revenue || s.revenue) }}</td>
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
						<tr
							v-for="(c, i) in topCustomers"
							:key="c.id || i"
							:class="c.id ? 'hover:bg-blue-50 cursor-pointer transition-colors' : ''"
							@click="c.id && router.push('/customers/' + c.id)"
						>
							<td class="px-5 py-3 font-medium" :class="c.id ? 'text-blue-600' : 'text-gray-900'">{{ c.name }}</td>
							<td class="px-5 py-3 text-right text-gray-600">{{ c.total_visits }}</td>
							<td class="px-5 py-3 text-right font-semibold text-gray-900">₱{{ fmt(c.total_spent) }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

	</div>
</template>

<style>
/* Summary cards link into the page listing what they're made of — still cards,
   not text, with a hover hint that they're clickable. */
.stat-link {
	display: block;
	color: inherit;
	text-decoration: none;
	transition: border-color 150ms ease, box-shadow 150ms ease;
}
.stat-link:hover {
	border-color: #bfdbfe;
	box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
}

.reports-datepicker .p-datepicker-input {
	border: 1px solid #d1d5db;
	border-radius: 8px;
	padding: 6px 12px;
	font-size: 14px;
	color: #111827;
	width: 150px;
}
.reports-datepicker.reports-datepicker--range .p-datepicker-input {
	width: 280px;
	padding-right: 28px;
}
.reports-datepicker .p-datepicker-input:focus {
	outline: none;
	border-color: #3b82f6;
	box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
