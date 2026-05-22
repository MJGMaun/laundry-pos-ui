<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import { getSettings, updateSetting } from '@/api/settings.js'
import { getBranches } from '@/api/branches.js'

const toast = useToast()
const auth = useAuthStore()
const branchStore = useBranchStore()

const loading = ref(false)
const saving = ref({})
const settings = ref({})
const branches = ref([])
const selectedBranchId = ref(null)

const activeBranchId = computed(() =>
  auth.isSuperAdmin ? selectedBranchId.value : branchStore.currentBranchId
)

const GROUPS = [
	{
		key: 'shop',
		label: 'Shop Info',
		fields: [
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
	settings.value = {}
	try {
		const res = await getSettings(activeBranchId.value)
		const arr = res.data.settings || []
		arr.forEach((s) => { settings.value[s.key] = s.value })
	} finally {
		loading.value = false
	}
}

async function save(key) {
	saving.value[key] = true
	try {
		await updateSetting(key, { value: settings.value[key] }, activeBranchId.value)
		toast.add({ severity: 'success', summary: 'Saved', detail: 'Setting updated', life: 2500 })
	} catch (e) {
		toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
	} finally {
		saving.value[key] = false
	}
}

watch(selectedBranchId, load)

onMounted(async () => {
	if (auth.isSuperAdmin) {
		const res = await getBranches()
		branches.value = res.data.data || res.data
		if (branches.value.length) selectedBranchId.value = branches.value[0].id
	} else {
		load()
	}
})
</script>

<template>
	<div class="p-4 sm:p-6 max-w-3xl mx-auto">
		<div class="flex items-center justify-between mb-5">
			<h1 class="text-xl font-bold text-gray-900">Settings</h1>
			<select
				v-if="auth.isSuperAdmin"
				v-model="selectedBranchId"
				class="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
			>
				<option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
			</select>
		</div>

		<div v-if="loading" class="text-center py-20 text-gray-400">Loading…</div>

		<div v-else class="space-y-4">
			<div v-for="group in GROUPS" :key="group.key"
				class="bg-white rounded-xl border border-gray-200 overflow-hidden">
				<div class="px-5 py-3 border-b border-gray-200 bg-gray-50">
					<h3 class="font-semibold text-gray-900">{{ group.label }}</h3>
				</div>
				<div class="divide-y divide-gray-100">
					<div v-for="field in group.fields" :key="field.key" class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-4">
						<label class="text-sm font-medium text-gray-700 sm:w-48 sm:shrink-0">{{ field.label }}</label>

						<div class="flex flex-1 items-center gap-2">
							<template v-if="field.type === 'toggle'">
								<button
									class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
									:class="settings[field.key] === 'true' || settings[field.key] === true ? 'bg-blue-600' : 'bg-gray-300'"
									@click="settings[field.key] = String(!(settings[field.key] === 'true' || settings[field.key] === true)); save(field.key)">
									<span
										class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
										:class="settings[field.key] === 'true' || settings[field.key] === true ? 'translate-x-6' : 'translate-x-1'" />
								</button>
							</template>
							<template v-else>
								<input v-model="settings[field.key]" :type="field.type"
									class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
									@keyup.enter="save(field.key)" />
								<button
									class="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 shrink-0"
									:disabled="saving[field.key]" @click="save(field.key)">
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
