<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '@/stores/auth.js'
import { useBranchStore } from '@/stores/branch.js'
import {
  getMachines, createMachine, updateMachine, deleteMachine,
  getMachineCycles, saveMachineCycles,
} from '@/api/machines.js'

const toast       = useToast()
const confirm     = useConfirm()
const branchStore = useBranchStore()
const authStore   = useAuthStore()

const cycleDate = ref(new Date())
const cycleData = ref(null)
const loading   = ref(false)
const saving    = ref(false)
const inputs    = ref({}) // machine_id -> cycle count input

// Manage machines
const managing       = ref(false)
const machines       = ref([])
const newName        = ref('')
const newType        = ref('washer')
const addingMachine  = ref(false)

const typeEmoji = { washer: '🫧', dryer: '🔥' }

function localYMD(d) {
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateStr() {
  return cycleDate.value ? localYMD(cycleDate.value) : localYMD(new Date())
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const totalInput = computed(() =>
  Object.values(inputs.value).reduce((sum, v) => sum + (Number(v) || 0), 0)
)

const dirty = computed(() => {
  if (!cycleData.value) return false
  return cycleData.value.machines.some((m) => {
    const input = inputs.value[m.id]
    if (input === '' || input == null) return false
    return Number(input) !== m.cycle_count
  })
})

async function load() {
  // super_admin must have a branch selected
  if (authStore.isSuperAdmin && !branchStore.currentBranchId) return
  loading.value = true
  cycleData.value = null
  try {
    const res = await getMachineCycles(dateStr())
    cycleData.value = res.data
    inputs.value = Object.fromEntries(
      res.data.machines.map((m) => [m.id, m.cycle_count ?? ''])
    )
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load', life: 3000 })
  } finally {
    loading.value = false
  }
}

async function saveCounts() {
  const counts = cycleData.value.machines
    .filter((m) => inputs.value[m.id] !== '' && inputs.value[m.id] != null)
    .map((m) => ({ machine_id: m.id, cycle_count: Number(inputs.value[m.id]) }))

  if (!counts.length) {
    toast.add({ severity: 'warn', summary: 'Nothing to save', detail: 'Enter a count for at least one machine.', life: 3000 })
    return
  }
  if (counts.some((c) => c.cycle_count < 0 || !Number.isInteger(c.cycle_count))) {
    toast.add({ severity: 'warn', summary: 'Invalid count', detail: 'Counts must be whole numbers (0 or more).', life: 3000 })
    return
  }

  saving.value = true
  try {
    const res = await saveMachineCycles({ date: dateStr(), counts })
    cycleData.value = res.data
    inputs.value = Object.fromEntries(
      res.data.machines.map((m) => [m.id, m.cycle_count ?? ''])
    )
    toast.add({ severity: 'success', summary: 'Cycle counts saved', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

// ── Manage machines ───────────────────────────────────────────────────────────

async function loadMachines() {
  try {
    const res = await getMachines()
    machines.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load machines', life: 3000 })
  }
}

async function toggleManage() {
  managing.value = !managing.value
  if (managing.value) await loadMachines()
}

async function addMachine() {
  if (!newName.value.trim()) return
  addingMachine.value = true
  try {
    await createMachine({ name: newName.value.trim(), type: newType.value })
    newName.value = ''
    await Promise.all([loadMachines(), load()])
    toast.add({ severity: 'success', summary: 'Machine added', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to add machine', life: 4000 })
  } finally {
    addingMachine.value = false
  }
}

async function toggleActive(machine) {
  try {
    await updateMachine(machine.id, { is_active: !machine.is_active })
    await Promise.all([loadMachines(), load()])
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to update machine', life: 4000 })
  }
}

function removeMachine(machine) {
  confirm.require({
    message: `Delete ${machine.name}? Its past cycle counts are kept, but it will no longer appear on the daily sheet.`,
    header: 'Delete machine',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deleteMachine(machine.id)
        await Promise.all([loadMachines(), load()])
        toast.add({ severity: 'success', summary: 'Machine deleted', life: 2500 })
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to delete machine', life: 4000 })
      }
    },
  })
}

// Reload when date changes
watch(cycleDate, load)

// Reload when super_admin switches branch
watch(() => branchStore.currentBranchId, (id) => {
  if (authStore.isSuperAdmin) {
    cycleData.value = null
    if (id) {
      load()
      if (managing.value) loadMachines()
    }
  }
})

onMounted(load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-3xl mx-auto">

    <!-- Header -->
    <div class="flex items-center gap-3 mb-5">
      <h1 class="text-xl font-bold text-gray-900">Machine Cycles</h1>
      <span v-if="branchStore.currentBranch" class="text-sm text-gray-400">
        — {{ branchStore.currentBranch.name }}
      </span>
      <button
        class="ml-auto text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
        @click="toggleManage"
      >{{ managing ? 'Done' : '⚙️ Manage machines' }}</button>
    </div>

    <!-- Super admin: no branch selected -->
    <div
      v-if="authStore.isSuperAdmin && !branchStore.currentBranchId"
      class="flex flex-col items-center justify-center py-20 text-center"
    >
      <div class="text-4xl mb-3">🏪</div>
      <div class="text-base font-semibold text-gray-700 mb-1">Select a branch first</div>
      <div class="text-sm text-gray-400">Use the branch selector in the top bar to choose a branch.</div>
    </div>

    <template v-else>

      <!-- Manage machines panel -->
      <div v-if="managing" class="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 class="font-semibold text-gray-900 mb-3">Machines</h3>

        <!-- Add form -->
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <input
            v-model="newName"
            type="text"
            placeholder="e.g. Washer 3"
            class="flex-1 min-w-40 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            @keyup.enter="addMachine"
          />
          <select
            v-model="newType"
            class="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-all"
          >
            <option value="washer">🫧 Washer</option>
            <option value="dryer">🔥 Dryer</option>
          </select>
          <button
            class="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
            :disabled="addingMachine || !newName.trim()"
            @click="addMachine"
          >{{ addingMachine ? 'Adding…' : 'Add' }}</button>
        </div>

        <div v-if="!machines.length" class="text-sm text-gray-400 text-center py-4">
          No machines yet. Add your washers and dryers above.
        </div>

        <div v-else class="divide-y divide-gray-50">
          <div
            v-for="m in machines"
            :key="m.id"
            class="flex items-center justify-between gap-3 py-2.5"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span>{{ typeEmoji[m.type] }}</span>
              <span class="text-sm font-medium truncate" :class="m.is_active ? 'text-gray-800' : 'text-gray-400 line-through'">
                {{ m.name }}
              </span>
              <span class="text-xs text-gray-400 capitalize">{{ m.type }}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                class="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all"
                :class="m.is_active
                  ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                  : 'text-green-600 border-green-200 hover:bg-green-50'"
                @click="toggleActive(m)"
              >{{ m.is_active ? 'Deactivate' : 'Activate' }}</button>
              <button
                class="text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-all"
                @click="removeMachine(m)"
              >Delete</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Date picker -->
      <div class="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <span class="text-sm text-gray-500 font-medium">Date</span>
        <DatePicker
          v-model="cycleDate"
          date-format="M dd, yy"
          show-icon
          icon-display="input"
          placeholder="Select date"
          class="cycles-datepicker"
          @update:model-value="load"
        />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-16 text-gray-400">Loading…</div>

      <div v-else-if="cycleData" class="space-y-4">

        <!-- No machines yet -->
        <div v-if="!cycleData.machines.length" class="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <div class="text-4xl mb-3">🧺</div>
          <div class="text-base font-semibold text-gray-700 mb-1">No machines yet</div>
          <div class="text-sm text-gray-400">Use "Manage machines" above to add your washers and dryers.</div>
        </div>

        <!-- Daily count sheet -->
        <div v-else class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-base">🔄</span>
              <h3 class="font-semibold text-gray-900">Cycles This Day</h3>
            </div>
            <span class="text-xs text-gray-400">{{ cycleData.machines.length }} machine{{ cycleData.machines.length !== 1 ? 's' : '' }}</span>
          </div>

          <div class="divide-y divide-gray-50">
            <div
              v-for="m in cycleData.machines"
              :key="m.id"
              class="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  <span>{{ typeEmoji[m.type] }}</span>
                  <span class="truncate">{{ m.name }}</span>
                </div>
                <div v-if="m.recorded_by" class="text-xs text-gray-400 mt-0.5">
                  Recorded by {{ m.recorded_by }} · {{ fmtTime(m.recorded_at) }}
                </div>
                <div v-else class="text-xs text-gray-300 mt-0.5">Not recorded yet</div>
              </div>
              <input
                v-model="inputs[m.id]"
                type="number" min="0" step="1"
                placeholder="—"
                class="w-24 text-right border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold tabular-nums focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                @keyup.enter="saveCounts"
              />
            </div>

            <!-- Total -->
            <div class="flex items-center justify-between px-5 py-3 bg-gray-50">
              <div class="text-sm font-medium text-gray-700">Total cycles</div>
              <span class="font-bold text-gray-900 tabular-nums pr-3">{{ totalInput }}</span>
            </div>
          </div>
        </div>

        <!-- Save -->
        <button
          v-if="cycleData.machines.length"
          class="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
          style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
          :disabled="saving || !dirty"
          @click="saveCounts"
        >{{ saving ? 'Saving…' : dirty ? 'Save Cycle Counts' : 'All Saved' }}</button>

      </div>
    </template>

  </div>
</template>

<style>
.cycles-datepicker .p-datepicker-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 14px;
  color: #111827;
  width: 150px;
}
.cycles-datepicker .p-datepicker-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
</style>
