<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { getRevenue, getProfitLoss, getServiceReport, getTopCustomers } from '@/api/reports.js'
import { getCashBalance, setCashBalance } from '@/api/cashBalance.js'
import { useToast } from 'primevue/usetoast'
import { Bar } from 'vue-chartjs'
import {
	Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const toast = useToast()

// ── View mode ─────────────────────────────────────────────────────────────────
const view = ref('reports') // 'reports' | 'cash'

// ── Cash balance ──────────────────────────────────────────────────────────────
const cashDate     = ref(new Date())
const cashData     = ref(null)
const cashLoading  = ref(false)
const editingStart = ref(false)
const startInput   = ref('')
const savingStart  = ref(false)

function cashDateStr() {
	return cashDate.value ? new Date(cashDate.value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
}

async function loadCash() {
	cashLoading.value = true
	cashData.value = null
	try {
		const res = await getCashBalance(cashDateStr())
		cashData.value = res.data
	} finally {
		cashLoading.value = false
	}
}

function openEditStart() {
	startInput.value = cashData.value?.starting_balance ?? 0
	editingStart.value = true
}

async function saveStartingBalance() {
	if (startInput.value === '' || Number(startInput.value) < 0) return
	savingStart.value = true
	try {
		const res = await setCashBalance({ date: cashDateStr(), starting_balance: Number(startInput.value) })
		cashData.value = res.data
		editingStart.value = false
		toast.add({ severity: 'success', summary: 'Starting balance saved', life: 2500 })
	} catch (e) {
		toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
	} finally {
		savingStart.value = false
	}
}

watch(cashDate, () => { if (view.value === 'cash') loadCash() })
watch(view, (v) => { if (v === 'cash') loadCash() })

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
		<div class="flex items-center justify-between mb-5">
			<h1 class="text-xl font-bold text-gray-900">Reports</h1>
			<!-- View switcher -->
			<div class="flex rounded-xl border border-gray-200 overflow-hidden text-sm bg-white">
				<button
					class="px-4 py-2 font-medium transition-colors"
					:class="view === 'reports' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
					@click="view = 'reports'"
				>📊 Reports</button>
				<button
					class="px-4 py-2 font-medium transition-colors"
					:class="view === 'cash' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
					@click="view = 'cash'"
				>💰 Cash Balance</button>
			</div>
		</div>

		<!-- ── Cash Balance view ─────────────────────────────────────────────── -->
		<div v-if="view === 'cash'" class="space-y-4">
			<!-- Date picker -->
			<div class="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3">
				<span class="text-sm text-gray-500 font-medium">Date</span>
				<DatePicker
					v-model="cashDate"
					date-format="M dd, yy"
					show-icon
					icon-display="input"
					placeholder="Select date"
					class="reports-datepicker"
					@update:model-value="loadCash"
				/>
			</div>

			<div v-if="cashLoading" class="text-center py-16 text-gray-400">Loading…</div>

			<div v-else-if="cashData" class="space-y-4">
				<!-- Starting balance card -->
				<div class="bg-white rounded-xl border border-gray-200 p-5">
					<div class="flex items-center justify-between mb-1">
						<span class="text-sm font-semibold text-gray-600">Starting Balance (float)</span>
						<button
							v-if="!editingStart"
							class="text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
							@click="openEditStart"
						>{{ cashData.starting_balance > 0 ? 'Edit' : 'Set' }}</button>
					</div>
					<div v-if="!editingStart" class="text-2xl font-bold text-gray-900">₱{{ fmt(cashData.starting_balance) }}</div>
					<div v-if="cashData.set_by && !editingStart" class="text-xs text-gray-400 mt-1">Set by {{ cashData.set_by }}</div>

					<!-- Inline edit form -->
					<div v-if="editingStart" class="flex items-center gap-2 mt-2">
						<div class="relative flex-1">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
							<input
								v-model="startInput"
								type="number" min="0" step="1"
								class="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
								autofocus
								@keyup.enter="saveStartingBalance"
								@keyup.escape="editingStart = false"
							/>
						</div>
						<button
							class="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
							style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
							:disabled="savingStart"
							@click="saveStartingBalance"
						>{{ savingStart ? 'Saving…' : 'Save' }}</button>
						<button
							class="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all"
							@click="editingStart = false"
						>Cancel</button>
					</div>
				</div>

				<!-- Cash section -->
				<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
					<div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
						<span class="text-base">💵</span>
						<h3 class="font-semibold text-gray-900">Cash</h3>
					</div>
					<div class="divide-y divide-gray-50">
						<div class="flex items-center justify-between px-5 py-3">
							<div class="text-sm text-gray-600">Cash payments in <span class="text-xs text-gray-400">(net of refunds)</span></div>
							<span class="font-semibold text-green-700">+₱{{ fmt(cashData.cash_in) }}</span>
						</div>
						<div class="flex items-center justify-between px-5 py-3">
							<div class="text-sm text-gray-600">Expenses</div>
							<span class="font-semibold text-red-600">−₱{{ fmt(cashData.expenses) }}</span>
						</div>
						<div class="flex items-center justify-between px-5 py-3 bg-gray-50">
							<div class="text-sm font-medium text-gray-700">Total in Drawer</div>
							<span class="font-bold text-gray-900">₱{{ fmt(cashData.total_in_drawer) }}</span>
						</div>
					</div>
				</div>

				<!-- Digital methods -->
				<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
					<div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
						<span class="text-base">📱</span>
						<h3 class="font-semibold text-gray-900">GCash</h3>
					</div>
					<div class="divide-y divide-gray-50">
						<div v-for="m in [
							{ key: 'gcash_in', label: 'GCash', color: '#005eaa' },
						]" :key="m.key" class="flex items-center justify-between px-5 py-3">
							<div class="flex items-center gap-2">
								<span class="text-xs font-bold px-2 py-0.5 rounded-md text-white" :style="`background: ${m.color};`">{{ m.label }}</span>
								<span class="text-xs text-gray-400">net of refunds</span>
							</div>
							<span class="font-semibold" :class="cashData[m.key] > 0 ? 'text-green-700' : 'text-gray-400'">
								₱{{ fmt(cashData[m.key]) }}
							</span>
						</div>
					</div>
				</div>

				<!-- To Remit summary -->
				<div class="grid sm:grid-cols-2 gap-4">
					<div
						class="rounded-xl border p-5"
						:class="cashData.to_remit_cash >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'"
					>
						<div class="text-xs font-semibold mb-1" :class="cashData.to_remit_cash >= 0 ? 'text-green-700' : 'text-red-700'">
							💵 To Remit (Cash)
						</div>
						<div class="text-2xl font-bold" :class="cashData.to_remit_cash >= 0 ? 'text-green-800' : 'text-red-700'">
							₱{{ fmt(cashData.to_remit_cash) }}
						</div>
						<div class="text-xs mt-1" :class="cashData.to_remit_cash >= 0 ? 'text-green-600' : 'text-red-500'">
							Drawer total minus starting float
						</div>
					</div>
					<div class="bg-blue-50 border border-blue-200 rounded-xl p-5">
						<div class="text-xs font-semibold text-blue-700 mb-1">📱 To Remit (GCash)</div>
						<div class="text-2xl font-bold text-blue-900">
							₱{{ fmt(cashData.gcash_in || 0) }}
						</div>
						<div class="text-xs text-blue-500 mt-1">GCash total</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ── Reports view ──────────────────────────────────────────────────── -->
		<template v-else>

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
			<div v-if="pl" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
				<div class="bg-white rounded-xl border border-gray-200 p-4">
					<div class="text-xs text-gray-500 mb-1">Total Revenue</div>
					<div class="text-xl font-bold text-green-700">₱{{ fmt(pl.total_revenue || pl.revenue) }}</div>
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

		</template><!-- end v-else reports -->
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
