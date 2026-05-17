<script setup>
import { ref, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseCategories } from '@/api/expenses.js'

const toast = useToast()
const confirm = useConfirm()

const expenses = ref([])
const categories = ref([])
const loading = ref(false)
const loadError = ref('')
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const filterMonth = ref(new Date())
const filterCat = ref('')

function unwrap(res) {
  const candidates = [res.data?.expenses?.data, res.data?.data?.data, res.data?.data, res.data]
  return candidates.find(Array.isArray) ?? []
}

const form = ref({ expense_category_id: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' })

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const params = {}
    if (filterMonth.value) {
      const d = new Date(filterMonth.value)
      params.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    if (filterCat.value)   params.category_id = filterCat.value
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
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
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
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete', life: 4000 })
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
      expense_date: expense.expense_date,
      description: expense.description || '',
    }
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

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const monthlyTotal = () => expenses.value.reduce((s, e) => s + Number(e.amount), 0)

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
    <div class="flex flex-wrap gap-2 mb-4">
      <DatePicker
        v-model="filterMonth"
        view="month"
        date-format="MM yy"
        show-icon
        icon-display="input"
        placeholder="Select month"
        class="reports-datepicker"
        @update:model-value="load"
      />
      <select v-model="filterCat" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" @change="load">
        <option value="">All categories</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <!-- Total -->
    <div v-if="expenses.length" class="bg-blue-50 rounded-xl px-5 py-3 mb-4 flex justify-between items-center">
      <span class="text-sm text-blue-700">Total shown</span>
      <span class="font-bold text-blue-900">₱{{ fmt(monthlyTotal()) }}</span>
    </div>

    <div v-if="loadError" class="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
      {{ loadError }}
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
      <div v-else-if="!expenses.length" class="flex items-center justify-center h-40 text-gray-400">No expenses found</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Category</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Description</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="e in expenses" :key="e.id">
            <td class="px-4 py-3 text-gray-600">{{ fmtDate(e.expense_date) }}</td>
            <td class="px-4 py-3 text-gray-800">{{ e.category?.name || '—' }}</td>
            <td class="px-4 py-3 text-gray-500 max-w-xs truncate">{{ e.description || '—' }}</td>
            <td class="px-4 py-3 text-right font-semibold text-gray-900">₱{{ fmt(e.amount) }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex gap-1 justify-end">
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
