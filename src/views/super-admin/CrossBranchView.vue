<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getBranchComparison, getProfitLoss } from '@/api/reports.js'
import { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseCategories } from '@/api/expenses.js'
import { getBranches } from '@/api/branches.js'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const toast = useToast()
const confirm = useConfirm()

const branches = ref([])
const selectedBranchId = ref('all')
const loading = ref(false)

// ── All-branches state ──────────────────────────────────────────
const compData = ref([])
const compChart = ref({ labels: [], datasets: [] })
const compApiTotals = ref(null)

// ── Per-branch state ────────────────────────────────────────────
const pl = ref(null)
const expenses = ref([])
const categories = ref([])
const filterMonth = ref(new Date().toISOString().slice(0, 7))
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const form = ref({ expense_category_id: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' })

const selectedBranch = computed(() => branches.value.find(b => b.id === selectedBranchId.value))

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

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Loaders ─────────────────────────────────────────────────────
async function loadComparison() {
  loading.value = true
  try {
    const res = await getBranchComparison()
    const raw = res.data
    const arr = raw?.data ?? raw?.branches ?? raw
    compData.value = Array.isArray(arr) ? arr : []
    compApiTotals.value = raw?.totals ?? null
    compChart.value = {
      labels: compData.value.map(b => b.branch_name || b.name),
      datasets: [
        { label: 'Revenue',    data: compData.value.map(b => Number(b.revenue || b.total_revenue || 0)),    backgroundColor: '#2563eb', borderRadius: 6 },
        { label: 'Expenses',   data: compData.value.map(b => Number(b.expenses || b.total_expenses || 0)),  backgroundColor: '#ef4444', borderRadius: 6 },
        { label: 'Net Profit', data: compData.value.map(b => Number(b.net_profit || 0)),                    backgroundColor: '#16a34a', borderRadius: 6 },
      ],
    }
  } finally {
    loading.value = false
  }
}

async function loadBranch() {
  if (!selectedBranchId.value || selectedBranchId.value === 'all') return
  loading.value = true
  try {
    const params = { month: filterMonth.value }
    const [plRes, expRes] = await Promise.all([
      getProfitLoss(params, selectedBranchId.value),
      getExpenses(params, selectedBranchId.value),
    ])
    pl.value = plRes.data.data || plRes.data
    const raw = expRes.data
    expenses.value = [raw?.expenses?.data, raw?.data?.data, raw?.data, raw].find(Array.isArray) ?? []
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    const res = await getExpenseCategories()
    categories.value = res.data.data || res.data
  } catch {}
}

// ── Expense CRUD ─────────────────────────────────────────────────
function openForm(expense = null) {
  if (expense) {
    editingId.value = expense.id
    form.value = { expense_category_id: expense.expense_category_id, amount: expense.amount, expense_date: expense.expense_date, description: expense.description || '' }
  } else {
    editingId.value = null
    form.value = { expense_category_id: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' }
  }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingId.value = null
}

async function save() {
  saving.value = true
  try {
    const bid = selectedBranchId.value
    if (editingId.value) {
      await updateExpense(editingId.value, form.value, bid)
    } else {
      await createExpense(form.value, bid)
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: `Expense ${editingId.value ? 'updated' : 'logged'}`, life: 3000 })
    closeForm()
    loadBranch()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

function remove(id) {
  confirm.require({
    message: 'Delete this expense?',
    header: 'Delete Expense',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deleteExpense(id, selectedBranchId.value)
        toast.add({ severity: 'success', summary: 'Deleted', detail: 'Expense deleted', life: 3000 })
        loadBranch()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete', life: 4000 })
      }
    },
  })
}

const compTotals = computed(() => ({
  revenue:    compData.value.reduce((s, b) => s + Number(b.revenue || b.total_revenue || 0), 0),
  expenses:   compData.value.reduce((s, b) => s + Number(b.expenses || b.total_expenses || 0), 0),
  net_profit: compData.value.reduce((s, b) => s + Number(b.net_profit || 0), 0),
}))

const monthlyTotal = computed(() => expenses.value.reduce((s, e) => s + Number(e.amount || 0), 0))

watch(selectedBranchId, (val) => {
  if (val === 'all') loadComparison()
  else loadBranch()
})

watch(filterMonth, () => { if (selectedBranchId.value !== 'all') loadBranch() })

onMounted(async () => {
  const res = await getBranches()
  branches.value = res.data.data || res.data
  loadCategories()
  loadComparison()
})
</script>

<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold text-gray-900">
        {{ selectedBranchId === 'all' ? 'All Branches Overview' : selectedBranch?.name }}
      </h1>
      <div class="flex items-center gap-2">
        <select
          v-model="selectedBranchId"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Branches</option>
          <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <button class="text-sm text-blue-600 hover:text-blue-700" @click="selectedBranchId === 'all' ? loadComparison() : loadBranch()">Refresh</button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

    <!-- ── All Branches ── -->
    <div v-else-if="selectedBranchId === 'all'" class="space-y-5">
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Total Revenue</div>
          <div class="text-xl font-bold text-green-700">₱{{ fmt(compApiTotals?.revenue ?? compTotals.revenue) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Total Expenses</div>
          <div class="text-xl font-bold text-red-600">₱{{ fmt(compApiTotals?.expenses ?? compTotals.expenses) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Total Net Profit</div>
          <div class="text-xl font-bold" :class="(compApiTotals?.net_profit ?? compTotals.net_profit) >= 0 ? 'text-green-700' : 'text-red-600'">₱{{ fmt(compApiTotals?.net_profit ?? compTotals.net_profit) }}</div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="font-semibold text-gray-900 mb-4">Branch Comparison</h3>
        <div class="h-72">
          <Bar v-if="compChart.labels.length" :data="compChart" :options="chartOptions" />
          <div v-else class="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200">
          <h3 class="font-semibold text-gray-900">Per Branch</h3>
        </div>
        <div v-if="!compData.length" class="px-5 py-8 text-sm text-center text-gray-400">No data</div>
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
            <tr
              v-for="b in compData"
              :key="b.branch_id || b.id"
              class="hover:bg-gray-50 cursor-pointer"
              @click="selectedBranchId = b.branch_id || b.id"
            >
              <td class="px-5 py-3 font-medium text-gray-900">{{ b.branch_name || b.name }}</td>
              <td class="px-5 py-3 text-right text-gray-600">{{ b.order_count || b.orders || 0 }}</td>
              <td class="px-5 py-3 text-right font-semibold text-green-700">₱{{ fmt(b.revenue || b.total_revenue) }}</td>
              <td class="px-5 py-3 text-right text-red-600">₱{{ fmt(b.expenses || b.total_expenses) }}</td>
              <td class="px-5 py-3 text-right font-bold" :class="Number(b.net_profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'">₱{{ fmt(b.net_profit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Specific Branch ── -->
    <div v-else class="space-y-5">
      <!-- Month filter + Log Expense -->
      <div class="flex items-center justify-between gap-2">
        <input v-model="filterMonth" type="month" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" @change="loadBranch" />
        <button class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700" @click="openForm()">+ Log Expense</button>
      </div>

      <!-- P&L summary -->
      <div v-if="pl" class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Revenue</div>
          <div class="text-xl font-bold text-green-700">₱{{ fmt(pl.revenue) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Expenses</div>
          <div class="text-xl font-bold text-red-600">₱{{ fmt(pl.expenses?.total ?? pl.expenses) }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-500 mb-1">Net Profit</div>
          <div class="text-xl font-bold" :class="Number(pl.net_profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'">₱{{ fmt(pl.net_profit) }}</div>
        </div>
      </div>

      <!-- Expenses table -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900">Expenses</h3>
          <span v-if="expenses.length" class="text-sm font-semibold text-gray-700">₱{{ fmt(monthlyTotal) }}</span>
        </div>
        <div v-if="!expenses.length" class="px-5 py-8 text-sm text-center text-gray-400">No expenses this month</div>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Date</th>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Category</th>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Description</th>
              <th class="text-right px-5 py-2.5 font-medium text-gray-600">Amount</th>
              <th class="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="e in expenses" :key="e.id">
              <td class="px-5 py-3 text-gray-600">{{ fmtDate(e.expense_date) }}</td>
              <td class="px-5 py-3 text-gray-800">{{ e.category?.name || '—' }}</td>
              <td class="px-5 py-3 text-gray-500 max-w-xs truncate">{{ e.description || '—' }}</td>
              <td class="px-5 py-3 text-right font-semibold text-gray-900">₱{{ fmt(e.amount) }}</td>
              <td class="px-5 py-3 text-right">
                <div class="flex gap-1 justify-end">
                  <button class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1" @click="openForm(e)">Edit</button>
                  <button class="text-xs text-red-500 hover:text-red-700 px-2 py-1" @click="remove(e.id)">Del</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Expense form modal -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 class="text-lg font-bold text-gray-900 mb-4">{{ editingId ? 'Edit' : 'Log' }} Expense</h2>
          <div class="space-y-3">
            <select v-model="form.expense_category_id" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select category *</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <input v-model="form.amount" type="number" step="0.01" min="0" placeholder="Amount *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.expense_date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <textarea v-model="form.description" placeholder="Description (optional)" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div class="flex gap-3 mt-5">
            <button class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50" @click="closeForm">Cancel</button>
            <button
              class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
              :disabled="saving || !form.expense_category_id || !form.amount"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
