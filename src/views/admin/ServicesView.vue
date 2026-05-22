<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getServices, createService, updateService, deleteService, toggleService } from '@/api/services.js'
import { getServiceCategories, createServiceCategory, updateServiceCategory, deleteServiceCategory } from '@/api/serviceCategories.js'

const toast = useToast()
const confirm = useConfirm()

const services = ref([])
const categories = ref([])
const loading = ref(false)
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)
const filterCat = ref('')

// Category management state
const newCatName = ref('')
const addingCat = ref(false)
const savingCat = ref(false)
const editingCat = ref(null) // { id, name }

const PRICING_TYPES = [
	{ value: 'flat_rate', label: 'Flat Rate' },
	{ value: 'per_kilo', label: 'Per Kilo' },
	{ value: 'per_piece', label: 'Per Piece' },
]

const filtered = computed(() => {
	if (!filterCat.value) return services.value
	return services.value.filter((s) => s.category_id === Number(filterCat.value))
})

const form = ref({ name: '', category_id: '', pricing_type: 'flat_rate', price: '' })

async function load() {
	loading.value = true
	try {
		const [svcRes, catRes] = await Promise.all([getServices(), getServiceCategories()])
		services.value = svcRes.data.data || svcRes.data
		categories.value = catRes.data.data || catRes.data
	} finally {
		loading.value = false
	}
}

async function save() {
	saving.value = true
	try {
		const payload = { ...form.value, category_id: form.value.category_id || null }
		if (editingId.value) {
			await updateService(editingId.value, payload)
		} else {
			await createService(payload)
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
		form.value = { name: svc.name, category_id: svc.category_id || '', pricing_type: svc.pricing_type, price: svc.price }
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

// Category management
async function addCategory() {
	const name = newCatName.value.trim()
	if (!name) return
	savingCat.value = true
	try {
		const res = await createServiceCategory({ name })
		categories.value.push(res.data)
		categories.value.sort((a, b) => a.name.localeCompare(b.name))
		newCatName.value = ''
		addingCat.value = false
		toast.add({ severity: 'success', summary: 'Category added', life: 2000 })
	} catch (e) {
		toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
	} finally {
		savingCat.value = false
	}
}

async function saveEditCat() {
	const name = editingCat.value.name.trim()
	if (!name) return
	savingCat.value = true
	try {
		await updateServiceCategory(editingCat.value.id, { name })
		const idx = categories.value.findIndex((c) => c.id === editingCat.value.id)
		if (idx !== -1) categories.value[idx].name = name
		categories.value.sort((a, b) => a.name.localeCompare(b.name))
		editingCat.value = null
		// refresh services so category names update in table
		const res = await getServices()
		services.value = res.data.data || res.data
	} catch (e) {
		toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
	} finally {
		savingCat.value = false
	}
}

function removeCat(cat) {
	confirm.require({
		message: `Delete category "${cat.name}"? Services in this category will become uncategorized.`,
		header: 'Delete Category',
		icon: 'pi pi-exclamation-triangle',
		rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
		acceptProps: { label: 'Delete', severity: 'danger' },
		accept: async () => {
			try {
				await deleteServiceCategory(cat.id)
				categories.value = categories.value.filter((c) => c.id !== cat.id)
				if (filterCat.value === cat.id) filterCat.value = ''
				// refresh so category_id is cleared on affected services
				const res = await getServices()
				services.value = res.data.data || res.data
				toast.add({ severity: 'success', summary: 'Deleted', life: 2000 })
			} catch (e) {
				toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed', life: 4000 })
			}
		},
	})
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

		<!-- Categories management -->
		<div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
			<div class="flex items-center justify-between mb-3">
				<span class="text-sm font-semibold text-gray-700">Categories</span>
				<button
					v-if="!addingCat"
					class="text-xs text-blue-600 hover:text-blue-700 font-medium"
					@click="addingCat = true"
				>+ Add</button>
			</div>

			<div class="flex flex-wrap gap-2">
				<template v-for="cat in categories" :key="cat.id">
					<!-- Editing chip -->
					<div v-if="editingCat?.id === cat.id" class="flex items-center gap-1">
						<input
							v-model="editingCat.name"
							class="border border-blue-400 rounded-full px-3 py-1 text-xs w-32 focus:outline-none"
							@keyup.enter="saveEditCat"
							@keyup.escape="editingCat = null"
						/>
						<button class="text-xs text-blue-600 font-medium" :disabled="savingCat" @click="saveEditCat">Save</button>
						<button class="text-xs text-gray-400" @click="editingCat = null">✕</button>
					</div>
					<!-- Display chip -->
					<div v-else class="flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-700 group">
						<span>{{ cat.name }}</span>
						<button class="hidden group-hover:inline text-gray-400 hover:text-blue-500 ml-1" @click="editingCat = { id: cat.id, name: cat.name }">✎</button>
						<button class="hidden group-hover:inline text-gray-400 hover:text-red-500" @click="removeCat(cat)">✕</button>
					</div>
				</template>

				<!-- No categories -->
				<span v-if="!categories.length && !addingCat" class="text-xs text-gray-400">No categories yet</span>

				<!-- Add new category input -->
				<div v-if="addingCat" class="flex items-center gap-1">
					<input
						v-model="newCatName"
						placeholder="Category name"
						class="border border-blue-400 rounded-full px-3 py-1 text-xs w-36 focus:outline-none"
						@keyup.enter="addCategory"
						@keyup.escape="addingCat = false; newCatName = ''"
					/>
					<button class="text-xs text-blue-600 font-medium" :disabled="savingCat || !newCatName.trim()" @click="addCategory">Add</button>
					<button class="text-xs text-gray-400" @click="addingCat = false; newCatName = ''">✕</button>
				</div>
			</div>
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
			<div v-else-if="!filtered.length" class="flex items-center justify-center h-40 text-gray-400">No services</div>
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
						<td class="px-4 py-3">
							<span v-if="s.category" class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{{ s.category.name }}</span>
							<span v-else class="text-gray-300 text-xs">—</span>
						</td>
						<td class="px-4 py-3 text-gray-500 capitalize">{{ s.pricing_type?.replace('_', ' ') }}</td>
						<td class="px-4 py-3 text-right font-semibold text-gray-900">₱{{ Number(s.price).toFixed(2) }}</td>
						<td class="px-4 py-3 text-center">
							<button class="text-xs px-2 py-0.5 rounded-full font-medium"
								:class="s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
								@click="toggle(s.id)">
								{{ s.is_active ? 'Active' : 'Inactive' }}
							</button>
						</td>
						<td class="px-4 py-3 text-right">
							<div class="flex gap-1 justify-end">
								<button class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1" @click="openForm(s)">Edit</button>
								<button class="text-xs text-red-500 hover:text-red-700 px-2 py-1" @click="remove(s.id)">Del</button>
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
							<option value="">No category</option>
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
