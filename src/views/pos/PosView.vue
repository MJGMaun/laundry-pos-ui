<script setup>
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { useCartStore } from '@/stores/cart.js'
import { useBranchStore } from '@/stores/branch.js'
import { useQueueStore } from '@/stores/queue.js'
import { useToast } from 'primevue/usetoast'
import { getServices } from '@/api/services.js'
import { getBranchServices } from '@/api/branches.js'
import { getCustomers } from '@/api/customers.js'
import { createOrder } from '@/api/orders.js'
import { createPayment } from '@/api/payments.js'
import { getCustomerLoyalty, redeemReward as redeemRewardApi } from '@/api/loyalty.js'
import { isOfflineError } from '@/offline/isOfflineError.js'
import { db } from '@/offline/db.js'
import { useRouter } from 'vue-router'

const cart = useCartStore()
const branch = useBranchStore()
const queue = useQueueStore()
const toast = useToast()
const router = useRouter()

const allServices = ref([])
const categories = ref([])
const activeCategory = ref(null)
const loadingServices = ref(false)

const customerQuery = ref('')
const customerResults = ref([])
const searchingCustomer = ref(false)
const showNewCustomerForm = ref(false)
const newCustomer = ref({ name: '', phone: '', address: '' })
const phoneError  = ref('')
const displayPhone = ref('')

function onPhoneInput(e) {
  const raw = e.target.value.replace(/\D/g, '').slice(0, 11)
  newCustomer.value.phone = raw
  if (raw.length <= 4) displayPhone.value = raw
  else if (raw.length <= 7) displayPhone.value = raw.slice(0, 4) + '-' + raw.slice(4)
  else displayPhone.value = raw.slice(0, 4) + '-' + raw.slice(4, 7) + '-' + raw.slice(7)
}

function capitalizeCustomerName() {
  if (newCustomer.value.name) {
    newCustomer.value.name = newCustomer.value.name.replace(/\b\w/g, c => c.toUpperCase())
  }
}

function validatePhone(phone) {
  return /^\d{11}$/.test(phone)
}
const savingCustomer = ref(false)

const showPayment = ref(false)
const payments = ref([{ method: 'cash', amount: '', tendered: '', reference_number: '' }])
const paymentError = ref('')
const processingPayment = ref(false)
const payLater = ref(false)
const savedPayments = ref(null)

function enablePayLater() {
  savedPayments.value = JSON.parse(JSON.stringify(payments.value))
  payLater.value = true
  payments.value = [{ method: 'cash', amount: '', tendered: '', reference_number: '' }]
}

function disablePayLater() {
  payLater.value = false
  if (savedPayments.value) {
    payments.value = savedPayments.value
    savedPayments.value = null
  }
}

const lastOrder = ref(null)
const showSuccess = ref(false)
const lastRedeemedReward = ref(null)

const customerLoyalty = ref(null)
const selectedReward  = ref(null)

const filteredServices = computed(() => {
  const active = allServices.value.filter((s) => s.is_active !== false)
  if (!activeCategory.value) return active
  return active.filter((s) => s.category_id === activeCategory.value)
})

const serviceEmoji = (svc) => {
  const name = (svc.category?.name || '').toLowerCase()
  if (name.includes('dry')) return '👔'
  if (name.includes('press') || name.includes('iron')) return '🧹'
  if (name.includes('special')) return '✨'
  if (name.includes('express')) return '⚡'
  return '🧺'
}

const categoryEmoji = (name = '') => {
  if (name.toLowerCase().includes('dry')) return '👔'
  if (name.toLowerCase().includes('press')) return '🧹'
  if (name.toLowerCase().includes('special')) return '✨'
  if (name.toLowerCase().includes('express')) return '⚡'
  return '🧺'
}

async function loadServices() {
  loadingServices.value = true
  try {
    let services = []
    try {
      if (branch.currentBranchId) {
        try {
          const res = await getBranchServices(branch.currentBranchId)
          services = res.data.data || res.data
        } catch {
          const res = await getServices()
          services = res.data.data || res.data
        }
      } else {
        const res = await getServices()
        services = res.data.data || res.data
      }
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const branchId = branch.currentBranchId ? Number(branch.currentBranchId) : null
      services = branchId
        ? await db.services.where('branch_id').equals(branchId).toArray()
        : await db.services.toArray()
    }
    allServices.value = services
    const catMap = new Map()
    services.forEach((s) => {
      if (s.category && !catMap.has(s.category_id)) catMap.set(s.category_id, s.category)
    })
    categories.value = Array.from(catMap.values())
  } finally {
    loadingServices.value = false
  }
}

let searchTimer = null
watch(customerQuery, (val) => {
  clearTimeout(searchTimer)
  if (!val || val.length < 2) { customerResults.value = []; return }
  searchTimer = setTimeout(async () => {
    searchingCustomer.value = true
    try {
      const res = await getCustomers({ search: val, per_page: 6 })
      customerResults.value = res.data.data || res.data
    } catch (e) {
      if (!isOfflineError(e)) throw e
      const q = val.toLowerCase()
      const branchId = branch.currentBranchId ? Number(branch.currentBranchId) : null
      customerResults.value = await db.customers
        .filter((c) => {
          if (branchId && c.branch_id !== branchId) return false
          return c.name?.toLowerCase().includes(q) || c.phone?.includes(val)
        })
        .limit(6)
        .toArray()
    } finally {
      searchingCustomer.value = false
    }
  }, 300)
})

async function selectCustomer(c) {
  cart.setCustomer(c)
  cart.clearLoyaltyReward()
  customerQuery.value = ''
  customerResults.value = []
  selectedReward.value = null
  customerLoyalty.value = null
  try {
    const res = await getCustomerLoyalty(c.id)
    customerLoyalty.value = res.data
  } catch {}
}

// Auto-apply free_load rewards: pending + earned on this order
watchEffect(() => {
  const loyalty = customerLoyalty.value
  if (!loyalty || !cart.items.length) {
    cart.clearLoyaltyReward()
    selectedReward.value = null
    return
  }

  // Existing pending free_load rewards
  const existingCount = loyalty.pending_rewards.filter((r) => r.rule?.reward_type === 'free_load').length

  // Only eligible services earn stamps; ineligible ones are ignored (not blocking)
  const cartStamps = Math.floor(
    cart.items.filter((i) => i.is_loyalty_eligible).reduce((s, i) => s + Number(i.quantity), 0)
  )
  const prospective = loyalty.total_stamps + cartStamps
  const newCount = loyalty.rules
    .filter((r) => r.reward_type === 'free_load')
    .reduce((sum, rule) => {
      const prev = Math.floor(loyalty.total_stamps / rule.every_n_stamps)
      const next = Math.floor(prospective / rule.every_n_stamps)
      return sum + Math.max(0, next - prev)
    }, 0)

  const totalFreeLoads = existingCount + newCount

  if (totalFreeLoads === 0) {
    cart.clearLoyaltyReward()
    selectedReward.value = null
    return
  }

  // Discount = sum of top N unit prices, expanded by quantity
  const expandedPrices = cart.items
    .flatMap((i) => Array(Math.floor(i.quantity)).fill(i.unit_price))
    .sort((a, b) => b - a)
  const discount = expandedPrices.slice(0, totalFreeLoads).reduce((s, p) => s + p, 0)

  cart.applyLoyaltyReward({ count: totalFreeLoads }, discount)
  selectedReward.value = cart.appliedLoyaltyReward
})

async function saveNewCustomer() {
  phoneError.value = ''
  if (!validatePhone(newCustomer.value.phone)) {
    phoneError.value = 'Phone must be exactly 11 digits.'
    return
  }
  savingCustomer.value = true
  try {
    const { createCustomer } = await import('@/api/customers.js')
    const res = await createCustomer(newCustomer.value)
    selectCustomer(res.data.data || res.data)
    showNewCustomerForm.value = false
    newCustomer.value = { name: '', phone: '', address: '' }; phoneError.value = ''; displayPhone.value = ''
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save customer', life: 4000 })
  } finally {
    savingCustomer.value = false
  }
}

const paymentTotal = computed(() => payments.value.reduce((s, p) => s + Number(p.amount || 0), 0))
const remainingAfterPayments = computed(() => Math.max(0, cart.total - paymentTotal.value))

function openPayment() {
  const total = cart.total.toFixed(2)
  payments.value = [{ method: 'cash', amount: total, tendered: '0', reference_number: '' }]
  paymentError.value = ''
  payLater.value = false
  customerQuery.value = ''
  customerResults.value = []
  showNewCustomerForm.value = false
  newCustomer.value = { name: '', phone: '', address: '' }; phoneError.value = ''
  showPayment.value = true
}

function addPaymentRow() {
  payments.value.push({ method: 'gcash', amount: String(remainingAfterPayments.value.toFixed(2)), tendered: '', reference_number: '' })
}

async function processPayment() {
  if (!cart.items.length) { paymentError.value = 'Cart is empty.'; return }
  processingPayment.value = true
  paymentError.value = ''
  const clientId = crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
  try {
    const orderRes = await createOrder({
      client_id: clientId,
      customer_id: cart.customer?.id || null,
      loads: cart.items.map((i) => ({ service_id: i.service_id, quantity: i.quantity, notes: '' })),
      notes: cart.notes || '',
      pickup_fee: cart.pickupFee || 0,
      delivery_fee: cart.deliveryFee || 0,
      discount_amount: cart.loyaltyDiscount || 0,
      loyalty_free_loads: cart.appliedLoyaltyReward?.count || 0,
    })
    const order = orderRes.data.data || orderRes.data

    if (payLater.value) {
      // In pay later mode the single field is "tendered" (the down payment).
      // Validate it doesn't exceed the order total.
      const totalDown = payments.value.reduce((s, p) => s + Number(p.tendered || 0), 0)
      if (totalDown > cart.total) {
        paymentError.value = `Down payment (₱${fmt(totalDown)}) cannot exceed total of ₱${fmt(cart.total)}.`
        processingPayment.value = false
        return
      }
      // Record only rows where the cashier actually entered a down payment
      for (const p of payments.value.filter((p) => Number(p.tendered) > 0)) {
        const down = Number(p.tendered)
        const payData = { method: p.method, amount: down, type: 'payment' }
        if (p.method === 'cash') payData.tendered = down
        else payData.reference_number = p.reference_number || ''
        await createPayment(order.id, payData)
      }
    } else {
      const payableRows = payments.value.filter((p) => Number(p.amount) > 0)
      for (const p of payableRows) {
        const payData = { method: p.method, amount: Number(p.amount), type: 'payment' }
        if (p.method === 'cash') payData.tendered = Number(p.tendered) || Number(p.amount)
        else payData.reference_number = p.reference_number || ''
        await createPayment(order.id, payData)
      }
    }

    lastOrder.value = order
    lastRedeemedReward.value = cart.appliedLoyaltyReward
    cart.clear()
    customerLoyalty.value = null
    selectedReward.value = null
    showPayment.value = false
    showSuccess.value = true
  } catch (e) {
    if (isOfflineError(e)) {
      const orderData = {
        client_id: clientId,
        customer_id: cart.customer?.id || null,
        loads: cart.items.map((i) => ({ service_id: i.service_id, quantity: i.quantity, notes: '' })),
        notes: cart.notes || '',
        pickup_fee: cart.pickupFee || 0,
        delivery_fee: cart.deliveryFee || 0,
      }
      const payableRows = payments.value
        .filter((p) => Number(p.amount) > 0)
        .map((p) => {
          const pd = { method: p.method, amount: Number(p.amount), type: 'payment' }
          if (p.method === 'cash') pd.tendered = Number(p.tendered || p.amount)
          else pd.reference_number = p.reference_number || ''
          return pd
        })
      await queue.enqueueOrder(orderData, payableRows)
      cart.clear()
      showPayment.value = false
      toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Order queued — will sync when connected', life: 6000 })
    } else {
      paymentError.value = e.response?.data?.message || 'Failed to process order.'
    }
  } finally {
    processingPayment.value = false
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPrice(svc) {
  const p = Number(svc.price)
  if (svc.pricing_type === 'per_kilo') return `₱${p}/kg`
  if (svc.pricing_type === 'per_piece') return `₱${p}/pc`
  return `₱${p}`
}

const cartItemCount = computed(() => cart.items.reduce((s, i) => s + i.quantity, 0))
const inCart = (serviceId) => cart.items.some((i) => i.service_id === serviceId)

const mobileTab = ref('catalog')
const showExtras = ref(false)

onMounted(loadServices)
watch(() => branch.currentBranchId, loadServices)
</script>

<template>
  <div class="flex flex-col sm:flex-row h-full overflow-hidden">

    <!-- ───── LEFT: Service Catalog ───── -->
    <div
      class="flex flex-col bg-slate-50 min-h-0 overflow-hidden sm:flex-1 sm:min-w-0"
      :class="mobileTab === 'catalog' ? 'flex flex-1 min-w-0 pb-14 sm:pb-0' : 'hidden sm:flex'"
    >

      <!-- Category tabs -->
      <div class="flex items-center gap-1.5 px-4 py-3 bg-white border-b border-slate-200 overflow-x-auto shrink-0" style="scrollbar-width: none;">
        <button
          class="cat-tab"
          :class="activeCategory === null ? 'cat-tab-active' : 'cat-tab-inactive'"
          @click="activeCategory = null"
        >
          All
        </button>
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="cat-tab"
          :class="activeCategory === cat.id ? 'cat-tab-active' : 'cat-tab-inactive'"
          @click="activeCategory = cat.id"
        >
          {{ categoryEmoji(cat.name) }} {{ cat.name }}
        </button>
      </div>

      <!-- Service grid -->
      <div class="flex-1 min-h-0 overflow-y-auto p-4">

        <!-- Skeleton loading -->
        <div v-if="loadingServices" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div v-for="n in 8" :key="n" class="skeleton h-24 rounded-2xl" />
        </div>

        <div v-else-if="!filteredServices.length" class="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
          <span class="text-4xl">🧺</span>
          <span class="text-sm">No services in this category</span>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <button
            v-for="(svc, i) in filteredServices"
            :key="svc.id"
            class="service-card animate-scale-in"
            :class="inCart(svc.id) ? 'service-card-active' : ''"
            :style="`animation-delay: ${i * 20}ms`"
            @click="cart.addItem(svc)"
          >
            <div class="service-card-emoji">{{ serviceEmoji(svc) }}</div>
            <div class="text-left min-w-0 w-full">
              <div class="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{{ svc.name }}</div>
              <div class="text-xs font-bold mt-1" style="color: #2563eb;">{{ formatPrice(svc) }}</div>
            </div>

            <!-- Loyalty stamp indicator -->
            <div v-if="svc.is_loyalty_eligible" class="absolute top-1.5 left-1.5 text-[10px] leading-none" title="Earns loyalty stamps">🎫</div>

            <!-- In-cart indicator -->
            <div v-if="inCart(svc.id)" class="service-card-check">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
              </svg>
            </div>

            <!-- Add ripple overlay -->
            <div class="service-card-ripple" />
          </button>
        </div>
      </div>
    </div>

    <!-- ───── RIGHT: Cart ───── -->
    <div
      class="flex flex-col bg-white border-l border-slate-200 min-h-0 overflow-hidden sm:w-72 lg:w-80 xl:w-96 sm:shrink-0"
      :class="mobileTab === 'cart' ? 'flex flex-1 pb-14 sm:pb-0' : 'hidden sm:flex'"
    >

      <!-- Customer section -->
      <div class="shrink-0 p-3 border-b border-slate-100">
        <div v-if="cart.customer" class="space-y-2">
          <div class="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 animate-scale-in">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
              {{ cart.customer.name?.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-slate-900 truncate">{{ cart.customer.name }}</div>
              <div class="text-xs text-slate-500">{{ cart.customer.phone }}</div>
            </div>
            <button class="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"
              @click="cart.setCustomer(null); customerLoyalty = null; selectedReward = null">✕</button>
          </div>

          <!-- Stamp card -->
          <div v-if="customerLoyalty" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
            <!-- Progress per rule -->
            <div v-for="rule in customerLoyalty.rules" :key="rule.id" class="space-y-1">
              <div class="flex justify-between items-center">
                <span class="text-xs text-slate-500">{{ rule.reward_description }}</span>
                <span class="text-xs font-semibold text-slate-700">
                  {{ customerLoyalty.total_stamps % rule.every_n_stamps }}/{{ rule.every_n_stamps }}
                </span>
              </div>
              <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500"
                  style="background: linear-gradient(90deg, #3b82f6, #6366f1);"
                  :style="`width: ${((customerLoyalty.total_stamps % rule.every_n_stamps) / rule.every_n_stamps) * 100}%`" />
              </div>
            </div>

            <!-- Pending rewards -->
            <div v-if="customerLoyalty.pending_rewards.length" class="pt-1 space-y-1">
              <div class="text-xs font-semibold text-slate-500">Available rewards</div>
              <button
                v-for="reward in customerLoyalty.pending_rewards"
                :key="reward.id"
                class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs font-medium transition-all"
                :class="selectedReward?.id === reward.id
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'"
                @click="selectedReward = selectedReward?.id === reward.id ? null : reward"
              >
                <span>🎁</span>
                <span class="flex-1 truncate">{{ reward.rule?.reward_description }}</span>
                <span v-if="selectedReward?.id === reward.id" class="text-green-600 font-bold">✓ Use</span>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="space-y-2">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              v-model="customerQuery"
              placeholder="Search customer…"
              class="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <div v-if="searchingCustomer" class="absolute right-3 top-1/2 -translate-y-1/2">
              <svg class="w-3.5 h-3.5 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(59,130,246,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/></svg>
            </div>
          </div>

          <Transition name="dropdown">
            <div v-if="customerResults.length" class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <button
                v-for="c in customerResults"
                :key="c.id"
                class="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                @click="selectCustomer(c)"
              >
                <div class="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0">
                  {{ c.name?.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-slate-800 truncate">{{ c.name }}</div>
                  <div class="text-xs text-slate-400">{{ c.phone }}</div>
                </div>
              </button>
            </div>
          </Transition>

          <div class="flex items-center gap-2">
            <button class="text-xs text-blue-600 hover:text-blue-700 font-medium" @click="showNewCustomerForm = !showNewCustomerForm">
              + New customer
            </button>
          </div>

          <Transition name="dropdown">
            <div v-if="showNewCustomerForm" class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <input v-model="newCustomer.name" @input="capitalizeCustomerName" placeholder="Name *" class="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
              <div>
                <input :value="displayPhone" @input="onPhoneInput" placeholder="Phone * (11 digits)" maxlength="13"
                  class="w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all"
                  :class="phoneError ? 'border-red-300' : 'border-slate-200'" />
                <p v-if="phoneError" class="text-xs text-red-500 mt-1 px-0.5">{{ phoneError }}</p>
              </div>
              <input v-model="newCustomer.address" placeholder="Address" class="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all" />
              <div class="flex gap-2">
                <button
                  class="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50 hover:bg-blue-700 active:scale-95 transition-all"
                  :disabled="savingCustomer || !newCustomer.name || !newCustomer.phone"
                  @click="saveNewCustomer"
                >{{ savingCustomer ? 'Saving…' : 'Save' }}</button>
                <button class="text-xs text-slate-500 px-2 hover:text-slate-700" @click="showNewCustomerForm = false">Cancel</button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Cart header -->
      <div class="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cart</span>
        <span v-if="cart.items.length" class="text-xs text-slate-400">{{ cart.items.length }} item{{ cart.items.length !== 1 ? 's' : '' }}</span>
      </div>

      <!-- Cart items -->
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div v-if="!cart.items.length" class="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
          <span class="text-sm">Tap a service to add</span>
        </div>

        <TransitionGroup name="cart" tag="div" class="divide-y divide-slate-100">
          <div v-for="item in cart.items" :key="item.service_id" class="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors group">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-slate-800 truncate">{{ item.service_name }}</div>
              <div class="text-xs text-slate-400">₱{{ fmt(item.unit_price) }} × {{ item.quantity }}</div>
            </div>

            <!-- Qty control -->
            <div class="flex items-center gap-1 shrink-0">
              <button
                class="qty-btn"
                @click="cart.updateQuantity(item.service_id, item.quantity - (item.pricing_type === 'per_kilo' ? 0.5 : 1))"
              >−</button>
              <input
                :value="item.quantity"
                type="number" min="0.1" step="0.1"
                class="w-12 text-center border border-slate-200 rounded-md px-1 py-0.5 text-sm focus:outline-none focus:border-blue-400 transition-all"
                @change="cart.updateQuantity(item.service_id, Number($event.target.value))"
              />
              <button
                class="qty-btn"
                @click="cart.updateQuantity(item.service_id, item.quantity + (item.pricing_type === 'per_kilo' ? 0.5 : 1))"
              >+</button>
            </div>

            <div class="text-sm font-bold text-slate-900 w-14 text-right shrink-0">
              ₱{{ fmt(item.unit_price * item.quantity) }}
            </div>

            <button
              class="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
              @click="cart.removeItem(item.service_id)"
            >✕</button>
          </div>
        </TransitionGroup>
      </div>

      <!-- Extra fees (collapsible) -->
      <div class="shrink-0 border-t border-slate-100">
        <!-- Toggle row -->
        <button
          class="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          @click="showExtras = !showExtras"
        >
          <span class="flex items-center gap-1.5 font-medium">
            <span>Fees &amp; notes</span>
            <span
              v-if="Number(cart.pickupFee) + Number(cart.deliveryFee) > 0 || cart.notes"
              class="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-blue-500"
            />
          </span>
          <svg
            class="w-3.5 h-3.5 transition-transform duration-200"
            :class="showExtras ? 'rotate-180' : ''"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
        </button>

        <!-- Collapsible content -->
        <Transition name="dropdown">
          <div v-if="showExtras" class="px-3 pb-2.5 space-y-2">
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <span class="w-20 shrink-0">Pickup fee</span>
              <input v-model="cart.pickupFee" type="number" min="0" step="1" placeholder="0" class="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-right text-sm focus:outline-none focus:border-blue-400 transition-all" />
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <span class="w-20 shrink-0">Delivery fee</span>
              <input v-model="cart.deliveryFee" type="number" min="0" step="1" placeholder="0" class="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-right text-sm focus:outline-none focus:border-blue-400 transition-all" />
            </div>
            <textarea v-model="cart.notes" placeholder="Order notes…" rows="2" class="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:border-blue-400 transition-all" />
          </div>
        </Transition>
      </div>

      <!-- Total + Checkout -->
      <div class="shrink-0 p-3 border-t border-slate-200">
        <div class="flex justify-between text-xs text-slate-500 mb-1">
          <span>Subtotal</span><span>₱{{ fmt(cart.subtotal) }}</span>
        </div>
        <div v-if="Number(cart.pickupFee) + Number(cart.deliveryFee) > 0" class="flex justify-between text-xs text-slate-500 mb-1">
          <span>Fees</span><span>₱{{ fmt(Number(cart.pickupFee) + Number(cart.deliveryFee)) }}</span>
        </div>
        <div v-if="cart.loyaltyDiscount > 0" class="flex justify-between items-center text-xs mb-1">
          <div class="flex items-center gap-1 text-green-600 font-medium">
            <span>🎁 {{ cart.appliedLoyaltyReward?.count > 1 ? `${cart.appliedLoyaltyReward.count}× free loads` : 'Free load' }}</span>
            <button class="text-slate-300 hover:text-red-400 transition-colors leading-none"
              @click="cart.clearLoyaltyReward(); selectedReward = null">✕</button>
          </div>
          <span class="text-green-600 font-semibold">−₱{{ fmt(cart.loyaltyDiscount) }}</span>
        </div>
        <div class="flex justify-between text-base font-bold text-slate-900 mb-3">
          <span>Total</span>
          <span class="text-lg transition-all duration-200">₱{{ fmt(cart.total) }}</span>
        </div>

        <button
          class="w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
          :disabled="!cart.items.length"
          style="background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 4px 14px rgba(22,163,74,0.35);"
          :style="cart.items.length ? '' : 'box-shadow: none;'"
          @click="openPayment"
        >
          Checkout · ₱{{ fmt(cart.total) }} →
        </button>

        <button
          v-if="cart.items.length"
          class="w-full text-xs text-slate-400 hover:text-red-500 py-2 mt-1 transition-colors"
          @click="cart.clear(); customerLoyalty = null; selectedReward = null"
        >
          Clear cart
        </button>
      </div>
    </div>

    <!-- ───── Mobile Tab Bar ───── -->
    <div class="fixed bottom-0 left-0 right-0 sm:hidden flex border-t border-slate-200 bg-white z-20">
      <button
        class="flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs font-semibold transition-colors"
        :class="mobileTab === 'catalog' ? 'text-blue-600' : 'text-slate-400'"
        @click="mobileTab = 'catalog'"
      >
        <span class="text-lg leading-none">🧺</span>
        <span>Services</span>
      </button>
      <button
        class="flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs font-semibold transition-colors relative"
        :class="mobileTab === 'cart' ? 'text-blue-600' : 'text-slate-400'"
        @click="mobileTab = 'cart'"
      >
        <span class="text-lg leading-none">🛒</span>
        <span>Cart</span>
        <span
          v-if="cartItemCount > 0"
          class="absolute top-1.5 right-[calc(50%-22px)] min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
        >{{ cartItemCount }}</span>
      </button>
    </div>

    <!-- ───── Payment Modal ───── -->
    <Teleport to="body">
      <Transition name="modal-backdrop">
        <div v-if="showPayment" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style="background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);">
          <Transition name="modal">
            <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden" style="box-shadow: 0 32px 80px rgba(0,0,0,0.3);">
              <div class="px-6 pt-6 pb-4 border-b border-slate-100">
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-lg font-bold text-slate-900">Payment</h2>
                    <p class="text-sm text-slate-400 mt-0.5">Total: <span class="font-bold text-slate-800">₱{{ fmt(cart.total) }}</span></p>
                  </div>
                  <button class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors" @click="showPayment = false">✕</button>
                </div>
              </div>

              <div class="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

                <!-- Customer section -->
                <div class="space-y-2">
                  <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</div>

                  <!-- Selected customer chip -->
                  <div v-if="cart.customer" class="flex items-center gap-2.5 p-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
                    <div
                      class="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
                      :style="`background: hsl(${(cart.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                    >{{ cart.customer.name?.charAt(0).toUpperCase() }}</div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold text-slate-800 truncate">{{ cart.customer.name }}</div>
                      <div class="text-xs text-slate-500">{{ cart.customer.phone }}</div>
                    </div>
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded-full bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-xs border border-slate-200"
                      @click="cart.setCustomer(null)"
                    >✕</button>
                  </div>

                  <!-- Search when no customer -->
                  <template v-else>
                    <div class="relative">
                      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <input
                        v-model="customerQuery"
                        placeholder="Search customer by name or phone…"
                        class="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      />
                      <svg v-if="searchingCustomer" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#e2e8f0" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/></svg>
                    </div>

                    <Transition name="dropdown">
                      <div v-if="customerResults.length" class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <button
                          v-for="c in customerResults"
                          :key="c.id"
                          class="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                          @click="selectCustomer(c)"
                        >
                          <div class="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0">
                            {{ c.name?.charAt(0).toUpperCase() }}
                          </div>
                          <div class="min-w-0">
                            <div class="text-sm font-medium text-slate-800 truncate">{{ c.name }}</div>
                            <div class="text-xs text-slate-400">{{ c.phone }}</div>
                          </div>
                        </button>
                      </div>
                    </Transition>

                    <div class="flex items-center gap-2">
                      <button
                        class="text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                        @click="showNewCustomerForm = !showNewCustomerForm"
                      >{{ showNewCustomerForm ? '− Cancel' : '+ New customer' }}</button>
                    </div>

                    <Transition name="slide-down">
                      <div v-if="showNewCustomerForm" class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                        <input v-model="newCustomer.name" placeholder="Name *" class="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition-all" />
                        <div>
                          <input :value="displayPhone" @input="onPhoneInput" placeholder="Phone * (11 digits)" maxlength="13"
                            class="w-full border rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition-all"
                            :class="phoneError ? 'border-red-300' : 'border-slate-200'" />
                          <p v-if="phoneError" class="text-xs text-red-500 mt-1 px-0.5">{{ phoneError }}</p>
                        </div>
                        <input v-model="newCustomer.address" placeholder="Address" class="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition-all" />
                        <div class="flex gap-2">
                          <button
                            class="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50 hover:bg-blue-700 active:scale-95 transition-all"
                            :disabled="savingCustomer || !newCustomer.name || !newCustomer.phone"
                            @click="saveNewCustomer"
                          >{{ savingCustomer ? 'Saving…' : 'Save & Select' }}</button>
                          <button class="text-xs text-slate-500 px-3 hover:text-slate-700" @click="showNewCustomerForm = false">Cancel</button>
                        </div>
                      </div>
                    </Transition>
                  </template>
                </div>

                <div class="h-px bg-slate-100" />

                <div v-for="(p, i) in payments" :key="i" class="p-4 bg-slate-50 rounded-2xl space-y-3 animate-scale-in">
                  <div class="flex items-center gap-2">
                    <!-- Method tabs -->
                    <div class="flex gap-1 flex-1">
                      <button
                        v-for="m in ['cash','gcash','maya','card']"
                        :key="m"
                        class="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        :class="p.method === m
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'"
                        @click="p.method = m"
                      >{{ m.toUpperCase() }}</button>
                    </div>
                    <button v-if="payments.length > 1" class="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition-colors text-xs" @click="payments.splice(i, 1)">✕</button>
                  </div>

                  <!-- ── PAY LATER: single "Down payment" field ── -->
                  <template v-if="payLater">
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-slate-500 w-20 shrink-0">Down payment</span>
                      <div class="relative flex-1">
                        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                        <input
                          v-model="p.tendered"
                          type="number" step="1" min="0"
                          placeholder="0"
                          class="w-full border rounded-xl pl-7 pr-3 py-2 text-sm text-right focus:outline-none focus:ring-2 transition-all"
                          :class="Number(p.tendered) > cart.total
                            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                            : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'"
                        />
                      </div>
                    </div>
                    <!-- Over-payment warning -->
                    <div v-if="Number(p.tendered) > cart.total" class="flex items-center gap-1.5 text-xs text-red-500 font-medium px-1">
                      <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Down payment cannot exceed total of ₱{{ fmt(cart.total) }}
                    </div>
                    <!-- Quick cash buttons (cash only) -->
                    <div v-if="p.method === 'cash'" class="flex gap-1 flex-wrap">
                      <button
                        v-for="d in [20, 50, 100, 200, 500, 1000]"
                        :key="d"
                        class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all"
                        @click="p.tendered = String(Math.min(Number(p.tendered || 0) + d, cart.total))"
                      >+{{ d }}</button>
                      <button
                        class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-red-400 hover:border-red-300 hover:text-red-500 active:scale-95 transition-all"
                        @click="p.tendered = ''"
                      >Clear</button>
                    </div>
                    <!-- Digital: reference -->
                    <div v-if="p.method !== 'cash'" class="flex items-center gap-2">
                      <span class="text-xs text-slate-500 w-20 shrink-0">Ref #</span>
                      <input
                        v-model="p.reference_number"
                        placeholder="Transaction reference"
                        class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      />
                    </div>
                  </template>

                  <!-- ── NORMAL: Amount + Tendered ── -->
                  <template v-else>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-slate-500 w-16 shrink-0">Amount</span>
                      <div class="relative flex-1">
                        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                        <input
                          v-model="p.amount"
                          type="number" step="0.01" min="0"
                          class="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm text-right focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                      </div>
                    </div>

                    <!-- Cash: tendered + change -->
                    <template v-if="p.method === 'cash'">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-500 w-16 shrink-0">Tendered</span>
                        <div class="relative flex-1">
                          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                          <input
                            v-model="p.tendered"
                            type="number" step="1" min="0"
                            placeholder="Amount given"
                            class="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm text-right focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                            @focus="() => { if (!p.tendered) p.tendered = p.amount }"
                          />
                        </div>
                      </div>
                      <div class="flex gap-1 flex-wrap">
                        <button
                          v-for="d in [20, 50, 100, 200, 500, 1000]"
                          :key="d"
                          class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 active:scale-95 transition-all"
                          @click="p.tendered = String(Number(p.tendered || 0) + d)"
                        >+{{ d }}</button>
                        <button
                          class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-red-400 hover:border-red-300 hover:text-red-500 active:scale-95 transition-all"
                          @click="p.tendered = ''"
                        >Clear</button>
                      </div>
                      <Transition name="scale-in">
                        <div
                          v-if="Number(p.tendered) >= Number(p.amount) && Number(p.amount) > 0"
                          class="flex items-center justify-between px-3 py-2 rounded-xl"
                          style="background: linear-gradient(135deg, #dcfce7, #bbf7d0);"
                        >
                          <span class="text-sm font-medium text-green-700">Change</span>
                          <span class="text-lg font-bold text-green-700">₱{{ fmt(Number(p.tendered) - Number(p.amount)) }}</span>
                        </div>
                      </Transition>
                    </template>

                    <!-- Digital: reference -->
                    <div v-else class="flex items-center gap-2">
                      <span class="text-xs text-slate-500 w-16 shrink-0">Ref #</span>
                      <input
                        v-model="p.reference_number"
                        placeholder="Transaction reference"
                        class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                      />
                    </div>
                  </template>
                </div>

                <!-- Split payment button (not shown in pay later mode) -->
                <button
                  v-if="!payLater && remainingAfterPayments > 0.01"
                  class="w-full text-sm text-blue-600 font-medium py-2.5 border-2 border-dashed border-blue-200 rounded-2xl hover:bg-blue-50 hover:border-blue-300 transition-all active:scale-[0.98]"
                  @click="addPaymentRow"
                >
                  + Split payment (₱{{ fmt(remainingAfterPayments) }} remaining)
                </button>

                <Transition name="shake">
                  <div v-if="paymentError" class="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    {{ paymentError }}
                  </div>
                </Transition>
              </div>

              <div class="px-6 py-4 border-t border-slate-100 space-y-2">
                <div class="flex gap-3">
                  <button class="flex-1 py-3 rounded-2xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all" @click="showPayment = false">Cancel</button>
                  <button
                    class="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50"
                    :disabled="processingPayment"
                    style="background: linear-gradient(135deg, #16a34a, #15803d); box-shadow: 0 4px 14px rgba(22,163,74,0.35);"
                    @click="processPayment"
                  >
                    <span v-if="!processingPayment">{{ payLater ? '✓ Create Order (Pay Later)' : '✓ Confirm Payment' }}</span>
                    <span v-else class="flex items-center justify-center gap-2">
                      <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
                      Processing…
                    </span>
                  </button>
                </div>
                <button
                  v-if="!payLater"
                  class="w-full py-2.5 rounded-2xl text-sm font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-dashed border-slate-200 transition-all active:scale-[0.98]"
                  :disabled="processingPayment"
                  @click="enablePayLater"
                >
                  Pay later — create order without payment
                </button>
                <div v-else class="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
                  <span>Order will be created unpaid</span>
                  <button class="text-amber-500 hover:text-amber-700 transition-colors" @click="disablePayLater">Undo</button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- ───── Success Modal ───── -->
    <Teleport to="body">
      <Transition name="modal-backdrop">
        <div v-if="showSuccess" class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);">
          <Transition name="modal">
            <div class="bg-white rounded-3xl w-full max-w-sm p-8 text-center" style="box-shadow: 0 32px 80px rgba(0,0,0,0.3);">
              <div class="success-icon-wrapper">
                <div class="success-ring" />
                <div class="success-icon animate-bounce-in">✓</div>
              </div>
              <h2 class="text-xl font-bold text-slate-900 mt-4 mb-1">Order Placed!</h2>
              <p class="text-sm text-slate-400 font-mono">{{ lastOrder?.order_number }}</p>
              <div v-if="lastOrder?.customer" class="mt-2 text-sm text-slate-500">
                {{ lastOrder.customer?.name || cart.customer?.name }}
              </div>
              <div v-if="lastRedeemedReward" class="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                🎁 {{ lastRedeemedReward.count > 1 ? `${lastRedeemedReward.count} free loads redeemed` : '1 free load redeemed' }}
              </div>
              <div class="flex gap-2 mt-6">
                <button
                  class="flex-1 py-3 rounded-2xl font-semibold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
                  @click="() => { showSuccess = false; router.push('/orders/' + lastOrder?.id) }"
                >
                  View Order
                </button>
                <button
                  class="flex-1 py-3 rounded-2xl font-bold text-sm text-white active:scale-[0.98] transition-all"
                  style="background: linear-gradient(135deg, #3b82f6, #6366f1); box-shadow: 0 4px 14px rgba(99,102,241,0.35);"
                  @click="showSuccess = false"
                >
                  New Order
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Category tabs */
.cat-tab {
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 150ms ease;
  border: none;
  cursor: pointer;
}
.cat-tab-active {
  background: #2563eb;
  color: white;
  box-shadow: 0 2px 8px rgba(37,99,235,0.3);
}
.cat-tab-inactive {
  background: transparent;
  color: #64748b;
}
.cat-tab-inactive:hover {
  background: #f1f5f9;
  color: #334155;
}
.cat-tab:active { transform: scale(0.95); }

/* Service cards */
.service-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px;
  background: white;
  border-radius: 18px;
  border: 2px solid #e2e8f0;
  cursor: pointer;
  transition: all 180ms cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
  text-align: left;
}
.service-card:hover {
  border-color: #93c5fd;
  background: #f0f9ff;
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(37,99,235,0.12);
}
.service-card:active {
  transform: scale(0.96);
}
.service-card-active {
  border-color: #2563eb !important;
  background: #eff6ff !important;
}
.service-card-emoji {
  font-size: 28px;
  line-height: 1;
  transition: transform 200ms ease;
}
.service-card:hover .service-card-emoji {
  transform: scale(1.15) rotate(-5deg);
}
.service-card-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2563eb;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: bounce-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.service-card-ripple {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(37,99,235,0.08) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 150ms ease;
}
.service-card:active .service-card-ripple { opacity: 1; }

/* Qty buttons */
.qty-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f1f5f9;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #475569;
  transition: all 120ms ease;
  line-height: 1;
}
.qty-btn:hover { background: #e2e8f0; color: #0f172a; }
.qty-btn:active { transform: scale(0.88); }

/* Success icon */
.success-icon-wrapper {
  position: relative;
  width: 72px;
  height: 72px;
  margin: 0 auto;
}
.success-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid #16a34a;
  animation: pulse-ring 1.5s ease-out infinite;
}
.success-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: bold;
  color: #16a34a;
  background: #dcfce7;
  border-radius: 50%;
}
@keyframes pulse-ring {
  0%   { transform: scale(1);   opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* Transitions */
.modal-backdrop-enter-active { animation: fade-in 200ms ease both; }
.modal-backdrop-leave-active { animation: fade-in 150ms ease reverse both; }
.modal-enter-active { animation: scale-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.modal-leave-active { animation: scale-in 150ms ease reverse both; }
.dropdown-enter-active { animation: slide-down 180ms cubic-bezier(0.22,1,0.36,1) both; }
.dropdown-leave-active { animation: slide-down 120ms ease reverse both; }
.scale-in-enter-active { animation: scale-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.scale-in-leave-active { animation: scale-in 150ms ease reverse both; }
.shake-enter-active { animation: shake 350ms ease; }
.cart-enter-active { animation: cart-add 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.cart-leave-active { animation: slide-in-right 180ms ease reverse both; position: absolute; width: 100%; }
.cart-move { transition: transform 250ms ease; }

@keyframes fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-down { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes bounce-in { 0% { opacity:0; transform:scale(0.3); } 50% { transform:scale(1.08); } 100% { opacity:1; transform:none; } }
@keyframes cart-add { 0% { opacity:0; transform:scale(0.8) translateX(20px); } 60% { transform:scale(1.03) translateX(0); } 100% { opacity:1; transform:none; } }
@keyframes slide-in-right { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:none; } }
@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
@keyframes pulse-ring { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(1.6);opacity:0} }
.animate-spin { animation: spin 800ms linear infinite; }
.animate-bounce-in { animation: bounce-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes spin { to { transform: rotate(360deg); } }

.slide-down-enter-active, .slide-down-leave-active { transition: all 220ms ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 300px; }
</style>
