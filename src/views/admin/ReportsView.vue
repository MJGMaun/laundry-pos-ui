<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { getRevenue, getProfitLoss, getServiceReport, getTopCustomers } from '@/api/reports.js'
import { useToast } from 'primevue/usetoast'
import { Bar } from 'vue-chartjs'
import {
	Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const toast = useToast()

// ── Reports ───────────────────────────────────────────────────────────────────
const loading = ref(false)
const period = ref('monthly')

// each period mode uses a different picker value
const monthDate  = ref(new Date())  // monthly — single month
const weekRange  = ref(null)        // weekly  — [Monday, Sunday] of selected week
const dateRange  = ref(null)        // daily   — [start, end]

// Given any date, return [Monday, Sunday] of its ISO week
function getWeekRange(date) {
	const d   = new Date(date)
	const day = d.getDay()                         // 0=Sun … 6=Sat
	const diffToMonday = day === 0 ? -6 : 1 - day  // shift back to Mon
	const monday = new Date(d)
	monday.setDate(d.getDate() + diffToMonday)
	monday.setHours(0, 0, 0, 0)
	const sunday = new Date(monday)
	sunday.setDate(monday.getDate() + 6)
	sunday.setHours(0, 0, 0, 0)
	return [monday, sunday]
}

// Intercept any click in the weekly range picker and snap to full Mon–Sun week
function onWeekPick(val) {
	if (!val) { weekRange.value = null; load(); return }
	// val arrives as [date, null] on first click — grab that date and snap
	const picked = Array.isArray(val) ? val[0] : val
	if (!picked) return
	weekRange.value = getWeekRange(picked)
	load()
}

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

function toYMD(d) {
	return d ? new Date(d).toISOString().slice(0, 10) : null
}

function buildParams() {
	const params = { period: period.value }
	if (period.value === 'monthly' && monthDate.value) {
		const d = new Date(monthDate.value)
		params.date_from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
		const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
		params.date_to = toYMD(last)
	} else if (period.value === 'weekly' && weekRange.value) {
		params.date_from = toYMD(weekRange.value[0])  // Monday
		params.date_to   = toYMD(weekRange.value[1])  // Sunday
	} else {
		if (dateRange.value?.[0]) params.date_from = toYMD(dateRange.value[0])
		if (dateRange.value?.[1]) params.date_to   = toYMD(dateRange.value[1])
	}
	return params
}

async function load() {
	loading.value = true
	try {
		const params = buildParams()
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

// reset picker values and reload when period changes
watch(period, () => {
	monthDate.value = new Date()
	weekRange.value = null
	dateRange.value = null
	load()
})

onMounted(load)
</script>

<template>
	<div class="p-4 sm:p-6 max-w-6xl mx-auto">
		<div class="mb-5">
			<h1 class="text-xl font-bold text-gray-900">Reports</h1>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-2 mb-5 bg-white rounded-xl border border-gray-200 p-3">
			<!-- Period tabs -->
			<div class="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
				<button
					v-for="p in [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]"
					:key="p.value"
					class="px-4 py-1.5 font-medium transition-colors"
					:class="period === p.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
					@click="period = p.value"
				>
					{{ p.label }}
				</button>
			</div>

			<div class="w-px h-6 bg-gray-200" />

			<!-- Monthly: single month picker -->
			<template v-if="period === 'monthly'">
				<DatePicker
					v-model="monthDate"
					view="month"
					date-format="MM yy"
					show-icon
					icon-display="input"
					placeholder="Select month"
					class="reports-datepicker"
					@update:model-value="load"
				/>
			</template>

			<!-- Weekly: click any day → whole Mon–Sun week highlighted -->
			<template v-else-if="period === 'weekly'">
				<div class="relative flex items-center">
					<DatePicker
						v-model="weekRange"
						selection-mode="range"
						:manual-input="false"
						:first-day-of-week="1"
						date-format="M dd, yy"
						show-icon
						icon-display="input"
						placeholder="Select a week…"
						class="reports-datepicker reports-datepicker--range"
						@update:model-value="onWeekPick"
					/>
					<button
						v-if="weekRange"
						class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors leading-none"
						style="font-size: 16px; line-height: 1;"
						@click.stop="weekRange = null; load()"
					>×</button>
				</div>
			</template>

			<!-- Daily: single range picker -->
			<template v-else>
				<div class="relative flex items-center">
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
						class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors leading-none"
						style="font-size: 16px; line-height: 1;"
						@click.stop="dateRange = null; load()"
					>×</button>
				</div>
			</template>
		</div>

		<div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

		<div v-else class="space-y-5">
			<!-- P&L Summary -->
			<div v-if="pl" class="grid grid-cols-2 lg:grid-cols-5 gap-3">
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Revenue</div>
					<div class="text-xl font-bold text-green-700">₱{{ fmt(pl.total_revenue || pl.revenue) }}</div>
				</div>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Uncollected</div>
					<div class="text-xl font-bold text-amber-600">₱{{ fmt(pl.uncollected_revenue || 0) }}</div>
				</div>
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Expenses</div>
					<div class="text-xl font-bold text-red-600">₱{{ fmt(pl.expenses?.total || 0) }}</div>
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
					<div class="text-xl font-bold text-gray-900">{{ Number(pl.margin || pl.profit_margin || 0).toFixed(1) }}%</div>
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

<style>
.reports-datepicker .p-datepicker-input {
	border: 1px solid #d1d5db;
	border-radius: 8px;
	padding: 6px 12px;
	font-size: 14px;
	color: #111827;
	width: 150px;
}
.reports-datepicker.reports-datepicker--range .p-datepicker-input {
	width: 210px;
	padding-right: 28px;
}
.reports-datepicker .p-datepicker-input:focus {
	outline: none;
	border-color: #3b82f6;
	box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
