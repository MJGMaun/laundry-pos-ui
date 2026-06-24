import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const customer = ref(null)
  const notes = ref('')
  const deliveryFee = ref(0)
  const pickupFee = ref(0)
  const loyaltyDiscount = ref(0)
  const appliedLoyaltyReward = ref(null)

  // Per-line id so add-ons can reference a specific parent load (and so the
  // same add-on service can be attached to more than one load).
  let nextUid = 1

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
  )

  const total = computed(() =>
    subtotal.value + Number(deliveryFee.value) + Number(pickupFee.value) - loyaltyDiscount.value,
  )

  // Primary laundry loads (anything that isn't an add-on) — valid parents.
  const eligibleParents = computed(() => items.value.filter((i) => !i.is_addon))
  const addonsFor = (uid) => items.value.filter((i) => i.is_addon && i.parent_uid === uid)

  function isAddonService(service) {
    return (service.category?.load_rule ?? service.load_rule) === 'none'
  }

  function makeItem(service, { is_addon, parent_uid }) {
    return {
      uid: nextUid++,
      service_id: service.id,
      service_name: service.name,
      pricing_type: service.pricing_type,
      unit_price: Number(service.price),
      is_loyalty_eligible: !!service.is_loyalty_eligible,
      category_id: service.category_id ?? service.category?.id ?? null,
      is_addon: !!is_addon,
      parent_uid: parent_uid ?? null,
      quantity: 1,
    }
  }

  function applyLoyaltyReward(reward, discountAmount) {
    appliedLoyaltyReward.value = reward
    loyaltyDiscount.value = discountAmount
  }

  function clearLoyaltyReward() {
    appliedLoyaltyReward.value = null
    loyaltyDiscount.value = 0
  }

  // A primary laundry load. Flat-rate services add a separate load per tap
  // (each is its own parent, so add-ons can differ per load). Per-kilo /
  // per-piece services stay a single measured line adjusted with the stepper.
  function addItem(service) {
    const measured = service.pricing_type === 'per_kilo' || service.pricing_type === 'per_piece'
    if (measured) {
      const existing = items.value.find((i) => !i.is_addon && i.service_id === service.id)
      if (existing) return existing
    }
    const item = makeItem(service, { is_addon: false })
    items.value.push(item)
    return item
  }

  // Number of separate (non-add-on) loads for a service.
  const loadCount = (serviceId) => items.value.filter((i) => !i.is_addon && i.service_id === serviceId).length

  // Remove the most recently added load for a service (and its add-ons).
  function removeLastLoad(serviceId) {
    const matches = items.value.filter((i) => !i.is_addon && i.service_id === serviceId)
    if (matches.length) removeByUid(matches[matches.length - 1].uid)
  }

  // An add-on attached to a specific parent load (by uid). Tapping again for
  // the same parent bumps the quantity; a different parent makes a new line.
  function addAddon(service, parentUid) {
    const existing = items.value.find(
      (i) => i.is_addon && i.service_id === service.id && i.parent_uid === parentUid,
    )
    if (existing) {
      existing.quantity += 1
      return existing
    }
    const item = makeItem(service, { is_addon: true, parent_uid: parentUid })
    items.value.push(item)
    return item
  }

  // service_id-based ops target the non-add-on line (used by the service grid).
  function removeItem(serviceId) {
    const target = items.value.find((i) => !i.is_addon && i.service_id === serviceId)
    if (target) removeByUid(target.uid)
  }

  function updateQuantity(serviceId, qty) {
    const item = items.value.find((i) => !i.is_addon && i.service_id === serviceId)
    if (!item) return
    if (qty <= 0) removeByUid(item.uid)
    else item.quantity = qty
  }

  // uid-based ops (review list / add-ons). Removing a parent removes its add-ons.
  function removeByUid(uid) {
    items.value = items.value.filter((i) => i.uid !== uid && i.parent_uid !== uid)
  }

  function updateQuantityByUid(uid, qty) {
    const item = items.value.find((i) => i.uid === uid)
    if (!item) return
    if (qty <= 0) removeByUid(uid)
    else item.quantity = qty
  }

  function setCustomer(c) {
    customer.value = c
  }

  function clear() {
    items.value = []
    customer.value = null
    notes.value = ''
    deliveryFee.value = 0
    pickupFee.value = 0
    loyaltyDiscount.value = 0
    appliedLoyaltyReward.value = null
  }

  return {
    items, customer, notes, deliveryFee, pickupFee,
    loyaltyDiscount, appliedLoyaltyReward,
    subtotal, total, eligibleParents,
    addItem, addAddon, removeItem, updateQuantity, loadCount, removeLastLoad,
    removeByUid, updateQuantityByUid, addonsFor, isAddonService,
    setCustomer, applyLoyaltyReward, clearLoyaltyReward, clear,
  }
})
