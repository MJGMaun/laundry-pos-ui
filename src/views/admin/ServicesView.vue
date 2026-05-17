<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getServices, createService, updateService, deleteService, toggleService } from '@/api/services.js'

const toast = useToast()
const confirm = useConfirm()

const services = ref([])
const loading = ref(false)
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const filterCat = ref('')

const PRICING_TYPES = [
	{ value: 'flat_rate', label: 'Flat Rate' },
	{ value: 'per_kilo', label: 'Per Kilo' },
	{ value: 'per_piece', label: 'Per Piece' },
]

const categories = computed(() => {
	const map = new Map()
	services.value.forEach((s) => {
		if (s.category && !map.has(s.category_id)) map.set(s.category_id, s.category)
	})
	return Array.from(map.values())
})

const filtered = computed(() => {
	if (!filterCat.value) return services.value
	return services.value.filter((s) => s.category_id === Number(filterCat.value))
})

const form = ref({ name: '', category_id: '', pricing_type: 'flat_rate', price: '' })

async function load() {
	loading.value = true
	try {
		const res = await getServices()
		services.value = res.data.data || res.data
	} finally {
		loading.value = false
	}
}

async function save() {
	saving.value = true
	try {
		if (editingId.value) {
			await updateService(editingId.value, form.value)
		} else {
			await createService(form.value)
		}
		toast.add({ severity: 'success', summary: 'Saved', detail: `Service ${editingId.value ? 'updated' : 'created'} successfully`, life: 3000 })
		closeForm()
		load()
	} catch (e) {
		toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
	} finally {
		saving.value = false
	}
}

async function toggle(id) {
	await toggleService(id)
	load()
}

function remove(id) {
	confirm.require({
		message: 'Are you sure you want to delete this service?',
		header: 'Delete Service',
		icon: 'pi pi-exclamation-triangle',
		rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
		acceptProps: { label: 'Delete', severity: 'danger' },
		accept: async () => {
			try {
				await deleteService(id)
				toast.add({ severity: 'success', summary: 'Deleted', detail: 'Service deleted', life: 3000 })
				load()
			} catch (e) {
				toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete', life: 4000 })
			}
		},
	})
}

function openForm(svc = null) {
	if (svc) {
		editingId.value = svc.id
		form.value = { name: svc.name, category_id: svc.category_id, pricing_type: svc.pricing_type, price: svc.price }
	} else {
		editingId.value = null
		form.value = { name: '', category_id: '', pricing_type: 'flat_rate', price: '' }
	}
	showForm.value = true
}

function closeForm() {
	showForm.value = false
	editingId.value = null
}

onMounted(load)
</script>

<template>
	<div class="p-4 sm:p-6 max-w-5xl mx-auto">
		<div class="flex items-center justify-between mb-5">
			<h1 class="text-xl font-bold text-gray-900">Services</h1>
			<button class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
				@click="openForm()">
				+ New Service
			</button>
		</div>

		<!-- Category filter -->
		<div class="mb-4">
			<select v-model="filterCat" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
				<option value="">All categories</option>
				<option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
			</select>
		</div>

		<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
			<div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
			<div v-else-if="!filtered.length" class="flex items-center justify-center h-40 text-gray-400">No services
			</div>
			<table v-else class="w-full text-sm">
				<thead class="bg-gray-50 border-b border-gray-200">
					<tr>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Category</th>
						<th class="text-left px-4 py-3 font-medium text-gray-600">Pricing</th>
						<th class="text-right px-4 py-3 font-medium text-gray-600">Price</th>
						<th class="text-center px-4 py-3 font-medium text-gray-600">Active</th>
						<th class="px-4 py-3" />
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					<tr v-for="s in filtered" :key="s.id" :class="!s.is_active ? 'opacity-50' : ''">
						<td class="px-4 py-3 font-medium text-gray-900">{{ s.name }}</td>
						<td class="px-4 py-3 text-gray-600">{{ s.category?.name }}</td>
						<td class="px-4 py-3 text-gray-500 capitalize">{{ s.pricing_type?.replace('_', ' ') }}</td>
						<td class="px-4 py-3 text-right font-semibold text-gray-900">₱{{ Number(s.price).toFixed(2) }}
						</td>
						<td class="px-4 py-3 text-center">
							<button class="text-xs px-2 py-0.5 rounded-full font-medium"
								:class="s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
								@click="toggle(s.id)">
								{{ s.is_active ? 'Active' : 'Inactive' }}
							</button>
						</td>
						<td class="px-4 py-3 text-right">
							<div class="flex gap-1 justify-end">
								<button class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1"
									@click="openForm(s)">Edit</button>
								<button class="text-xs text-red-500 hover:text-red-700 px-2 py-1"
									@click="remove(s.id)">Del</button>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Form modal -->
		<Teleport to="body">
			<div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
				<div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
					<h2 class="text-lg font-bold text-gray-900 mb-4">{{ editingId ? 'Edit' : 'New' }} Service</h2>
					<div class="space-y-3">
						<input v-model="form.name" placeholder="Service name *"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
						<select v-model="form.category_id"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
							<option value="">Select category *</option>
							<option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
						</select>
						<select v-model="form.pricing_type"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
							<option v-for="t in PRICING_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
						</select>
						<input v-model="form.price" type="number" step="0.01" min="0" placeholder="Price *"
							class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
					</div>
					<div class="flex gap-3 mt-5">
						<button
							class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
							@click="closeForm">Cancel</button>
						<button
							class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
							:disabled="saving || !form.name || !form.price" @click="save">
							{{ saving ? 'Saving…' : 'Save' }}
						</button>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>
