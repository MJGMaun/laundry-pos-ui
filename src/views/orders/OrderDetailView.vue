<script setup>
import { ref, computed, onMounted, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getOrder, updateOrderStatus, updateOrder, deleteOrder, markOrderDelivered } from '@/api/orders.js'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import { addLoads } from '@/api/loads.js'
import { getBranchServices } from '@/api/branches.js'
import { useBranchStore } from '@/stores/branch.js'
import { createPayment } from '@/api/payments.js'
import { usePrinter } from '@/composables/usePrinter.js'
import { buildTrackingSlipBytes } from '@/utils/escpos.js'
import { getCustomerLoyalty } from '@/api/loyalty.js'
import { useAuthStore } from '@/stores/auth.js'
import { useQueueStore } from '@/stores/queue.js'
import { useSettingsStore } from '@/stores/settings.js'
import { isOfflineError } from '@/offline/isOfflineError.js'
import { db } from '@/offline/db.js'
import ReceiptModal from '@/components/receipt/ReceiptModal.vue'

function cacheOrder(o) {
  db.orders.put(JSON.parse(JSON.stringify(toRaw(o)))).catch(() => {})
}

const route   = useRoute()
const router  = useRouter()
const toast   = useToast()
const confirm = useConfirm()
const auth     = useAuthStore()
const queue    = useQueueStore()
const branch   = useBranchStore()
const settings = useSettingsStore()
const printer = usePrinter()

const order = ref(null)
const loading = ref(true)
const loadError = ref('')
const updatingStatus = ref(false)
const statusError = ref('')

// Primary loads with their add-ons nested underneath (add-ons share the loads
// table but point at their parent via parent_load_id).
const primaryLoads = computed(() => {
  const loads = order.value?.loads || []
  return loads
    .filter((l) => !l.parent_load_id)
    .map((l) => ({ ...l, addons: l.addons || loads.filter((c) => c.parent_load_id === l.id) }))
})

const isPaid = computed(() => {
  if (!order.value) return false
  const paid = (order.value.payments || []).reduce((sum, p) => {
    return sum + (p.type === 'refund' ? -Number(p.amount) : Number(p.amount))
  }, 0)
  return paid >= Number(order.value.total_amount) - 0.01
})

const outstandingBalance = computed(() => {
  if (!order.value) return 0
  const paid = (order.value.payments || []).reduce((sum, p) => {
    return sum + (p.type === 'refund' ? -Number(p.amount) : Number(p.amount))
  }, 0)
  return Math.max(0, Number(order.value.total_amount) - paid)
})

// Admins can always delete; cashiers/staff only within 15 minutes of creation
const canDelete = computed(() => {
  if (!order.value) return false
  if (auth.isAdmin) return true
  const cutoff = new Date(new Date(order.value.created_at).getTime() + 15 * 60 * 1000)
  return new Date() < cutoff
})

const deletingOrder = ref(false)

function confirmDelete() {
  confirm.require({
    message: `Delete order ${order.value.order_number}? This cannot be undone.`,
    header: 'Delete Order',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      deletingOrder.value = true
      try {
        await deleteOrder(order.value.id)
        toast.add({ severity: 'success', summary: 'Order deleted', life: 3000 })
        router.replace('/orders')
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete order.', life: 4000 })
      } finally {
        deletingOrder.value = false
      }
    },
  })
}

const orderStatusNext = computed(() => order.value?.delivered_at
  ? { pending: 'ready', ready: 'completed' }
  : { pending: 'ready', ready: 'claimed', claimed: 'completed' }
)
const orderStatusPrev = computed(() => order.value?.delivered_at
  ? { ready: 'pending', completed: 'ready' }
  : { ready: 'pending', claimed: 'ready', completed: 'claimed' }
)

const statusColor = {
  pending:   { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  ready:     { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  claimed:   { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
  completed: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getOrder(route.params.id)
    order.value = res.data.data || res.data
  } catch (e) {
    if (isOfflineError(e)) {
      const cached = await db.orders.get(Number(route.params.id))
      if (cached) {
        order.value = cached
      } else {
        loadError.value = 'No cached data for this order. Load it once while online first.'
      }
    } else {
      loadError.value = e.response?.status === 404
        ? 'Order not found.'
        : e.response?.data?.message || 'Failed to load order.'
    }
  } finally {
    loading.value = false
  }
  if (order.value?.id) cacheOrder(order.value)
}

async function advanceOrderStatus() {
  const next = orderStatusNext.value[order.value.status]
  if (!next || !auth.isCashier) return
  if (next === 'completed' && !isPaid.value) {
    statusError.value = `Cannot complete — outstanding balance of ₱${fmt(outstandingBalance.value)}`
    return
  }
  statusError.value = ''
  updatingStatus.value = true
  try {
    await updateOrderStatus(order.value.id, { status: next })
    await load()
  } catch (e) {
    if (isOfflineError(e)) {
      await queue.enqueueRequest('PATCH', `/orders/${order.value.id}/status`, { status: next })
      order.value = { ...order.value, status: next }
      cacheOrder(order.value)
      toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Status update queued — will sync when connected', life: 5000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
    }
  } finally {
    updatingStatus.value = false
  }
}

function revertOrderStatus() {
  const prev = orderStatusPrev.value[order.value.status]
  if (!prev || !auth.isAdmin) return
  confirm.require({
    message: `Revert status from "${order.value.status}" back to "${prev}"?`,
    header: 'Undo Status',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Undo', severity: 'danger' },
    accept: async () => {
      updatingStatus.value = true
      try {
        await updateOrderStatus(order.value.id, { status: prev })
        await load()
      } catch (e) {
        if (isOfflineError(e)) {
          await queue.enqueueRequest('PATCH', `/orders/${order.value.id}/status`, { status: prev })
          order.value = { ...order.value, status: prev }
          cacheOrder(order.value)
          toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Status revert queued — will sync when connected', life: 5000 })
        } else {
          toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to revert status', life: 4000 })
        }
      } finally {
        updatingStatus.value = false
      }
    },
  })
}

const showPaymentForm = ref(false)
const savingPayment = ref(false)
const paymentFormError = ref('')
const newPayment = ref({ method: 'cash', amount: '', tendered: '', reference_number: '' })

function openPaymentForm() {
  newPayment.value = { method: 'cash', amount: String(outstandingBalance.value.toFixed(2)), tendered: '', reference_number: '', showCustom: false }
  paymentFormError.value = ''
  showPaymentForm.value = true
}

async function recordPayment() {
  if (savingPayment.value) return
  if (!(Number(newPayment.value.amount) > 0)) { paymentFormError.value = 'Enter an amount.'; return }
  savingPayment.value = true
  paymentFormError.value = ''
  try {
    const p = newPayment.value
    const payData = { method: p.method, amount: Number(p.amount), type: 'payment' }
    if (p.method === 'cash') payData.tendered = Number(p.tendered || p.amount)
    else payData.reference_number = p.reference_number || ''
    await createPayment(order.value.id, payData)
    showPaymentForm.value = false
    await load()
    if (isPaid.value && order.value.status === 'claimed') {
      await updateOrderStatus(order.value.id, { status: 'completed' })
      await load()
    }
  } catch (e) {
    if (isOfflineError(e)) {
      const p = newPayment.value
      const payData = { method: p.method, amount: Number(p.amount), type: 'payment' }
      if (p.method === 'cash') payData.tendered = Number(p.tendered || p.amount)
      else payData.reference_number = p.reference_number || ''
      await queue.enqueueRequest('POST', `/orders/${order.value.id}/payments`, payData)
      const covers = Number(p.amount) >= outstandingBalance.value - 0.01
      if (covers && order.value.status === 'claimed') {
        await queue.enqueueRequest('PATCH', `/orders/${order.value.id}/status`, { status: 'completed' })
      }
      const updatedOrder = {
        ...order.value,
        payments: [...(order.value.payments || []), { ...payData, id: Date.now() }],
        ...(covers && order.value.status === 'claimed' ? { status: 'completed' } : {}),
      }
      order.value = updatedOrder
      cacheOrder(updatedOrder)
      showPaymentForm.value = false
      toast.add({ severity: 'warn', summary: 'Saved offline', detail: 'Payment queued — will sync when connected', life: 5000 })
    } else {
      paymentFormError.value = e.response?.data?.message || 'Failed to record payment.'
    }
  } finally {
    savingPayment.value = false
  }
}


const showAddLoads  = ref(false)
const addLoadsRows    = ref([])
const addLoadsError   = ref('')
const savingLoads     = ref(false)
const services        = ref([])
const addLoadsLoyalty = ref(null)
const addLoadsActiveCat = ref(null)

const addLoadsCategories = computed(() => {
  const map = new Map()
  services.value.forEach((s) => {
    if (s.category && !map.has(s.category_id))
      map.set(s.category_id, s.category)
  })
  return [...map.values()]
})

const addLoadsFiltered = computed(() => {
  const svcs = services.value
  if (!addLoadsActiveCat.value) return svcs
  return svcs.filter((s) => s.category_id === addLoadsActiveCat.value)
})

let nextAddUid = 1

const isAddon = (svc) => (svc.category?.load_rule ?? svc.load_rule) === 'none'
const isMeasured = (svc) => svc.pricing_type === 'per_kilo' || svc.pricing_type === 'per_piece'

// Non-add-on (primary) catalog row helpers — keyed by service_id (measured only).
function catalogQty(svcId) {
  return addLoadsRows.value.find((r) => !r.is_addon && r.service_id === svcId)?.quantity ?? 0
}

// Number of separate flat-rate loads queued for a service.
function catalogLoadCount(svcId) {
  return addLoadsRows.value.filter((r) => !r.is_addon && r.service_id === svcId).length
}

function catalogStep(svc) {
  return svc.pricing_type === 'per_kilo' ? 0.5 : 1
}

function catalogSet(svc, qty) {
  const idx = addLoadsRows.value.findIndex((r) => !r.is_addon && r.service_id === svc.id)
  if (qty <= 0) {
    if (idx !== -1) addLoadsRows.value.splice(idx, 1)
  } else if (idx !== -1) {
    addLoadsRows.value[idx].quantity = qty
  } else {
    addLoadsRows.value.push({ uid: nextAddUid++, service_id: svc.id, quantity: qty, is_addon: false, parent_load_id: null, parent_uid: null })
  }
}

// Add-ons: total qty across all parents for a service (for the card badge).
function catalogAddonCount(svcId) {
  return addLoadsRows.value.filter((r) => r.is_addon && r.service_id === svcId).reduce((s, r) => s + r.quantity, 0)
}

// Valid parents = existing primary loads on the order + new primary rows in this
// batch, with duplicate service names numbered (Wash #1, Wash #2).
const addLoadsParents = computed(() => {
  const list = []
  primaryLoads.value.forEach((l) => list.push({ ref: 'e' + l.id, name: l.service_name_snapshot, parent_load_id: l.id, parent_uid: null, isNew: false }))
  addLoadsRows.value.filter((r) => !r.is_addon).forEach((r) =>
    list.push({ ref: 'n' + r.uid, name: services.value.find((s) => s.id === r.service_id)?.name || 'New load', parent_load_id: null, parent_uid: r.uid, isNew: true }))

  const counts = {}
  list.forEach((p) => { counts[p.name] = (counts[p.name] || 0) + 1 })
  const seen = {}
  list.forEach((p) => {
    if (counts[p.name] > 1) {
      seen[p.name] = (seen[p.name] || 0) + 1
      p.label = `${p.name} #${seen[p.name]}`
    } else {
      p.label = p.name
    }
  })
  return list
})

function addAddonRow(svc, parent) {
  const existing = addLoadsRows.value.find(
    (r) => r.is_addon && r.service_id === svc.id && r.parent_load_id === parent.parent_load_id && r.parent_uid === parent.parent_uid,
  )
  if (existing) existing.quantity += 1
  else addLoadsRows.value.push({ uid: nextAddUid++, service_id: svc.id, quantity: 1, is_addon: true, parent_load_id: parent.parent_load_id, parent_uid: parent.parent_uid })
}

const showAddLoadsParent = ref(false)
const addLoadsAddonSvc = ref(null)

function onCatalogTap(svc) {
  if (!isAddon(svc)) {
    if (isMeasured(svc)) {
      if (!catalogQty(svc.id)) catalogSet(svc, catalogStep(svc))
    } else {
      // Flat-rate: each tap adds a separate load.
      addLoadsRows.value.push({ uid: nextAddUid++, service_id: svc.id, quantity: 1, is_addon: false, parent_load_id: null, parent_uid: null })
    }
    return
  }
  const parents = addLoadsParents.value
  if (!parents.length) {
    toast.add({ severity: 'warn', summary: 'Add a load first', detail: 'Add a wash/dry before add-ons.', life: 3000 })
    return
  }
  if (parents.length === 1) {
    addAddonRow(svc, parents[0])
    return
  }
  addLoadsAddonSvc.value = svc
  showAddLoadsParent.value = true
}

function chooseAddLoadsParent(parent) {
  if (addLoadsAddonSvc.value) addAddonRow(addLoadsAddonSvc.value, parent)
  showAddLoadsParent.value = false
  addLoadsAddonSvc.value = null
}

function removeAddRow(row) {
  // Removing a primary row drops its add-on rows too.
  addLoadsRows.value = addLoadsRows.value.filter((r) => r.uid !== row.uid && r.parent_uid !== row.uid)
}

// Add-ons already on a parent: existing ones saved on the order + ones queued in this batch.
function parentAddonSummary(parent) {
  const names = []
  if (parent.parent_load_id) {
    const l = primaryLoads.value.find((x) => x.id === parent.parent_load_id)
    ;(l?.addons || []).forEach((a) => names.push(a.service_name_snapshot + (a.quantity > 1 ? ' ×' + a.quantity : '')))
  }
  addLoadsRows.value
    .filter((r) => r.is_addon && ((parent.parent_load_id && r.parent_load_id === parent.parent_load_id) || (parent.parent_uid != null && r.parent_uid === parent.parent_uid)))
    .forEach((r) => names.push((services.value.find((s) => s.id === r.service_id)?.name || 'Add-on') + (r.quantity > 1 ? ' ×' + r.quantity : '')))
  return names
}

// Grouped summary: each new primary load (or existing load gaining add-ons in
// this batch) with its add-on rows nested beneath, mirroring the POS summary.
const addLoadsSummary = computed(() =>
  addLoadsParents.value
    .map((p) => ({
      ...p,
      primaryRow: p.isNew ? addLoadsRows.value.find((r) => !r.is_addon && r.uid === p.parent_uid) : null,
      addonRows: addLoadsRows.value.filter((r) => r.is_addon &&
        ((p.parent_load_id && r.parent_load_id === p.parent_load_id) || (p.parent_uid != null && r.parent_uid === p.parent_uid))),
    }))
    .filter((g) => g.primaryRow || g.addonRows.length)
)

function rowSvc(row) { return services.value.find((s) => s.id === row.service_id) }
function rowName(row) { return rowSvc(row)?.name || 'Service' }
function rowStep(row) { return rowSvc(row)?.pricing_type === 'per_kilo' ? 0.5 : 1 }

function setRowQty(row, qty) {
  const q = Math.round(qty * 100) / 100
  if (q <= 0) removeAddRow(row)
  else row.quantity = q
}

const addLoadsSubtotal = computed(() =>
  addLoadsRows.value.reduce((s, r) => {
    const svc = rowSvc(r)
    return s + (svc ? Number(svc.price) * Number(r.quantity) : 0)
  }, 0)
)

// Mirror the POS watchEffect: compute free loads + discount for the rows being added
const addLoadsLoyaltyResult = computed(() => {
  const loyalty = addLoadsLoyalty.value
  if (!loyalty) return null
  const rows = addLoadsRows.value.filter((r) => r.service_id)
  if (!rows.length) return null

  const newStamps = Math.floor(
    rows.reduce((sum, r) => {
      const svc = services.value.find((s) => s.id === Number(r.service_id))
      return svc?.is_loyalty_eligible ? sum + Number(r.quantity || 0) : sum
    }, 0)
  )

  const prospective = loyalty.total_stamps + newStamps
  const existingCount = loyalty.pending_rewards.filter((r) => r.rule?.reward_type === 'free_load').length
  const newCount = loyalty.rules
    .filter((r) => r.reward_type === 'free_load')
    .reduce((sum, rule) => {
      const prev = Math.floor(loyalty.total_stamps / rule.every_n_stamps)
      const next = Math.floor(prospective / rule.every_n_stamps)
      return sum + Math.max(0, next - prev)
    }, 0)

  const totalFreeLoads = existingCount + newCount
  if (totalFreeLoads === 0) return null

  const expandedPrices = rows
    .flatMap((r) => {
      const svc = services.value.find((s) => s.id === Number(r.service_id))
      if (!svc) return []
      return Array(Math.max(1, Math.floor(Number(r.quantity || 1)))).fill(Number(svc.price))
    })
    .sort((a, b) => b - a)

  const discount = expandedPrices.slice(0, totalFreeLoads).reduce((s, p) => s + p, 0)
  return { count: totalFreeLoads, discount }
})

async function openAddLoads() {
  if (!services.value.length) {
    try {
      const res = await getBranchServices(branch.currentBranchId)
      services.value = (res.data.data || res.data).filter((s) => s.is_active !== false)
    } catch {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load services', life: 4000 })
      return
    }
  }
  addLoadsLoyalty.value = null
  if (order.value?.customer?.id) {
    try {
      const res = await getCustomerLoyalty(order.value.customer.id)
      addLoadsLoyalty.value = res.data
    } catch {}
  }
  addLoadsRows.value = []
  addLoadsError.value = ''
  addLoadsActiveCat.value = null
  showAddLoads.value = true
}

async function saveLoads() {
  if (!addLoadsRows.value.length) {
    addLoadsError.value = 'Select at least one service.'
    return
  }
  savingLoads.value = true
  addLoadsError.value = ''
  try {
    const loyalty = addLoadsLoyaltyResult.value
    await addLoads(order.value.id, {
      loads: addLoadsRows.value.map((r) => ({
        service_id: r.service_id,
        quantity: r.quantity,
        _key: 'k' + r.uid,
        parent_key: r.is_addon && r.parent_uid != null ? 'k' + r.parent_uid : null,
        parent_load_id: r.is_addon ? r.parent_load_id : null,
      })),
      ...(loyalty ? { discount_amount: loyalty.discount, loyalty_free_loads: loyalty.count } : {}),
    })
    showAddLoads.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Loads added', life: 2500 })
  } catch (e) {
    addLoadsError.value = e.response?.data?.message || 'Failed to add loads.'
  } finally {
    savingLoads.value = false
  }
}

const showEditForm  = ref(false)
const editForm      = ref({ extra_fees: 0, notes: '' })
const savingEdit    = ref(false)
const editingNotes  = ref(false)
const notesInput    = ref('')

function openEditForm() {
  editForm.value = {
    extra_fees: Number(order.value.extra_fees || 0),
    notes:      order.value.notes || '',
  }
  showEditForm.value = true
}

function openNotesEdit() {
  notesInput.value = order.value.notes || ''
  editingNotes.value = true
}

async function saveNotes() {
  savingEdit.value = true
  try {
    await updateOrder(order.value.id, { notes: notesInput.value })
    editingNotes.value = false
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save notes', life: 4000 })
  } finally {
    savingEdit.value = false
  }
}

async function saveEdit() {
  savingEdit.value = true
  try {
    await updateOrder(order.value.id, editForm.value)
    showEditForm.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Order updated', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    savingEdit.value = false
  }
}

function fmt(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

const receiptOrderId = ref(null)

const printingSlip = ref(null) // load id currently being printed

async function printSlip(load) {
  if (!order.value) return
  printingSlip.value = load.id
  try {
    if (!printer.connected.value) {
      const ok = await printer.connect()
      if (!ok) {
        toast.add({ severity: 'error', summary: 'Printer', detail: 'Could not connect to printer', life: 4000 })
        return
      }
    }
    const { getSettings } = await import('@/api/settings.js')
    const settingsRes = await getSettings()
    const flat = {}
    ;(settingsRes.data.settings || []).forEach(s => { flat[s.key] = s.value })

    const qty = Math.max(1, Math.floor(Number(load.quantity) || 1))
    for (let i = 0; i < qty; i++) {
      const slipBytes = buildTrackingSlipBytes(load, order.value, flat, i + 1, qty)
      await printer.print(slipBytes)
      if (i < qty - 1) await new Promise(r => setTimeout(r, 400)) // brief pause between slips
    }
    toast.add({ severity: 'success', summary: 'Printed', detail: `${qty} slip${qty > 1 ? 's' : ''} for ${load.service_name_snapshot || 'load'}`, life: 2000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Print error', detail: e.message || 'Failed', life: 4000 })
  } finally {
    printingSlip.value = null
  }
}

const showDeliveryPicker = ref(false)
const deliveryDate = ref(null)
const savingDelivery = ref(false)

function openDeliveryPicker() {
  deliveryDate.value = order.value?.delivery_scheduled_at
    ? new Date(order.value.delivery_scheduled_at)
    : null
  showDeliveryPicker.value = true
}

async function saveDeliverySchedule() {
  if (!deliveryDate.value) return
  savingDelivery.value = true
  try {
    const dt = deliveryDate.value instanceof Date
      ? deliveryDate.value.toISOString()
      : deliveryDate.value
    await updateOrder(order.value.id, { delivery_scheduled_at: dt })
    showDeliveryPicker.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Delivery scheduled', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
  } finally {
    savingDelivery.value = false
  }
}

async function confirmMarkDelivered() {
  try {
    await markOrderDelivered(order.value.id)
    await load()
    toast.add({ severity: 'success', summary: 'Done', detail: 'Order marked as delivered', life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
  }
}

onMounted(load)
</script>

<template>
  <div class="p-5 max-w-4xl mx-auto">
    <div class="flex items-center gap-3 mb-5 animate-slide-up">
      <button
        class="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95"
        @click="router.back()"
      >←</button>
      <h1 class="text-2xl font-bold text-slate-900">Order Detail</h1>
      <div class="flex-1" />
      <!-- Print / Reprint -->
      <button
        v-if="order"
        class="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3 py-2 rounded-xl transition-all active:scale-95"
        @click="receiptOrderId = order.id"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/>
        </svg>
        Print
      </button>
      <button
        v-if="canDelete"
        :disabled="deletingOrder"
        class="flex items-center gap-1.5 text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
        @click="confirmDelete"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        Delete
      </button>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-4">
      <div class="skeleton h-36 rounded-2xl" />
      <div class="skeleton h-48 rounded-2xl" />
      <div class="grid sm:grid-cols-2 gap-4">
        <div class="skeleton h-36 rounded-2xl" />
        <div class="skeleton h-36 rounded-2xl" />
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="loadError" class="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div class="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-2xl">⚠️</div>
      <div>
        <p class="font-semibold text-slate-700">{{ loadError }}</p>
        <p class="text-sm text-slate-400 mt-1">Check the order ID or try again.</p>
      </div>
      <div class="flex gap-3">
        <button
          class="text-sm font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all"
          @click="load"
        >Retry</button>
        <button
          class="text-sm font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
          @click="router.push('/orders')"
        >Back to Orders</button>
      </div>
    </div>

    <div v-else-if="order" class="space-y-4">

      <!-- Header card -->
      <div class="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up" style="box-shadow: var(--shadow-card);">
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center flex-wrap gap-3 mb-3">
              <h2 class="text-lg font-bold text-slate-900 font-mono">{{ order.order_number }}</h2>
              <span
                class="badge"
                :class="`badge-${order.status}`"
              >{{ order.status?.replace('_', ' ') }}</span>
            </div>
            <div class="space-y-1 text-sm text-slate-500">
              <div>Created {{ fmtDate(order.created_at) }}</div>
              <div v-if="order.customer" class="flex items-center gap-2">
                <button
                  class="flex items-center gap-2 cursor-pointer hover:underline text-left"
                  @click="router.push('/customers/' + order.customer.id)"
                >
                  <div
                    class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    :style="`background: hsl(${(order.customer.name?.charCodeAt(0) * 7) % 360}, 65%, 55%);`"
                  >{{ order.customer.name?.charAt(0).toUpperCase() }}</div>
                  <span class="font-medium text-slate-700">{{ order.customer.name }}</span>
                </button>
                <span>·</span>
                <span>{{ order.customer.phone }}</span>
              </div>
              <div v-if="order.user">Staff: <span class="font-medium text-slate-700">{{ order.user.name }}</span></div>
            </div>
          </div>

          <div v-if="auth.isCashier" class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
            <div class="flex gap-2 w-full sm:w-auto">
              <button
                v-if="orderStatusPrev[order.status] && auth.isAdmin"
                :disabled="updatingStatus"
                class="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-95 disabled:opacity-50"
                @click="revertOrderStatus"
              >← Undo</button>
              <button
                v-if="orderStatusNext[order.status]"
                :disabled="updatingStatus"
                class="btn btn-primary flex-1 sm:flex-none"
                @click="advanceOrderStatus"
              >
                <svg v-if="updatingStatus" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
                <span v-else>Mark {{ orderStatusNext[order.status] }} →</span>
              </button>
            </div>
            <div v-if="statusError" class="text-xs text-red-500 font-medium text-right max-w-48">{{ statusError }}</div>
          </div>
        </div>

        <!-- Balance due banner -->
        <div
          v-if="outstandingBalance > 0.009"
          class="mt-3 flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm"
        >
          <span class="font-semibold text-amber-800">Balance Due</span>
          <span class="font-bold text-amber-700 text-base">₱{{ fmt(outstandingBalance) }}</span>
        </div>

        <!-- Order notes -->
        <div class="mt-2 bg-slate-50 border border-slate-200 rounded-xl text-sm overflow-hidden">
          <!-- View state -->
          <div v-if="!editingNotes" class="flex items-start justify-between gap-3 px-3 py-2">
            <div class="flex items-start gap-2 min-w-0">
              <span class="shrink-0 text-slate-400 mt-0.5">📝</span>
              <span v-if="order.notes" class="text-slate-700">{{ order.notes }}</span>
              <span v-else class="text-slate-400 italic">No notes</span>
            </div>
            <button
              v-if="auth.isCashier && order.status !== 'completed'"
              class="shrink-0 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
              @click="openNotesEdit"
            >Edit</button>
          </div>
          <!-- Inline edit state -->
          <div v-else class="p-3 space-y-2">
            <textarea
              v-model="notesInput"
              rows="2"
              placeholder="Add order notes…"
              class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
              autofocus
            />
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tag in ['No spray', 'Med temp only', 'Has eco bag', 'Has basket', 'Delicate', 'No fabric softener', 'Separate colors']"
                :key="tag"
                type="button"
                class="px-2 py-0.5 rounded-full text-xs font-medium border transition-all active:scale-95"
                :class="notesInput.includes(tag)
                  ? 'bg-blue-100 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'"
                @click="notesInput = notesInput.includes(tag)
                  ? notesInput.replace(tag, '').replace(/^[,\s]+|[,\s]+$/g, '').replace(/,\s*,/g, ',').trim()
                  : notesInput ? notesInput + ', ' + tag : tag"
              >{{ tag }}</button>
            </div>
            <div class="flex gap-2">
              <button
                class="flex-1 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-white transition-all"
                @click="editingNotes = false"
              >Cancel</button>
              <button
                class="flex-1 py-1.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50"
                style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
                :disabled="savingEdit"
                @click="saveNotes"
              >{{ savingEdit ? 'Saving…' : 'Save' }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Delivery -->
      <div v-if="auth.isAdmin && settings.pickupDeliveryEnabled" class="bg-white rounded-2xl border border-slate-200 p-5 animate-slide-up stagger-1" style="box-shadow: var(--shadow-card);">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-base">📦</span>
            <h3 class="font-bold text-slate-900">Delivery</h3>
          </div>
          <div class="flex gap-2">
            <button
              v-if="order.delivery_scheduled_at && !order.delivered_at"
              class="text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-all active:scale-95"
              @click="confirmMarkDelivered"
            >Mark Delivered ✓</button>
            <button
              v-if="!order.delivered_at"
              class="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-xl transition-all active:scale-95"
              @click="openDeliveryPicker"
            >{{ order.delivery_scheduled_at ? 'Reschedule' : 'Schedule Delivery' }}</button>
          </div>
        </div>

        <div class="mt-3 text-sm text-slate-500">
          <div v-if="order.delivered_at" class="flex items-center gap-2 text-green-600 font-medium">
            <span>✓ Delivered on {{ fmtDate(order.delivered_at) }}</span>
          </div>
          <div v-else-if="order.delivery_scheduled_at" class="flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
            <span>Scheduled for {{ fmtDate(order.delivery_scheduled_at) }}</span>
          </div>
          <div v-else class="text-slate-400 italic">No delivery scheduled</div>
        </div>

        <div v-if="showDeliveryPicker" class="mt-3 flex flex-wrap items-center gap-2">
          <DatePicker
            v-model="deliveryDate"
            show-time
            hour-format="12"
            date-format="M dd, yy"
            show-icon
            icon-display="input"
            :min-date="new Date()"
            placeholder="Select date and time…"
            class="order-delivery-datepicker"
          />
          <button
            class="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
            :disabled="!deliveryDate || savingDelivery"
            @click="saveDeliverySchedule"
          >{{ savingDelivery ? 'Saving…' : 'Save' }}</button>
          <button
            class="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors"
            @click="showDeliveryPicker = false"
          >Cancel</button>
        </div>
      </div>

      <!-- Loads + Summary/Payments -->
      <div class="grid sm:grid-cols-2 gap-4 items-start">

        <!-- Loads -->
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-1" style="box-shadow: var(--shadow-card);">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-slate-900">Loads</h3>
              <span class="text-xs text-slate-400">{{ primaryLoads.length }} item{{ primaryLoads.length !== 1 ? 's' : '' }}</span>
            </div>
            <button
              v-if="order.status !== 'completed' && auth.isCashier"
              class="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-all active:scale-95"
              @click="openAddLoads"
            >+ Add Loads</button>
          </div>
          <div class="divide-y divide-slate-50">
            <div v-if="!primaryLoads.length" class="px-5 py-8 text-sm text-center text-slate-300">No loads added</div>
            <div
              v-for="(load, i) in primaryLoads"
              :key="load.id"
              class="px-4 sm:px-5 py-3 hover:bg-slate-50 transition-colors animate-slide-up"
              :style="`animation-delay: ${i * 30}ms`"
            >
              <div class="flex flex-wrap items-center gap-2">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-slate-800">{{ load.service_name_snapshot }}</div>
                  <div class="text-xs text-slate-400 mt-0.5">{{ load.quantity }} × ₱{{ fmt(load.unit_price_snapshot) }} = ₱{{ fmt(load.line_total) }}</div>
                </div>
                <button
                  class="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-40"
                  :disabled="printingSlip === load.id"
                  @click="printSlip(load)"
                  title="Print tracking slip"
                >
                  <svg v-if="printingSlip !== load.id" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  <span v-if="printingSlip !== load.id">Slip</span>
                  <span v-else>…</span>
                </button>
              </div>
              <!-- Add-ons attached to this load -->
              <div v-for="a in load.addons" :key="a.id" class="flex items-center gap-2 pl-4 mt-1.5">
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium text-slate-600">+ {{ a.service_name_snapshot }}</div>
                </div>
                <div class="text-xs text-slate-400">{{ a.quantity }} × ₱{{ fmt(a.unit_price_snapshot) }} = ₱{{ fmt(a.line_total) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Summary + Payments (merged) -->
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-slide-up stagger-2" style="box-shadow: var(--shadow-card);">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 class="font-bold text-slate-900">Summary</h3>
              <div v-if="!isPaid" class="text-xs text-amber-600 font-medium mt-0.5">Balance: ₱{{ fmt(outstandingBalance) }}</div>
              <div v-else class="text-xs text-green-600 font-medium mt-0.5">Fully paid</div>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="!isPaid && auth.isCashier && order.status !== 'completed'"
                class="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-all active:scale-95"
                @click="openPaymentForm"
              >+ Record Payment</button>
              <button
                v-if="order.status !== 'completed' && auth.isCashier"
                class="flex items-center gap-1.5 text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-xl transition-all active:scale-95"
                @click="showEditForm ? showEditForm = false : openEditForm()"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                {{ showEditForm ? 'Cancel' : 'Edit' }}
              </button>
            </div>
          </div>

          <!-- Edit form -->
          <Transition name="slide-down">
            <div v-if="showEditForm" class="px-5 py-4 border-b border-slate-100 bg-slate-50 space-y-3">
              <div class="flex items-center gap-3">
                <label class="text-xs font-semibold text-slate-500 w-24 shrink-0">Extra fees</label>
                <div class="relative flex-1">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                  <input
                    v-model="editForm.extra_fees"
                    type="number" min="0" step="1"
                    class="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm text-right bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>
              <div class="flex items-start gap-3">
                <label class="text-xs font-semibold text-slate-500 w-24 shrink-0 mt-2">Notes</label>
                <textarea
                  v-model="editForm.notes"
                  rows="2"
                  placeholder="e.g. Delivery requested"
                  class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                />
              </div>
              <div class="flex gap-2 pt-1">
                <button
                  class="flex-1 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-white transition-all"
                  @click="showEditForm = false"
                >Cancel</button>
                <button
                  class="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                  style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
                  :disabled="savingEdit"
                  @click="saveEdit"
                >{{ savingEdit ? 'Saving…' : 'Save' }}</button>
              </div>
            </div>
          </Transition>

          <!-- Totals -->
          <div class="px-5 py-4 space-y-2.5 text-sm border-b border-slate-100">
            <div class="flex justify-between text-slate-500"><span>Subtotal</span><span>₱{{ fmt(order.subtotal) }}</span></div>
            <div v-if="Number(order.extra_fees)" class="flex justify-between text-slate-500"><span>Extra fees</span><span>₱{{ fmt(order.extra_fees) }}</span></div>
            <div v-if="Number(order.discount_amount)" class="flex justify-between text-slate-500"><span>Discount</span><span class="text-red-500">−₱{{ fmt(order.discount_amount) }}</span></div>
            <div class="flex justify-between font-bold text-base text-slate-900 pt-2 border-t border-slate-100">
              <span>Total</span><span>₱{{ fmt(order.total_amount) }}</span>
            </div>
          </div>

          <!-- Payment list -->
          <div v-if="!order.payments?.length" class="px-5 py-6 text-sm text-center text-slate-300">No payments recorded</div>
          <div v-else class="divide-y divide-slate-50">
            <div v-for="p in order.payments" :key="p.id" class="flex items-center gap-2 px-5 py-3">
              <div
                class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                :style="p.type === 'refund' ? 'background:#fee2e2;color:#dc2626;' : 'background:#dbeafe;color:#1d4ed8;'"
              >{{ p.method?.charAt(0).toUpperCase() }}</div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-slate-700 capitalize">{{ p.method }}</div>
                <div class="text-xs text-slate-400 capitalize">
                  {{ p.type }}<template v-if="p.reference_number"> · Ref: {{ p.reference_number }}</template>
                </div>
                <div v-if="p.created_at" class="text-xs text-slate-400">{{ fmtDate(p.created_at) }}</div>
              </div>
              <span :class="['text-sm font-bold', p.type === 'refund' ? 'text-red-600' : 'text-green-700']">
                {{ p.type === 'refund' ? '−' : '+' }}₱{{ fmt(p.amount) }}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>

  <!-- Record Payment modal -->
  <Dialog
    v-model:visible="showPaymentForm"
    modal
    header="Record Payment"
    :style="{ width: '400px', maxWidth: '95vw' }"
    :draggable="false"
  >
    <div class="space-y-3 pt-1">
      <div class="flex gap-1">
        <button
          v-for="m in ['cash','gcash']"
          :key="m"
          class="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
          :class="newPayment.method === m
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'"
          @click="newPayment.method = m"
        >{{ m.toUpperCase() }}</button>
      </div>
      <div class="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
        <span class="text-xs text-slate-500">Amount</span>
        <span class="text-base font-bold text-slate-900">₱{{ fmt(newPayment.amount) }}</span>
      </div>
      <template v-if="newPayment.method === 'cash'">
        <div class="grid grid-cols-4 gap-1">
          <button
            class="col-span-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="!newPayment.showCustom && newPayment.tendered == newPayment.amount && Number(newPayment.tendered) > 0
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
            @click="newPayment.tendered = newPayment.amount; newPayment.showCustom = false"
          >Exact</button>
          <button
            v-for="d in [20, 50, 100, 200]"
            :key="d"
            class="py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="!newPayment.showCustom && Number(newPayment.tendered) === d
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
            @click="newPayment.tendered = String(d); newPayment.showCustom = false"
          >₱{{ d }}</button>
          <button
            class="py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="!newPayment.showCustom && Number(newPayment.tendered) === 500
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
            @click="newPayment.tendered = '500'; newPayment.showCustom = false"
          >₱500</button>
          <button
            class="py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="!newPayment.showCustom && Number(newPayment.tendered) === 1000
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
            @click="newPayment.tendered = '1000'; newPayment.showCustom = false"
          >₱1000</button>
          <button
            class="col-span-2 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            :class="newPayment.showCustom
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'"
            @click="newPayment.showCustom = !newPayment.showCustom; if (!newPayment.showCustom) newPayment.tendered = ''"
          >Custom</button>
        </div>
        <div v-if="newPayment.showCustom" class="relative">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
          <input
            v-model="newPayment.tendered"
            type="number" step="0.01" min="0"
            placeholder="Enter amount…"
            autofocus
            class="w-full border border-blue-300 rounded-xl pl-7 pr-3 py-2 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
        <div
          v-if="Number(newPayment.tendered) >= Number(newPayment.amount) && Number(newPayment.amount) > 0"
          class="flex justify-between px-3 py-2.5 rounded-xl text-lg font-bold text-green-700"
          style="background: linear-gradient(135deg, #dcfce7, #bbf7d0);"
        >
          <span>Change</span>
          <span>₱{{ fmt(Number(newPayment.tendered) - Number(newPayment.amount)) }}</span>
        </div>
      </template>
      <div v-else class="flex items-center gap-2">
        <span class="text-xs text-slate-500 w-16 shrink-0">Ref # <span class="text-slate-400">(opt)</span></span>
        <input
          v-model="newPayment.reference_number"
          placeholder="Transaction reference (optional)"
          class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>
      <div v-if="paymentFormError" class="text-xs text-red-500 font-medium px-1">{{ paymentFormError }}</div>
      <div class="flex gap-2 pt-1">
        <button
          class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all active:scale-[0.98]"
          @click="showPaymentForm = false"
        >Cancel</button>
        <button
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          :disabled="savingPayment"
          style="background: linear-gradient(135deg, #16a34a, #15803d);"
          @click="recordPayment"
        >
          <span v-if="!savingPayment">✓ Record</span>
          <span v-else class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0110 10" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
            Saving…
          </span>
        </button>
      </div>
    </div>
  </Dialog>

  <!-- Add Loads modal -->
  <Dialog
    v-model:visible="showAddLoads"
    modal
    header="Add Loads"
    :style="{ width: '900px', maxWidth: '96vw' }"
    :draggable="false"
  >
    <div class="flex flex-col gap-4 pt-1 sm:flex-row sm:gap-5 sm:h-[68vh] sm:max-h-[620px]">

      <!-- ── LEFT: service catalog ── -->
      <div class="flex flex-col gap-3 min-h-0 sm:flex-1">

      <!-- Category tabs -->
      <div v-if="addLoadsCategories.length" class="flex gap-1.5 flex-wrap shrink-0">
        <button
          class="al-cat-tab"
          :class="addLoadsActiveCat === null ? 'al-cat-active' : 'al-cat-inactive'"
          @click="addLoadsActiveCat = null"
        >All</button>
        <button
          v-for="cat in addLoadsCategories"
          :key="cat.id"
          class="al-cat-tab"
          :class="addLoadsActiveCat === cat.id ? 'al-cat-active' : 'al-cat-inactive'"
          @click="addLoadsActiveCat = cat.id"
        >{{ cat.icon ? cat.icon + ' ' : '' }}{{ cat.name }}</button>
      </div>

      <!-- Service card grid -->
      <div class="overflow-y-auto min-h-0 sm:flex-1 max-h-[38vh] sm:max-h-none">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-1">
          <div
            v-for="svc in addLoadsFiltered"
            :key="svc.id"
            class="relative rounded-xl border-2 p-3 cursor-pointer select-none transition-all active:scale-[0.97]"
            :class="(isAddon(svc) ? catalogAddonCount(svc.id) : (isMeasured(svc) ? catalogQty(svc.id) : catalogLoadCount(svc.id))) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
            @click="onCatalogTap(svc)"
          >
            <!-- Price top-right -->
            <div class="absolute top-2.5 right-2.5 text-xs font-bold" :class="(isAddon(svc) ? catalogAddonCount(svc.id) : (isMeasured(svc) ? catalogQty(svc.id) : catalogLoadCount(svc.id))) ? 'text-blue-600' : 'text-slate-400'">
              ₱{{ fmt(svc.price) }}
            </div>

            <div class="text-sm font-semibold text-slate-800 pr-12 leading-tight">{{ svc.name }}</div>
            <!-- <div class="text-xs text-slate-400 mt-0.5">{{ svc.pricing_type === 'per_kilo' ? 'per kilo' : svc.pricing_type === 'per_piece' ? 'per piece' : 'flat rate' }}</div> -->

            <!-- Add-on: tap to attach to a load -->
            <div v-if="isAddon(svc)" class="mt-2.5 text-center text-xs font-bold rounded-lg py-1.5"
                 :class="catalogAddonCount(svc.id) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'">
              {{ catalogAddonCount(svc.id) ? `${catalogAddonCount(svc.id)} attached · tap to add` : '+ Add-on' }}
            </div>

            <!-- Flat-rate: each tap adds a separate load -->
            <div v-else-if="!isMeasured(svc)" class="mt-2.5 text-center text-xs font-bold rounded-lg py-1.5"
                 :class="catalogLoadCount(svc.id) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'">
              {{ catalogLoadCount(svc.id) ? `${catalogLoadCount(svc.id)} load${catalogLoadCount(svc.id) > 1 ? 's' : ''} · tap to add` : '+ Add load' }}
            </div>

            <!-- Measured (per kilo/piece): qty controls -->
            <div v-else-if="catalogQty(svc.id)" class="mt-2.5 flex items-center gap-1.5">
              <button
                class="al-qty-btn"
                @click.stop="catalogSet(svc, Math.max(0, catalogQty(svc.id) - catalogStep(svc)))"
              >−</button>
              <span class="flex-1 text-center text-sm font-bold text-blue-700">{{ catalogQty(svc.id) }}</span>
              <button
                class="al-qty-btn al-qty-plus"
                @click.stop="catalogSet(svc, catalogQty(svc.id) + catalogStep(svc))"
              >+</button>
            </div>
          </div>
        </div>
      </div>
      </div>
      <!-- ── /LEFT ── -->

      <!-- ── RIGHT: live summary panel ── -->
      <div class="flex flex-col gap-3 min-h-0 sm:w-80 sm:shrink-0 sm:border-l sm:border-slate-100 sm:pl-5">

      <!-- Scrollable: selected loads + loyalty -->
      <div class="flex flex-col gap-3 overflow-y-auto min-h-0 sm:flex-1 max-h-[36vh] sm:max-h-none">

      <!-- Empty placeholder -->
      <div v-if="!addLoadsRows.length" class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
        Tap services on the left to add loads. They'll appear here.
      </div>

      <!-- Selected summary — loads with their add-ons nested, qty steppers -->
      <div v-if="addLoadsRows.length" class="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-slate-200/70">
          <span class="text-[11px] font-bold uppercase tracking-wide text-slate-400">Summary</span>
          <span class="text-xs font-semibold text-slate-500">Subtotal ₱{{ fmt(addLoadsSubtotal) }}</span>
        </div>
        <div class="divide-y divide-slate-200/70">
          <div v-for="group in addLoadsSummary" :key="group.ref" class="px-3 py-2">
            <!-- New primary load -->
            <div v-if="group.primaryRow" class="flex items-center gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-slate-700 truncate">{{ group.label }}</div>
                <div class="text-[11px] text-slate-400">₱{{ fmt(rowSvc(group.primaryRow)?.price) }} × {{ group.primaryRow.quantity }} = ₱{{ fmt((rowSvc(group.primaryRow)?.price || 0) * group.primaryRow.quantity) }}</div>
              </div>
              <!-- Measured loads use a qty stepper; flat-rate loads stay distinct (so add-ons can differ per load) and only get a remove button. -->
              <div v-if="isMeasured(rowSvc(group.primaryRow) || {})" class="flex items-center gap-1.5 shrink-0">
                <button class="al-qty-btn" @click="setRowQty(group.primaryRow, group.primaryRow.quantity - rowStep(group.primaryRow))">−</button>
                <span class="w-8 text-center text-xs font-bold text-blue-700">{{ group.primaryRow.quantity }}</span>
                <button class="al-qty-btn al-qty-plus" @click="setRowQty(group.primaryRow, group.primaryRow.quantity + rowStep(group.primaryRow))">+</button>
              </div>
              <button v-else class="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all" @click="removeAddRow(group.primaryRow)" title="Remove load">✕</button>
            </div>
            <!-- Existing load gaining add-ons -->
            <div v-else class="text-xs font-semibold text-slate-500">{{ group.label }} <span class="text-slate-300 font-normal">· existing</span></div>

            <!-- Add-ons nested under this load -->
            <div v-for="row in group.addonRows" :key="row.uid" class="mt-1.5 flex items-center gap-2 pl-3">
              <div class="flex-1 min-w-0 text-xs text-emerald-700 font-medium truncate">+ {{ rowName(row) }}</div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button class="al-qty-btn" @click="setRowQty(row, row.quantity - 1)">−</button>
                <span class="w-8 text-center text-xs font-bold text-emerald-700">{{ row.quantity }}</span>
                <button class="al-qty-btn al-qty-plus" @click="setRowQty(row, row.quantity + 1)">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loyalty preview -->
      <div v-if="addLoadsLoyalty" class="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
        <div v-for="rule in addLoadsLoyalty.rules" :key="rule.id" class="space-y-1">
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-500">{{ rule.reward_description }}</span>
            <span class="text-xs font-semibold text-slate-700">
              {{ addLoadsLoyalty.total_stamps % rule.every_n_stamps }}/{{ rule.every_n_stamps }}
            </span>
          </div>
          <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              style="background: linear-gradient(90deg, #3b82f6, #6366f1);"
              :style="`width: ${((addLoadsLoyalty.total_stamps % rule.every_n_stamps) / rule.every_n_stamps) * 100}%`"
            />
          </div>
        </div>
        <div
          v-if="addLoadsLoyaltyResult"
          class="flex items-center justify-between text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-2"
        >
          <span>🎁 {{ addLoadsLoyaltyResult.count > 1 ? `${addLoadsLoyaltyResult.count}× free loads` : '1 free load' }} will apply</span>
          <span>−₱{{ fmt(addLoadsLoyaltyResult.discount) }}</span>
        </div>
      </div>

      </div>
      <!-- /scrollable -->

      <div v-if="addLoadsError" class="shrink-0 text-xs text-red-500 font-medium px-1">{{ addLoadsError }}</div>

      <div class="shrink-0 flex gap-2">
        <button
          class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
          @click="showAddLoads = false"
        >Cancel</button>
        <button
          class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
          style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
          :disabled="savingLoads || !addLoadsRows.length"
          @click="saveLoads"
        >{{ savingLoads ? 'Saving…' : `Save Loads${addLoadsRows.length ? ` (${addLoadsRows.length})` : ''}` }}</button>
      </div>
      </div>
      <!-- ── /RIGHT ── -->
    </div>
  </Dialog>

  <!-- Add-on parent picker (Add Loads) -->
  <Dialog
    v-model:visible="showAddLoadsParent"
    modal
    :header="addLoadsAddonSvc ? `Attach ${addLoadsAddonSvc.name} to…` : 'Attach to…'"
    :style="{ width: '360px', maxWidth: '95vw' }"
    :draggable="false"
  >
    <p class="mb-3 text-sm text-slate-500">Which load is this add-on for?</p>
    <div class="space-y-2">
      <button
        v-for="parent in addLoadsParents"
        :key="parent.ref"
        class="flex w-full flex-col items-start rounded-xl border border-slate-200 px-4 py-3 text-left transition-all hover:border-blue-400 hover:bg-blue-50"
        @click="chooseAddLoadsParent(parent)"
      >
        <span class="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {{ parent.label }}
          <span v-if="parent.isNew" class="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">New</span>
        </span>
        <span v-if="parentAddonSummary(parent).length" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="(a, ai) in parentAddonSummary(parent)"
            :key="ai"
            class="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"
          >{{ a }}</span>
        </span>
        <span v-else class="mt-0.5 text-xs text-slate-300">no add-ons yet</span>
      </button>
    </div>
  </Dialog>

  <!-- Receipt modal (print / reprint) -->
  <ReceiptModal
    :order-id="receiptOrderId"
    @close="receiptOrderId = null"
  />
</template>

<style scoped>
.animate-spin { animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.al-qty-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #dbeafe;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #1d4ed8;
  transition: all 120ms ease;
  line-height: 1;
  flex-shrink: 0;
}
.al-qty-btn:hover { background: #bfdbfe; }
.al-qty-btn:active { transform: scale(0.88); }
.al-qty-plus { background: #2563eb; color: #fff; }
.al-qty-plus:hover { background: #1d4ed8; }

.al-cat-tab {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 120ms ease;
}
.al-cat-active  { background: #2563eb; color: #fff; }
.al-cat-inactive { background: #f1f5f9; color: #475569; }
.al-cat-inactive:hover { background: #e2e8f0; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 220ms ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 600px; }

.order-delivery-datepicker .p-datepicker-input {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 6px 28px 6px 12px;
  font-size: 14px;
  color: #1e293b;
}
.order-delivery-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
