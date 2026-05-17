<script setup>
import { ref, onMounted } from 'vue'
import { getSettings, updateSetting } from '@/api/settings.js'

const loading = ref(false)
const saving = ref({})
const settings = ref({})

const GROUPS = [
  {
    key: 'shop',
    label: 'Shop Info',
    fields: [
      { key: 'shop_name', label: 'Shop Name', type: 'text' },
      { key: 'shop_address', label: 'Address', type: 'text' },
      { key: 'shop_phone', label: 'Phone', type: 'text' },
      { key: 'shop_email', label: 'Email', type: 'email' },
    ],
  },
  {
    key: 'receipt',
    label: 'Receipt',
    fields: [
      { key: 'receipt_footer', label: 'Footer Text', type: 'text' },
      { key: 'receipt_show_loyalty', label: 'Show Loyalty Points', type: 'toggle' },
    ],
  },
  {
    key: 'printer',
    label: 'Printer',
    fields: [
      { key: 'printer_name', label: 'Printer Name / Path', type: 'text' },
    ],
  },
  {
    key: 'loyalty',
    label: 'Loyalty Program',
    fields: [
      { key: 'loyalty_points_per_peso', label: 'Points per Peso', type: 'number' },
      { key: 'loyalty_min_redeem_points', label: 'Min Redeem Points', type: 'number' },
    ],
  },
]

async function load() {
  loading.value = true
  try {
    const res = await getSettings()
    const raw = res.data.data || res.data
    if (Array.isArray(raw)) {
      raw.forEach((s) => { settings.value[s.key] = s.value })
    } else {
      Object.assign(settings.value, raw)
    }
  } finally {
    loading.value = false
  }
}

async function save(key) {
  saving.value[key] = true
  try {
    await updateSetting(key, { value: settings.value[key] })
  } catch (e) {
    alert(e.response?.data?.message || 'Failed to save')
  } finally {
    saving.value[key] = false
  }
}

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-3xl mx-auto">
    <h1 class="text-xl font-bold text-gray-900 mb-5">Settings</h1>

    <div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

    <div v-else class="space-y-4">
      <div v-for="group in GROUPS" :key="group.key" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="font-semibold text-gray-900">{{ group.label }}</h3>
        </div>
        <div class="divide-y divide-gray-100">
          <div v-for="field in group.fields" :key="field.key" class="flex items-center gap-4 px-5 py-4">
            <label class="text-sm text-gray-700 w-48 shrink-0">{{ field.label }}</label>

            <div class="flex flex-1 items-center gap-2">
              <template v-if="field.type === 'toggle'">
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  :class="settings[field.key] === 'true' || settings[field.key] === true ? 'bg-blue-600' : 'bg-gray-300'"
                  @click="settings[field.key] = String(!(settings[field.key] === 'true' || settings[field.key] === true)); save(field.key)"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                    :class="settings[field.key] === 'true' || settings[field.key] === true ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </template>
              <template v-else>
                <input
                  v-model="settings[field.key]"
                  :type="field.type"
                  class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  @keyup.enter="save(field.key)"
                />
                <button
                  class="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 shrink-0"
                  :disabled="saving[field.key]"
                  @click="save(field.key)"
                >
                  {{ saving[field.key] ? '…' : 'Save' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
