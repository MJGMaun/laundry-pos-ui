<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getBranches, createBranch, updateBranch, deleteBranch, getBranchUsers, assignUser } from '@/api/branches.js'

const toast = useToast()
const confirm = useConfirm()

const branches = ref([])
const loading = ref(false)
const showForm = ref(false)
const editingId = ref(null)
const saving = ref(false)

const selectedBranch = ref(null)
const branchUsers = ref([])
const showUsers = ref(false)
const newUserId = ref('')
const assigningUser = ref(false)

const form = ref({ name: '', address: '', phone: '', email: '', tin: '' })

async function load() {
  loading.value = true
  try {
    const res = await getBranches()
    branches.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    if (editingId.value) {
      await updateBranch(editingId.value, form.value)
    } else {
      await createBranch(form.value)
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: `Branch ${editingId.value ? 'updated' : 'created'} successfully`, life: 3000 })
    closeForm()
    load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

function deactivate(id) {
  confirm.require({
    message: 'Are you sure you want to deactivate this branch?',
    header: 'Deactivate Branch',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Deactivate', severity: 'danger' },
    accept: async () => {
      try {
        await deleteBranch(id)
        toast.add({ severity: 'success', summary: 'Done', detail: 'Branch deactivated', life: 3000 })
        load()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to deactivate', life: 4000 })
      }
    },
  })
}

async function viewUsers(branch) {
  selectedBranch.value = branch
  showUsers.value = true
  const res = await getBranchUsers(branch.id)
  branchUsers.value = res.data.data || res.data
}

async function addUser() {
  if (!newUserId.value) return
  assigningUser.value = true
  try {
    await assignUser(selectedBranch.value.id, { user_id: Number(newUserId.value) })
    newUserId.value = ''
    toast.add({ severity: 'success', summary: 'Assigned', detail: 'User assigned to branch', life: 3000 })
    viewUsers(selectedBranch.value)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to assign user', life: 4000 })
  } finally {
    assigningUser.value = false
  }
}

function openForm(branch = null) {
  if (branch) {
    editingId.value = branch.id
    form.value = { name: branch.name, address: branch.address || '', phone: branch.phone || '', email: branch.email || '', tin: branch.tin || '' }
  } else {
    editingId.value = null
    form.value = { name: '', address: '', phone: '', email: '', tin: '' }
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
      <h1 class="text-xl font-bold text-gray-900">Branch Management</h1>
      <button class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700" @click="openForm()">
        + New Branch
      </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
      <div v-else-if="!branches.length" class="flex items-center justify-center h-40 text-gray-400">No branches</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Branch</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Address</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
            <th class="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="b in branches" :key="b.id">
            <td class="px-4 py-3 font-medium text-gray-900">{{ b.name }}</td>
            <td class="px-4 py-3 text-gray-500">{{ b.address || '—' }}</td>
            <td class="px-4 py-3 text-gray-600">{{ b.phone || '—' }}</td>
            <td class="px-4 py-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                :class="b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                {{ b.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex gap-1 justify-end">
                <button class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1" @click="viewUsers(b)">Users</button>
                <button class="text-xs text-blue-600 hover:text-blue-700 px-2 py-1" @click="openForm(b)">Edit</button>
                <button class="text-xs text-red-500 hover:text-red-700 px-2 py-1" @click="deactivate(b.id)">Deactivate</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Branch form modal -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 class="text-lg font-bold text-gray-900 mb-4">{{ editingId ? 'Edit' : 'New' }} Branch</h2>
          <div class="space-y-3">
            <input v-model="form.name" placeholder="Branch name *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.address" placeholder="Address" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.phone" placeholder="Phone" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.email" placeholder="Email" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.tin" placeholder="TIN" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div class="flex gap-3 mt-5">
            <button class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50" @click="closeForm">Cancel</button>
            <button
              class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
              :disabled="saving || !form.name"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Users modal -->
    <Teleport to="body">
      <div v-if="showUsers" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-900">{{ selectedBranch?.name }} — Users</h2>
            <button class="text-gray-400 hover:text-gray-600" @click="showUsers = false">✕</button>
          </div>

          <div class="divide-y divide-gray-100 mb-4 max-h-60 overflow-y-auto">
            <div v-if="!branchUsers.length" class="py-4 text-sm text-center text-gray-400">No users assigned</div>
            <div v-for="u in branchUsers" :key="u.id" class="flex items-center gap-2 py-2.5">
              <div class="flex-1">
                <div class="text-sm font-medium text-gray-900">{{ u.name }}</div>
                <div class="text-xs text-gray-500 capitalize">{{ u.role }}{{ u.username ? ' · @' + u.username : '' }}</div>
              </div>
              <span v-if="u.pivot?.is_primary" class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Primary</span>
            </div>
          </div>

          <div class="flex gap-2">
            <input
              v-model="newUserId"
              type="number"
              placeholder="User ID to assign"
              class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              class="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-60 hover:bg-blue-700"
              :disabled="assigningUser || !newUserId"
              @click="addUser"
            >
              {{ assigningUser ? '…' : 'Assign' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
