import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const customer = ref(null)
  const notes = ref('')
  const deliveryFee = ref(0)
  const pickupFee = ref(0)

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
  )

  const total = computed(() => subtotal.value + Number(deliveryFee.value) + Number(pickupFee.value))

  function addItem(service) {
    const existing = items.value.find((i) => i.service_id === service.id)
    if (existing) {
      existing.quantity += service.pricing_type === 'per_piece' || service.pricing_type === 'per_kilo' ? 1 : 0
    } else {
      items.value.push({
        service_id: service.id,
        service_name: service.name,
        pricing_type: service.pricing_type,
        unit_price: Number(service.price),
        quantity: 1,
      })
    }
  }

  function removeItem(serviceId) {
    items.value = items.value.filter((i) => i.service_id !== serviceId)
  }

  function updateQuantity(serviceId, qty) {
    const item = items.value.find((i) => i.service_id === serviceId)
    if (item) {
      if (qty <= 0) {
        removeItem(serviceId)
      } else {
        item.quantity = qty
      }
    }
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
  }

  return {
    items, customer, notes, deliveryFee, pickupFee,
    subtotal, total,
    addItem, removeItem, updateQuantity, setCustomer, clear,
  }
})
