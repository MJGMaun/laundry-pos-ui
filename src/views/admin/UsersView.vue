<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth.js'
import { getUsers, createUser, updateUser, deleteUser } from '@/api/users.js'
import { getBranches } from '@/api/branches.js'

const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()

const users = ref([])
const branches = ref([])
const loading = ref(false)
const search = ref('')
const showForm = ref(false)
const saving = ref(false)
const editingUser = ref(null)

const ALL_ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin',       label: 'Admin' },
  { value: 'cashier',     label: 'Cashier' },
  { value: 'staff',       label: 'Staff' },
]

// Only show roles strictly below the current user's level
const ROLE_RANK = { super_admin: 4, admin: 3, cashier: 2, staff: 1 }
const ROLES = computed(() => {
  const myRank = ROLE_RANK[auth.role] ?? 0
  return ALL_ROLES.filter(r => ROLE_RANK[r.value] < myRank)
})

const ROLE_STYLES = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin:       'bg-blue-100 text-blue-700',
  cashier:     'bg-green-100 text-green-700',
  staff:       'bg-gray-100 text-gray-600',
}

const emptyForm = () => ({ name: '', username: '', email: '', password: '', role: 'staff', branch_id: '' })
const form = ref(emptyForm())

async function load() {
  loading.value = true
  try {
    const params = {}
    if (search.value) params.search = search.value
    const res = await getUsers(params)
    users.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingUser.value = null
  form.value = emptyForm()
  showForm.value = true
}

function openEdit(user) {
  editingUser.value = user
  form.value = {
    name: user.name,
    username: user.username || '',
    email: user.email || '',
    password: '',
    role: user.role,
    branch_id: user.branches?.[0]?.id || '',
  }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingUser.value = null
  form.value = emptyForm()
}

async function save() {
  saving.value = true
  try {
    const payload = { ...form.value }
    if (!payload.branch_id) delete payload.branch_id
    if (editingUser.value && !payload.password) delete payload.password

    if (editingUser.value) {
      await updateUser(editingUser.value.id, payload)
    } else {
      await createUser(payload)
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: `User ${editingUser.value ? 'updated' : 'created'} successfully`, life: 3000 })
    closeForm()
    load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

function remove(user) {
  confirm.require({
    message: `Delete user "${user.name}"? This cannot be undone.`,
    header: 'Delete User',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deleteUser(user.id)
        toast.add({ severity: 'success', summary: 'Deleted', detail: 'User deleted', life: 3000 })
        load()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete', life: 4000 })
      }
    },
  })
}

function userBranch(user) {
  return user.branches?.[0]?.name || '—'
}

onMounted(async () => {
  load()
  if (auth.isSuperAdmin) {
    const res = await getBranches()
    branches.value = res.data.data || res.data
  }
})
</script>

<template>
  <div class="p-4 sm:p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold text-gray-900">Users</h1>
      <button
        class="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
        @click="openCreate"
      >
        + New User
      </button>
    </div>

    <div class="mb-4">
      <input
        v-model="search"
        placeholder="Search by name or username…"
        class="w-full sm:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        @keyup.enter="load"
      />
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center h-40 text-gray-400">Loading…</div>
      <div v-else-if="!users.length" class="flex items-center justify-center h-40 text-gray-400">No users found</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="hidden sm:table-cell text-left px-4 py-3 font-medium text-gray-600">Username</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Role</th>
            <th v-if="auth.isSuperAdmin" class="hidden md:table-cell text-left px-4 py-3 font-medium text-gray-600">Branch</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="u in users" :key="u.id" class="hover:bg-gray-50">
            <td class="px-4 py-3">
              <div class="font-medium text-gray-900">{{ u.name }}</div>
              <div v-if="u.email" class="text-xs text-gray-400">{{ u.email }}</div>
            </td>
            <td class="hidden sm:table-cell px-4 py-3 text-gray-600">{{ u.username ? '@' + u.username : '—' }}</td>
            <td class="px-4 py-3">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium capitalize" :class="ROLE_STYLES[u.role]">
                {{ ALL_ROLES.find(r => r.value === u.role)?.label || u.role }}
              </span>
            </td>
            <td v-if="auth.isSuperAdmin" class="hidden md:table-cell px-4 py-3 text-gray-500 text-sm">{{ userBranch(u) }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button class="text-sm text-blue-600 hover:text-blue-700 font-medium" @click="openEdit(u)">Edit</button>
                <button class="text-sm text-red-500 hover:text-red-600 font-medium" @click="remove(u)">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create / Edit modal -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 class="text-lg font-bold text-gray-900 mb-4">{{ editingUser ? 'Edit User' : 'New User' }}</h2>
          <div class="space-y-3">
            <input v-model="form.name" placeholder="Name *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.username" placeholder="Username *" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input v-model="form.email" placeholder="Email (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input
              v-model="form.password"
              type="password"
              :placeholder="editingUser ? 'New password (leave blank to keep)' : 'Password *'"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select v-model="form.role" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
            <select v-if="auth.isSuperAdmin" v-model="form.branch_id" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">No branch</option>
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>
          <div class="flex gap-3 mt-5">
            <button class="flex-1 border border-gray-300 py-2.5 rounded-xl text-sm text-gray-700 hover:bg-gray-50" @click="closeForm">Cancel</button>
            <button
              class="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-60 hover:bg-blue-700"
              :disabled="saving || !form.name || !form.username || (!editingUser && !form.password)"
              @click="save"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
