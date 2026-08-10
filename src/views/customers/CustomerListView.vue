<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getCustomers } from '@/api/customers.js'
import { isOfflineError } from '@/offline/isOfflineError.js'
import { db } from '@/offline/db.js'
import { useBranchStore } from '@/stores/branch.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSettingsStore } from '@/stores/settings.js'

const router = useRouter()
const toast = useToast()
const branch = useBranchStore()
const auth = useAuthStore()
const settings = useSettingsStore()

// Cashiers/staff can search for a customer but not browse the whole list;
// admins get the full paginated list.
const canBrowse = auth.isAdmin

const customers = ref([])
const loading = ref(false)
const search = ref('')
const page = ref(1)
const total = ref(0)
const lastPage = ref(1)
let searchTimer = null
const showForm = ref(false)
const saving = ref(false)
const form = ref({ name: '', username: '', phone: '', email: '', address: '', notes: '' })
const displayPhone = ref('')
const usernameManual = ref(false)

function onPhoneInput(e) {
  const raw = e.target.value.replace(/\D/g, '').slice(0, 11)
  form.value.phone = raw
  if (raw.length <= 4) displayPhone.value = raw
  else if (raw.length <= 7) displayPhone.value = raw.slice(0, 4) + '-' + raw.slice(4)
  else displayPhone.value = raw.slice(0, 4) + '-' + raw.slice(4, 7) + '-' + raw.slice(7)
}

function capitalizeFirst(field) {
  if (form.value[field]) {
    form.value[field] = form.value[field].replace(/\b\w/g, c => c.toUpperCase())
  }
  if (field === 'name' && !usernameManual.value) {
    form.value.username = form.value.name.toLowerCase().replace(/\s+/g, '')
  }
}

async function load() {
  // Search-only mode: no query yet → show nothing instead of the full list.
  if (!canBrowse && !search.value.trim()) {
    customers.value = []
    total.value = 0
    lastPage.value = 1
    return
  }
  loading.value = true
  try {
    const params = { page: page.value, per_page: 20 }
    if (search.value) params.search = search.value
    const res = await getCustomers(params)
    customers.value = res.data.data || res.data
    total.value = res.data.total || customers.value.length
    lastPage.value = res.data.last_page || 1
  } catch (e) {
    if (!isOfflineError(e)) throw e
    const branchId = branch.currentBranchId ? Number(branch.currentBranchId) : null
    let cached = branchId
      ? await db.customers.where('branch_id').equals(branchId).toArray()
      : await db.customers.toArray()
    if (!cached.length) cached = await db.customers.toArray()
    if (search.value) {
      const q = search.value.toLowerCase()
      cached = cached.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
    }
    cached.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    customers.value = cached
    total.value = cached.length
    lastPage.value = 1 // offline cache is a single unpaginated list
  } finally {
    loading.value = false
  }
}

// Search as you type (debounced) resets to page 1; page changes reload.
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 350)
})
watch(page, load)

async function saveCustomer() {
  saving.value = true
  try {
    const { createCustomer } = await import('@/api/customers.js')
    await createCustomer(form.value)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Customer created successfully', life: 3000 })
    showForm.value = false
    form.value = { name: '', username: '', phone: '', email: '', address: '', notes: '' }
    displayPhone.value = ''
    usernameManual.value = false
    load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save customer', life: 4000 })
  } finally {
    saving.value = false
  }
}

function fmt(n) {
  return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold text-gray-900">Customers</h1>
      <button
        class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
        @click="showForm = true"
      >
        + New Customer
      </button>
    </div>

    <div class="mb-4">
      <div class="flex items-center gap-3">
        <input
          v-model="search"
          placeholder="Search by name or phone…"
          class="w-full sm:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span v-if="total" class="text-xs text-gray-400 shrink-0">{{ total }} customer{{ total !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
      <div v-else-if="!customers.length && !canBrowse && !search.trim()" class="flex flex-col items-center justify-center h-40 gap-1 text-gray-400">
        <span class="text-2xl">🔍</span>
        <span class="text-sm">Search by name or phone to find a customer</span>
      </div>
      <div v-else-if="!customers.length" class="flex items-center justify-center h-40 text-gray-400">No customers found</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
            <th class="hidden md:table-cell text-left px-4 py-3 font-medium text-gray-600">Username</th>
            <th class="hidden sm:table-cell text-right px-4 py-3 font-medium text-gray-600">Total Spent</th>
            <th class="hidden sm:table-cell text-right px-4 py-3 font-medium text-gray-600">Visits</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr
            v-for="c in customers"
            :key="c.id"
            class="hover:bg-gray-50 cursor-pointer"
            @click="router.push('/customers/' + c.id)"
          >
            <td class="px-4 py-3 font-medium text-gray-900">{{ c.name }}</td>
            <td class="px-4 py-3" :class="c.phone ? 'text-gray-700' : 'text-gray-300'">{{ c.phone || '—' }}</td>
            <td class="hidden md:table-cell px-4 py-3 text-gray-500">{{ c.username || '—' }}</td>
            <td class="hidden sm:table-cell px-4 py-3 text-right text-gray-900">₱{{ fmt(c.total_spent) }}</td>
            <td class="hidden sm:table-cell px-4 py-3 text-right text-gray-600">{{ c.total_visits }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="lastPage > 1" class="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
          :disabled="page <= 1 || loading"
          @click="page--"
        >← Prev</button>
        <span class="text-xs text-gray-400">Page {{ page }} of {{ lastPage }}</span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-all"
          :disabled="page >= lastPage || loading"
          @click="page++"
        >Next →</button>
      </div>
    </div>

    <!-- New customer modal -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 class="text-lg font-bold text-gray-900 mb-4">New Customer</h2>
          <div class="space-y-3">
            <input v-model="form.name" @input="capitalizeFirst('name')" placeholder="Name *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input :value="displayPhone" @input="onPhoneInput" :placeholder="settings.customerPhoneRequired ? 'Phone *' : 'Phone (optional)'" maxlength="13" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.username" @input="usernameManual = true" placeholder="Username (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.email" placeholder="Email (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.address" @input="capitalizeFirst('address')" placeholder="Address (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <textarea v-model="form.notes" placeholder="Notes (optional)" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div class="flex gap-3 mt-5">
            <button class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50" @click="showForm = false; usernameManual = false">Cancel</button>
            <button
              class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
              :disabled="saving || !form.name || (settings.customerPhoneRequired && !form.phone)"
              @click="saveCustomer"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
