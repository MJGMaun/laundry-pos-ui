<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getCustomer, updateCustomer } from '@/api/customers.js'
import { getOrders } from '@/api/orders.js'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const customer = ref(null)
const orders = ref([])
const loading = ref(true)
const editing = ref(false)
const form = ref({})
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const [custRes, ordersRes] = await Promise.all([
      getCustomer(route.params.id),
      getOrders({ customer_id: route.params.id, per_page: 20 }),
    ])
    customer.value = custRes.data.data || custRes.data
    orders.value = ordersRes.data.data || ordersRes.data
    form.value = { name: customer.value.name, username: customer.value.username || '', phone: customer.value.phone, email: customer.value.email || '', address: customer.value.address || '', notes: customer.value.notes || '' }
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await updateCustomer(customer.value.id, form.value)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Customer updated successfully', life: 3000 })
    editing.value = false
    load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to update', life: 4000 })
  } finally {
    saving.value = false
  }
}

function fmt(n) {
  return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-4xl mx-auto">
    <div class="flex items-center gap-3 mb-5">
      <button class="text-gray-500 hover:text-gray-700 p-1" @click="router.back()">← Back</button>
      <h1 class="text-xl font-bold text-gray-900">Customer Detail</h1>
    </div>

    <div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

    <div v-else-if="customer" class="space-y-4">
      <!-- Customer info card -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-xl font-bold text-gray-900">{{ customer.name }}</h2>
            <div class="text-sm text-gray-500 mt-0.5">{{ customer.phone }}{{ customer.username ? ' · @' + customer.username : '' }}{{ customer.email ? ' · ' + customer.email : '' }}</div>
            <div v-if="customer.address" class="text-sm text-gray-500 mt-0.5">{{ customer.address }}</div>
            <div v-if="customer.notes" class="text-sm text-gray-400 mt-1 italic">{{ customer.notes }}</div>
            <div v-if="customer.loyalty_tier" class="mt-1">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                {{ customer.loyalty_tier?.name || 'Bronze' }}
              </span>
            </div>
          </div>
          <button
            class="text-sm text-blue-600 hover:text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg"
            @click="editing = !editing"
          >
            {{ editing ? 'Cancel' : 'Edit' }}
          </button>
        </div>

        <!-- Edit form -->
        <div v-if="editing" class="space-y-3 border-t border-gray-200 pt-4">
          <input v-model="form.name" placeholder="Name" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input v-model="form.phone" placeholder="Phone" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input v-model="form.username" placeholder="Username (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input v-model="form.email" placeholder="Email (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input v-model="form.address" placeholder="Address" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <textarea v-model="form.notes" placeholder="Notes" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          <button
            class="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60 hover:bg-blue-700"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">{{ customer.total_visits }}</div>
            <div class="text-xs text-gray-500">Total Visits</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">₱{{ fmt(customer.total_spent) }}</div>
            <div class="text-xs text-gray-500">Total Spent</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">{{ customer.loyalty_points || 0 }}</div>
            <div class="text-xs text-gray-500">Points</div>
          </div>
        </div>
      </div>

      <!-- Order history -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200">
          <h3 class="font-semibold text-gray-900">Order History</h3>
        </div>
        <div v-if="!orders.length" class="px-5 py-8 text-sm text-center text-gray-400">No orders yet</div>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Order #</th>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Status</th>
              <th class="text-right px-5 py-2.5 font-medium text-gray-600">Total</th>
              <th class="text-left px-5 py-2.5 font-medium text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="o in orders"
              :key="o.id"
              class="hover:bg-gray-50 cursor-pointer"
              @click="router.push('/orders/' + o.id)"
            >
              <td class="px-5 py-3 font-mono text-gray-900">{{ o.order_number }}</td>
              <td class="px-5 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium capitalize bg-gray-100 text-gray-700">
                  {{ o.status?.replace('_', ' ') }}
                </span>
              </td>
              <td class="px-5 py-3 text-right font-semibold text-gray-900">₱{{ fmt(o.total_amount) }}</td>
              <td class="px-5 py-3 text-gray-500">{{ fmtDate(o.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
