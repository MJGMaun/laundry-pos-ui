<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import { getBookings, createBooking, markBookingPickedUp, cancelBooking } from '@/api/bookings.js'
import { getOrders, updateOrder, markOrderDelivered } from '@/api/orders.js'
import { getCustomers } from '@/api/customers.js'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const tab = ref('pickups') // 'pickups' | 'deliveries'
const selectedDate = ref(new Date())

const bookings = ref([])
const deliveries = ref([])
const loadingBookings = ref(false)
const loadingDeliveries = ref(false)

// ── New Booking dialog ─────────────────────────────────────────────────────────
const showBookingDialog = ref(false)
const saving = ref(false)
const customerSearch = ref('')
const customerResults = ref([])
const searchingCustomers = ref(false)
const bookingForm = ref({
  customer_id: null,
  customer_name: '',
  scheduled_at: null,
  address: '',
  notes: '',
})

// ── Schedule Delivery dialog ───────────────────────────────────────────────────
const showDeliveryDialog = ref(false)
const deliveryOrder = ref(null)
const deliveryForm = ref({ delivery_scheduled_at: null })
const savingDelivery = ref(false)

function toYMD(d) {
  if (!d) return null
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadBookings() {
  loadingBookings.value = true
  try {
    const res = await getBookings({ date: toYMD(selectedDate.value) })
    bookings.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load pickups', life: 4000 })
  } finally {
    loadingBookings.value = false
  }
}

async function loadDeliveries() {
  loadingDeliveries.value = true
  try {
    const res = await getOrders({ delivery_date: toYMD(selectedDate.value), per_page: 100 })
    deliveries.value = (res.data.data || res.data).filter(o => o.delivery_scheduled_at)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load deliveries', life: 4000 })
  } finally {
    loadingDeliveries.value = false
  }
}

function loadAll() {
  loadBookings()
  loadDeliveries()
}

watch(selectedDate, loadAll)
onMounted(loadAll)

// ── Customer search ────────────────────────────────────────────────────────────
let searchTimer = null
watch(customerSearch, (val) => {
  clearTimeout(searchTimer)
  if (!val || val.length < 2) { customerResults.value = []; return }
  searchTimer = setTimeout(async () => {
    searchingCustomers.value = true
    try {
      const res = await getCustomers({ search: val, per_page: 10 })
      customerResults.value = res.data.data || res.data
    } catch {} finally {
      searchingCustomers.value = false
    }
  }, 300)
})

function selectCustomer(c) {
  bookingForm.value.customer_id = c.id
  bookingForm.value.customer_name = c.name
  bookingForm.value.address = c.address || ''
  customerSearch.value = c.name
  customerResults.value = []
}

function openBookingDialog() {
  bookingForm.value = { customer_id: null, customer_name: '', scheduled_at: null, address: '', notes: '' }
  customerSearch.value = ''
  customerResults.value = []
  showBookingDialog.value = true
}

async function saveBooking() {
  if (!bookingForm.value.customer_id) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please select a customer', life: 3000 })
    return
  }
  if (!bookingForm.value.scheduled_at) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please set a pickup date/time', life: 3000 })
    return
  }
  saving.value = true
  try {
    await createBooking({
      customer_id: bookingForm.value.customer_id,
      scheduled_at: bookingForm.value.scheduled_at instanceof Date
        ? bookingForm.value.scheduled_at.toISOString()
        : bookingForm.value.scheduled_at,
      address: bookingForm.value.address || null,
      notes: bookingForm.value.notes || null,
    })
    toast.add({ severity: 'success', summary: 'Booked', detail: 'Pickup scheduled', life: 3000 })
    showBookingDialog.value = false
    loadBookings()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

async function markPickedUp(booking) {
  try {
    await markBookingPickedUp(booking.id)
    booking.status = 'picked_up'
    booking.picked_up_at = new Date().toISOString()
    toast.add({ severity: 'success', summary: 'Done', detail: `Pickup confirmed for ${booking.customer?.name}`, life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
  }
}

function confirmCancel(booking) {
  confirm.require({
    message: `Cancel pickup for ${booking.customer?.name}?`,
    header: 'Cancel Booking',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'No', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Cancel Booking', severity: 'danger' },
    accept: async () => {
      try {
        await cancelBooking(booking.id)
        booking.status = 'cancelled'
        toast.add({ severity: 'info', summary: 'Cancelled', detail: 'Booking cancelled', life: 3000 })
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
      }
    },
  })
}

// ── Delivery scheduling ────────────────────────────────────────────────────────
function openScheduleDelivery(order) {
  deliveryOrder.value = order
  deliveryForm.value.delivery_scheduled_at = order.delivery_scheduled_at
    ? new Date(order.delivery_scheduled_at)
    : null
  showDeliveryDialog.value = true
}

async function saveDeliverySchedule() {
  if (!deliveryForm.value.delivery_scheduled_at) {
    toast.add({ severity: 'warn', summary: 'Required', detail: 'Please set a delivery date/time', life: 3000 })
    return
  }
  savingDelivery.value = true
  try {
    const dt = deliveryForm.value.delivery_scheduled_at instanceof Date
      ? deliveryForm.value.delivery_scheduled_at.toISOString()
      : deliveryForm.value.delivery_scheduled_at
    const res = await updateOrder(deliveryOrder.value.id, { delivery_scheduled_at: dt })
    const idx = deliveries.value.findIndex(o => o.id === deliveryOrder.value.id)
    if (idx !== -1) deliveries.value[idx] = res.data
    else deliveries.value.push(res.data)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Delivery scheduled', life: 3000 })
    showDeliveryDialog.value = false
    loadDeliveries()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
  } finally {
    savingDelivery.value = false
  }
}

async function markDelivered(order) {
  try {
    await markOrderDelivered(order.id)
    order.delivered_at = new Date().toISOString()
    toast.add({ severity: 'success', summary: 'Done', detail: `Delivered to ${order.customer?.name}`, life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
  }
}

const pendingPickups = computed(() => bookings.value.filter(b => b.status === 'scheduled'))
const donePickups = computed(() => bookings.value.filter(b => b.status !== 'scheduled'))
const pendingDeliveries = computed(() => deliveries.value.filter(o => !o.delivered_at))
const doneDeliveries = computed(() => deliveries.value.filter(o => !!o.delivered_at))
</script>

<template>
  <div class="p-5 max-w-4xl mx-auto">

    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5 animate-slide-up">
      <h1 class="text-2xl font-bold text-slate-900">Schedule</h1>
      <div class="flex items-center gap-2">
        <DatePicker
          v-model="selectedDate"
          date-format="M dd, yy"
          show-icon
          icon-display="input"
          class="schedule-datepicker"
        />
        <button
          v-if="tab === 'pickups'"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.97]"
          style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"
          @click="openBookingDialog"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Booking
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-5 w-fit animate-slide-up stagger-1">
      <button
        v-for="t in [{ key: 'pickups', label: '🚗 Pickups' }, { key: 'deliveries', label: '📦 Deliveries' }]"
        :key="t.key"
        class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
        :class="tab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'"
        @click="tab = t.key"
      >{{ t.label }}</button>
    </div>

    <!-- ── Pickups Tab ── -->
    <div v-if="tab === 'pickups'">
      <div v-if="loadingBookings" class="space-y-3">
        <div v-for="n in 3" :key="n" class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex gap-3">
            <div class="skeleton w-10 h-10 rounded-full" />
            <div class="flex-1 space-y-2">
              <div class="skeleton h-4 w-32 rounded" />
              <div class="skeleton h-3 w-48 rounded" />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!bookings.length" class="flex flex-col items-center justify-center h-48 text-slate-300 gap-2">
        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        <span class="text-sm">No pickups scheduled for this day</span>
        <button class="text-sm text-blue-500 hover:underline" @click="openBookingDialog">Schedule one</button>
      </div>

      <template v-else>
        <!-- Pending -->
        <div v-if="pendingPickups.length" class="space-y-3 mb-5 animate-slide-up stagger-2">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pending ({{ pendingPickups.length }})</p>
          <div
            v-for="booking in pendingPickups"
            :key="booking.id"
            class="bg-white border border-slate-200 rounded-2xl p-4 border-l-4 border-l-amber-400"
            style="box-shadow: var(--shadow-card);"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0">
                <div
                  class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  :style="`background: hsl(${(booking.customer?.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                >{{ booking.customer?.name?.charAt(0).toUpperCase() }}</div>
                <div class="min-w-0">
                  <button
                    class="font-semibold text-slate-800 hover:underline text-left"
                    @click="router.push('/customers/' + booking.customer?.id)"
                  >{{ booking.customer?.name }}</button>
                  <div class="flex items-center gap-1.5 mt-0.5 text-sm text-slate-500">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
                    {{ fmtTime(booking.scheduled_at) }}
                  </div>
                  <div v-if="booking.address" class="flex items-start gap-1.5 mt-0.5 text-sm text-slate-500">
                    <svg class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span class="break-words">{{ booking.address }}</span>
                  </div>
                  <div v-if="booking.notes" class="mt-1 text-xs text-slate-400 italic">{{ booking.notes }}</div>
                </div>
              </div>
              <div class="flex flex-col gap-2 shrink-0">
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-500 hover:bg-green-600 transition-colors active:scale-[0.97]"
                  @click="markPickedUp(booking)"
                >Picked Up ✓</button>
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 border border-slate-200 hover:border-red-300 hover:text-red-500 transition-colors"
                  @click="confirmCancel(booking)"
                >Cancel</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Done -->
        <div v-if="donePickups.length" class="space-y-2 animate-slide-up stagger-3">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Done ({{ donePickups.length }})</p>
          <div
            v-for="booking in donePickups"
            :key="booking.id"
            class="bg-white border border-slate-100 rounded-2xl p-4 opacity-60"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                :style="`background: hsl(${(booking.customer?.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
              >{{ booking.customer?.name?.charAt(0).toUpperCase() }}</div>
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-slate-600">{{ booking.customer?.name }}</span>
                <span class="mx-2 text-slate-300">·</span>
                <span class="text-sm text-slate-400">{{ fmtTime(booking.scheduled_at) }}</span>
                <span v-if="booking.address" class="text-sm text-slate-400"> · {{ booking.address }}</span>
              </div>
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full"
                :class="booking.status === 'picked_up' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'"
              >{{ booking.status === 'picked_up' ? '✓ Picked up' : 'Cancelled' }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Deliveries Tab ── -->
    <div v-if="tab === 'deliveries'">
      <div v-if="loadingDeliveries" class="space-y-3">
        <div v-for="n in 3" :key="n" class="bg-white border border-slate-200 rounded-2xl p-4">
          <div class="flex gap-3">
            <div class="skeleton w-10 h-10 rounded-full" />
            <div class="flex-1 space-y-2">
              <div class="skeleton h-4 w-32 rounded" />
              <div class="skeleton h-3 w-48 rounded" />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!deliveries.length" class="flex flex-col items-center justify-center h-48 text-slate-300 gap-2">
        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        <span class="text-sm">No deliveries scheduled for this day</span>
        <p class="text-xs text-slate-400">Schedule delivery from an order's detail page</p>
      </div>

      <template v-else>
        <!-- Pending deliveries -->
        <div v-if="pendingDeliveries.length" class="space-y-3 mb-5 animate-slide-up stagger-2">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pending ({{ pendingDeliveries.length }})</p>
          <div
            v-for="order in pendingDeliveries"
            :key="order.id"
            class="bg-white border border-slate-200 rounded-2xl p-4 border-l-4 border-l-blue-400"
            style="box-shadow: var(--shadow-card);"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0">
                <div
                  class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  :style="`background: hsl(${(order.customer?.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                >{{ order.customer?.name?.charAt(0).toUpperCase() }}</div>
                <div class="min-w-0">
                  <button
                    class="font-semibold text-slate-800 hover:underline text-left"
                    @click="router.push('/orders/' + order.id)"
                  >{{ order.order_number }}</button>
                  <div class="text-sm text-slate-500">{{ order.customer?.name }}</div>
                  <div class="flex items-center gap-1.5 mt-0.5 text-sm text-slate-500">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
                    {{ fmtTime(order.delivery_scheduled_at) }}
                  </div>
                  <div v-if="order.customer?.address" class="flex items-start gap-1.5 mt-0.5 text-sm text-slate-500">
                    <svg class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span class="break-words">{{ order.customer.address }}</span>
                  </div>
                </div>
              </div>
              <div class="flex flex-col gap-2 shrink-0">
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors active:scale-[0.97]"
                  @click="markDelivered(order)"
                >Delivered ✓</button>
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 border border-slate-200 hover:border-slate-300 transition-colors"
                  @click="router.push('/orders/' + order.id)"
                >View Order</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Done deliveries -->
        <div v-if="doneDeliveries.length" class="space-y-2 animate-slide-up stagger-3">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Done ({{ doneDeliveries.length }})</p>
          <div
            v-for="order in doneDeliveries"
            :key="order.id"
            class="bg-white border border-slate-100 rounded-2xl p-4 opacity-60"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                :style="`background: hsl(${(order.customer?.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
              >{{ order.customer?.name?.charAt(0).toUpperCase() }}</div>
              <div class="flex-1 min-w-0">
                <button
                  class="text-sm font-medium text-slate-600 hover:underline"
                  @click="router.push('/orders/' + order.id)"
                >{{ order.order_number }}</button>
                <span class="mx-2 text-slate-300">·</span>
                <span class="text-sm text-slate-400">{{ order.customer?.name }}</span>
                <span class="mx-2 text-slate-300">·</span>
                <span class="text-sm text-slate-400">{{ fmtTime(order.delivery_scheduled_at) }}</span>
              </div>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">✓ Delivered</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ── New Booking Dialog ── -->
    <Dialog
      v-model:visible="showBookingDialog"
      header="Schedule Pickup"
      modal
      :style="{ width: '22rem' }"
      :pt="{ root: { class: 'rounded-2xl' } }"
    >
      <div class="space-y-4 pt-1">

        <!-- Customer search -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Customer</label>
          <div class="relative">
            <input
              v-model="customerSearch"
              placeholder="Search customer name or phone…"
              class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              autocomplete="off"
            />
            <div v-if="searchingCustomers" class="absolute right-3 top-1/2 -translate-y-1/2">
              <svg class="w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            </div>
            <div
              v-if="customerResults.length"
              class="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
            >
              <button
                v-for="c in customerResults"
                :key="c.id"
                class="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                @click="selectCustomer(c)"
              >
                <div
                  class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  :style="`background: hsl(${(c.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                >{{ c.name?.charAt(0).toUpperCase() }}</div>
                <div>
                  <div class="text-sm font-medium text-slate-800">{{ c.name }}</div>
                  <div v-if="c.phone" class="text-xs text-slate-400">{{ c.phone }}</div>
                </div>
              </button>
            </div>
          </div>
          <div v-if="bookingForm.customer_id" class="mt-1.5 text-xs text-green-600 font-medium">✓ {{ bookingForm.customer_name }}</div>
        </div>

        <!-- Scheduled date+time -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Pickup Date & Time</label>
          <DatePicker
            v-model="bookingForm.scheduled_at"
            show-time
            hour-format="12"
            date-format="M dd, yy"
            show-icon
            icon-display="input"
            :min-date="new Date()"
            class="booking-datepicker w-full"
            placeholder="Select date and time…"
          />
        </div>

        <!-- Address -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Pickup Address</label>
          <input
            v-model="bookingForm.address"
            placeholder="Customer's address…"
            class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
          <textarea
            v-model="bookingForm.notes"
            rows="2"
            placeholder="Any special instructions…"
            class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        <div class="flex gap-2 pt-1">
          <button
            class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            @click="showBookingDialog = false"
          >Cancel</button>
          <button
            class="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style="background: linear-gradient(135deg, #6366f1, #8b5cf6);"
            :disabled="saving"
            @click="saveBooking"
          >{{ saving ? 'Saving…' : 'Schedule Pickup' }}</button>
        </div>
      </div>
    </Dialog>

  </div>
</template>

<style>
.schedule-datepicker .p-datepicker-input,
.booking-datepicker .p-datepicker-input {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 6px 28px 6px 12px;
  font-size: 14px;
  color: #1e293b;
  width: 100%;
}
.schedule-datepicker .p-datepicker-input:focus,
.booking-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
