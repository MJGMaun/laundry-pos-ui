import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSettings } from '@/api/settings.js'

// Lightweight global cache of branch settings (key -> value), so the sidebar
// and guards can react to settings without each view refetching.
export const useSettingsStore = defineStore('settings', () => {
  const map = ref({})
  const loaded = ref(false)

  async function load() {
    try {
      const res = await getSettings()
      const flat = {}
      ;(res.data.settings || []).forEach((s) => { flat[s.key] = s.value })
      map.value = flat
      loaded.value = true
    } catch {
      /* ignore — features fall back to their defaults */
    }
  }

  const get = (key) => map.value[key]

  // Default ON: only an explicit 'false' disables the feature.
  const daySummaryEnabled       = computed(() => map.value.day_summary_enabled !== 'false')
  const pickupDeliveryEnabled   = computed(() => map.value.pickup_delivery_enabled !== 'false')

  return { map, loaded, load, get, daySummaryEnabled, pickupDeliveryEnabled }
})
