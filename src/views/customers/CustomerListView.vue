<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getCustomers } from '@/api/customers.js'

const router = useRouter()
const customers = ref([])
const loading = ref(false)
const search = ref('')
const page = ref(1)
const total = ref(0)
const showForm = ref(false)
const saving = ref(false)
const form = ref({ name: '', phone: '', email: '', address: '', notes: '' })

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, per_page: 20 }
    if (search.value) params.search = search.value
    const res = await getCustomers(params)
    customers.value = res.data.data || res.data
    total.value = res.data.total || customers.value.length
  } finally {
    loading.value = false
  }
}

async function saveCustomer() {
  saving.value = true
  try {
    const { createCustomer } = await import('@/api/customers.js')
    await createCustomer(form.value)
    showForm.value = false
    form.value = { name: '', phone: '', email: '', address: '', notes: '' }
    load()
  } catch (e) {
    alert(e.response?.data?.message || 'Failed to save customer')
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
      <input
        v-model="search"
        placeholder="Search by name, phone, or email…"
        class="w-full sm:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @keyup.enter="page = 1; load()"
      />
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
      <div v-else-if="!customers.length" class="flex items-center justify-center h-40 text-gray-400">No customers found</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Spent</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Visits</th>
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
            <td class="px-4 py-3 text-gray-700">{{ c.phone }}</td>
            <td class="px-4 py-3 text-gray-500">{{ c.email || '—' }}</td>
            <td class="px-4 py-3 text-right text-gray-900">₱{{ fmt(c.total_spent) }}</td>
            <td class="px-4 py-3 text-right text-gray-600">{{ c.total_visits }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- New customer modal -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 class="text-lg font-bold text-gray-900 mb-4">New Customer</h2>
          <div class="space-y-3">
            <input v-model="form.name" placeholder="Name *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.phone" placeholder="Phone *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.email" placeholder="Email (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.address" placeholder="Address (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <textarea v-model="form.notes" placeholder="Notes (optional)" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div class="flex gap-3 mt-5">
            <button class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50" @click="showForm = false">Cancel</button>
            <button
              class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
              :disabled="saving || !form.name || !form.phone"
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
