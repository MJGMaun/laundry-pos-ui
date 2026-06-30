<script setup>
import { ref, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseCategories } from '@/api/expenses.js'
import { useQueueStore } from '@/stores/queue.js'
import { isOfflineError } from '@/offline/isOfflineError.js'

const toast = useToast()
const confirm = useConfirm()
const queue = useQueueStore()

const expenses = ref([])
const categories = ref([])
const loading = ref(false)
const loadError = ref('')
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const filterCat = ref('')
const search = ref('')

// Default to the current month: [first day, last day]
function currentMonthRange() {
  const now = new Date()
  return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)]
}
const dateRange = ref(currentMonthRange())

function toYMD(d) {
  if (!d) return null
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function unwrap(res) {
  const candidates = [res.data?.expenses?.data, res.data?.data?.data, res.data?.data, res.data]
  return candidates.find(Array.isArray) ?? []
}

const form = ref({ expense_category_id: '', amount: '', payment_method: 'cash', expense_date: new Date().toLocaleDateString('en-CA'), description: '' })

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const params = {}
    if (dateRange.value?.[0]) params.date_from = toYMD(dateRange.value[0])
    if (dateRange.value?.[1]) params.date_to   = toYMD(dateRange.value[1])
    if (filterCat.value)      params.category_id = filterCat.value
    if (search.value.trim())  params.search = search.value.trim()
    const res = await getExpenses(params)
    expenses.value = unwrap(res)
  } catch (e) {
    loadError.value = e.response?.data?.message || e.message || 'Failed to load expenses'
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    const res = await getExpenseCategories()
    categories.value = unwrap(res)
  } catch {}
}

async function save() {
  saving.value = true
  try {
    if (editingId.value) {
      await updateExpense(editingId.value, form.value)
    } else {
      await createExpense(form.value)
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: `Expense ${editingId.value ? 'updated' : 'logged'} successfully`, life: 3000 })
    closeForm()
    load()
  } catch (e) {
    if (isOfflineError(e)) {
      const method = editingId.value ? 'PUT' : 'POST'
      const url = editingId.value ? `/expenses/${editingId.value}` : '/expenses'
      await queue.enqueueRequest(method, url, { ...form.value })
      toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Expense queued — will sync when connected', life: 6000 })
      closeForm()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

function remove(id) {
  confirm.require({
    message: 'Are you sure you want to delete this expense?',
    header: 'Delete Expense',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deleteExpense(id)
        toast.add({ severity: 'success', summary: 'Deleted', detail: 'Expense deleted', life: 3000 })
        load()
      } catch (e) {
        if (isOfflineError(e)) {
          await queue.enqueueRequest('DELETE', `/expenses/${id}`, null)
          toast.add({ severity: 'warn', summary: 'Queued offline', detail: 'Delete will sync when connected', life: 6000 })
        } else {
          toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete', life: 4000 })
        }
      }
    },
  })
}

function openForm(expense = null) {
  if (expense) {
    editingId.value = expense.id
    form.value = {
      expense_category_id: expense.expense_category_id,
      amount: expense.amount,
      payment_method: expense.payment_method || 'cash',
      expense_date: expense.expense_date,
      description: expense.description || '',
    }
  } else {
    editingId.value = null
    form.value = { expense_category_id: '', amount: '', payment_method: 'cash', expense_date: new Date().toLocaleDateString('en-CA'), description: '' }
  }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingId.value = null
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const monthlyTotal = () => expenses.value.reduce((s, e) => s + Number(e.amount), 0)

// Live search with a small debounce so we don't fire a request per keystroke
let searchTimer = null
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 350)
})

onMounted(() => { load(); loadCategories() })
</script>

<template>
  <div class="p-4 sm:p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold text-gray-900">Expenses</h1>
      <button class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700" @click="openForm()">
        + Log Expense
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-4">
      <div class="relative flex items-center w-full sm:w-auto">
        <DatePicker
          v-model="dateRange"
          selection-mode="range"
          :manual-input="false"
          date-format="M dd, yy"
          show-icon
          icon-display="input"
          placeholder="Date range…"
          class="reports-datepicker w-full sm:w-auto"
          @update:model-value="(v) => { if (!v || (v[0] && v[1])) load() }"
        />
        <button
          v-if="dateRange"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors leading-none"
          style="font-size: 16px; line-height: 1;"
          @click.stop="dateRange = null; load()"
        >×</button>
      </div>
      <select v-model="filterCat" class="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm" @change="load">
        <option value="">All categories</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="relative w-full sm:w-auto sm:flex-none sm:ml-auto">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          v-model="search"
          type="search"
          placeholder="Search description or category…"
          class="w-full sm:w-64 border border-gray-300 rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>
    </div>

    <!-- Total -->
    <div v-if="expenses.length" class="bg-blue-50 rounded-xl px-5 py-3 mb-4 flex justify-between items-center">
      <span class="text-sm text-blue-700">Total shown</span>
      <span class="font-bold text-blue-900">₱{{ fmt(monthlyTotal()) }}</span>
    </div>

    <div v-if="loadError" class="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
      {{ loadError }}
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
      <div v-else-if="!expenses.length" class="flex items-center justify-center h-40 text-gray-400">No expenses found</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-3 sm:px-4 py-3 font-medium text-gray-600">Date</th>
            <th class="text-left px-3 sm:px-4 py-3 font-medium text-gray-600">Category</th>
            <th class="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600">Description</th>
            <th class="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600">Method</th>
            <th class="text-right px-3 sm:px-4 py-3 font-medium text-gray-600">Amount</th>
            <th class="px-3 sm:px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="e in expenses" :key="e.id">
            <td class="px-3 sm:px-4 py-3 text-gray-600 whitespace-nowrap">{{ fmtDate(e.expense_date) }}</td>
            <td class="px-3 sm:px-4 py-3 text-gray-800">
              {{ e.category?.name || '—' }}
              <div v-if="e.description" class="sm:hidden text-xs text-gray-400 mt-0.5 break-words">{{ e.description }}</div>
            </td>
            <td class="hidden sm:table-cell px-4 py-3 text-gray-500 max-w-xs truncate">{{ e.description || '—' }}</td>
            <td class="hidden sm:table-cell px-4 py-3">
              <span v-if="e.payment_method === 'gcash'" class="text-xs font-bold px-2 py-0.5 rounded-md text-white" style="background: #005eaa;">GCash</span>
              <span v-else class="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">Cash</span>
            </td>
            <td class="px-3 sm:px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
              ₱{{ fmt(e.amount) }}
              <div class="sm:hidden mt-0.5">
                <span v-if="e.payment_method === 'gcash'" class="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style="background: #005eaa;">GCash</span>
                <span v-else class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Cash</span>
              </div>
            </td>
            <td class="px-3 sm:px-4 py-3 text-right">
              <div class="flex flex-col sm:flex-row gap-1 justify-end items-end">
                <button class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1" @click="openForm(e)">Edit</button>
                <button class="text-xs text-red-500 hover:text-red-700 px-2 py-1" @click="remove(e.id)">Del</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Form modal -->
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
            <!-- Payment method toggle -->
            <div class="flex rounded-lg overflow-hidden border border-gray-300 text-sm">
              <button
                type="button"
                class="flex-1 py-2 font-medium transition-colors"
                :class="form.payment_method === 'cash' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'"
                @click="form.payment_method = 'cash'"
              >Cash</button>
              <button
                type="button"
                class="flex-1 py-2 font-medium transition-colors"
                :class="form.payment_method === 'gcash' ? 'text-white' : 'bg-white text-gray-500 hover:bg-gray-50'"
                :style="form.payment_method === 'gcash' ? 'background:#005eaa' : ''"
                @click="form.payment_method = 'gcash'"
              >GCash</button>
            </div>
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

<style scoped>
/* On mobile the date-range picker fills its full-width row */
.reports-datepicker :deep(.p-datepicker-input) {
  width: 100%;
}
@media (min-width: 640px) {
  .reports-datepicker :deep(.p-datepicker-input) {
    width: auto;
  }
}
</style>
