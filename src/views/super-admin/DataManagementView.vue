<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { getBranches } from '@/api/branches.js'
import { getDataCounts, purgeData } from '@/api/dataManagement.js'

const toast = useToast()

// ── State ─────────────────────────────────────────────────────────────────────
const branches         = ref([])
const loadingBranches  = ref(false)
const selectedBranchId = ref(null)
const counts           = ref(null)
const loadingCounts    = ref(false)
const purging          = ref(false)

const showConfirm  = ref(false)
const confirmInput = ref('')
const purgeResult  = ref(null)

const CATEGORIES = [
  {
    key:         'orders',
    label:       'Orders & Payments',
    emoji:       '📋',
    description: 'All orders, loads, payments, and loyalty transactions/stamps tied to orders. Also resets customer loyalty points, total visits, and total spent.',
    color:       '#f87171',
    countKeys:   ['orders', 'payments', 'loads'],
  },
  {
    key:         'customers',
    label:       'Customers',
    emoji:       '👥',
    description: 'All customer records and their full loyalty history (stamps, rewards, transactions). Cannot be selected alone if Orders is not selected — customer stats depend on it.',
    color:       '#fb923c',
    countKeys:   ['customers', 'loyalty_stamps', 'loyalty_rewards'],
  },
  {
    key:         'expenses',
    label:       'Expenses',
    emoji:       '💸',
    description: 'All expense records for this branch.',
    color:       '#fbbf24',
    countKeys:   ['expenses'],
  },
  {
    key:         'cash_balances',
    label:       'Cash Balances',
    emoji:       '💰',
    description: 'Daily opening cash balance records.',
    color:       '#34d399',
    countKeys:   ['cash_balances'],
  },
]

const selectedTypes = ref([])

// ── Computed ──────────────────────────────────────────────────────────────────
const branchOptions = computed(() =>
  branches.value.map(b => ({ label: b.name, value: b.id }))
)

const selectedBranch = computed(() =>
  branches.value.find(b => b.id === selectedBranchId.value)
)

const totalRecords = computed(() => {
  if (!counts.value) return 0
  return Object.values(counts.value).reduce((s, v) => s + v, 0)
})

const readyToPurge = computed(() =>
  selectedTypes.value.length > 0 && selectedBranchId.value !== null
)

const confirmationWord = computed(() =>
  selectedBranch.value ? selectedBranch.value.name.toUpperCase().replace(/\s+/g, '_') : 'DELETE'
)

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  loadingBranches.value = true
  try {
    const res = await getBranches()
    branches.value = res.data.data || res.data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load branches', life: 3000 })
  } finally {
    loadingBranches.value = false
  }
})

// ── Watchers ──────────────────────────────────────────────────────────────────
watch(selectedBranchId, async (id) => {
  counts.value = null
  purgeResult.value = null
  selectedTypes.value = []
  if (!id) return
  loadingCounts.value = true
  try {
    const res    = await getDataCounts(id)
    counts.value = res.data
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load data counts', life: 3000 })
  } finally {
    loadingCounts.value = false
  }
})

// ── Methods ───────────────────────────────────────────────────────────────────
function getCategoryTotal(cat) {
  if (!counts.value) return null
  return cat.countKeys.reduce((s, k) => s + (counts.value[k] || 0), 0)
}

function toggleType(key) {
  const idx = selectedTypes.value.indexOf(key)
  if (idx === -1) selectedTypes.value.push(key)
  else selectedTypes.value.splice(idx, 1)
}

function isSelected(key) {
  return selectedTypes.value.includes(key)
}

function selectAll() {
  selectedTypes.value = CATEGORIES.map(c => c.key)
}

function clearAll() {
  selectedTypes.value = []
}

function openConfirm() {
  if (!readyToPurge.value) return
  confirmInput.value = ''
  showConfirm.value  = true
}

function closeConfirm() {
  showConfirm.value  = false
  confirmInput.value = ''
}

async function executePurge() {
  if (confirmInput.value !== confirmationWord.value) {
    toast.add({ severity: 'warn', summary: 'Type the branch name to confirm', life: 3000 })
    return
  }
  purging.value = true
  try {
    const res        = await purgeData(selectedBranchId.value, selectedTypes.value)
    purgeResult.value = res.data
    closeConfirm()
    // Refresh counts
    const c = await getDataCounts(selectedBranchId.value)
    counts.value = c.data
    selectedTypes.value = []
    toast.add({ severity: 'success', summary: 'Purge Complete', detail: `Data cleared for ${res.data.branch}`, life: 4000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Purge Failed', detail: e.response?.data?.message || 'Something went wrong', life: 5000 })
  } finally {
    purging.value = false
  }
}

function fmt(n) {
  return n === null ? '—' : n.toLocaleString()
}

function resultRows(deleted) {
  return Object.entries(deleted).map(([k, v]) => ({
    label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: v,
  }))
}
</script>

<template>
  <div class="min-h-screen p-6" style="background: #0a0f1e;">

    <!-- Header ---------------------------------------------------------------->
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-1">
        <span class="text-2xl">🗑️</span>
        <h1 class="text-2xl font-bold text-white">Data Management</h1>
        <span
          class="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
          style="background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);"
        >
          Super Admin
        </span>
      </div>
      <p style="color: rgba(148,163,184,0.7);" class="text-sm">
        Wipe test data from a branch so you start with a clean slate. This is permanent and cannot be undone.
      </p>
    </div>

    <!-- Branch Selector -------------------------------------------------------->
    <div
      class="rounded-2xl p-5 mb-6"
      style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);"
    >
      <label class="block text-sm font-medium mb-2" style="color: rgba(148,163,184,0.8);">
        Select Branch to Manage
      </label>
      <select
        v-model="selectedBranchId"
        class="w-full md:w-80 rounded-xl px-3 py-2.5 text-sm"
        style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: white;"
      >
        <option :value="null" disabled style="background: #0f172a;">
          {{ loadingBranches ? 'Loading branches…' : 'Choose a branch…' }}
        </option>
        <option
          v-for="b in branches"
          :key="b.id"
          :value="b.id"
          style="background: #0f172a; color: white;"
        >
          {{ b.name }}{{ b.is_test ? ' 🧪' : '' }}
        </option>
      </select>

      <!-- Branch Summary Chips -->
      <div v-if="selectedBranch" class="flex flex-wrap gap-2 mt-3">
        <span
          class="px-2.5 py-1 rounded-lg text-xs"
          style="background: rgba(99,102,241,0.15); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.25);"
        >
          🏪 {{ selectedBranch.name }}
        </span>
        <span
          v-if="selectedBranch.is_test"
          class="px-2.5 py-1 rounded-lg text-xs"
          style="background: rgba(234,179,8,0.15); color: #fde047; border: 1px solid rgba(234,179,8,0.25);"
        >
          🧪 Test Branch
        </span>
        <span
          v-if="!selectedBranch.is_active"
          class="px-2.5 py-1 rounded-lg text-xs"
          style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25);"
        >
          ⛔ Inactive
        </span>
      </div>
    </div>

    <!-- Data Overview ---------------------------------------------------------->
    <Transition name="slide-up">
      <div v-if="selectedBranchId">

        <!-- Loading -->
        <div v-if="loadingCounts" class="flex items-center gap-3 py-8 justify-center" style="color: rgba(148,163,184,0.5);">
          <i class="pi pi-spin pi-spinner text-lg" />
          <span class="text-sm">Loading data counts…</span>
        </div>

        <template v-else-if="counts">

          <!-- Total badge -->
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold uppercase tracking-wider" style="color: rgba(148,163,184,0.6);">
              Branch Data
            </h2>
            <div class="flex items-center gap-2">
              <span
                class="px-3 py-1 rounded-full text-sm font-semibold"
                :style="totalRecords === 0
                  ? 'background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.25);'
                  : 'background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25);'"
              >
                {{ totalRecords === 0 ? '✅ Clean slate' : `${fmt(totalRecords)} total records` }}
              </span>
            </div>
          </div>

          <!-- Category Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div
              v-for="cat in CATEGORIES"
              :key="cat.key"
              class="rounded-2xl p-5 cursor-pointer transition-all duration-200 select-none"
              :style="[
                isSelected(cat.key)
                  ? `background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); box-shadow: 0 0 0 1px rgba(239,68,68,0.2);`
                  : `background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);`,
              ]"
              @click="toggleType(cat.key)"
            >
              <div class="flex items-start gap-3">
                <!-- Checkbox -->
                <div
                  class="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-150"
                  :style="isSelected(cat.key)
                    ? 'background: #ef4444; border: 1px solid #ef4444;'
                    : 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15);'"
                >
                  <i v-if="isSelected(cat.key)" class="pi pi-check text-white" style="font-size: 10px;" />
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">{{ cat.emoji }}</span>
                    <span class="font-semibold text-white text-sm">{{ cat.label }}</span>
                    <!-- Count badge -->
                    <span
                      class="ml-auto px-2 py-0.5 rounded-full text-xs font-bold tabular-nums"
                      :style="getCategoryTotal(cat) > 0
                        ? 'background: rgba(239,68,68,0.18); color: #fca5a5;'
                        : 'background: rgba(52,211,153,0.12); color: #6ee7b7;'"
                    >
                      {{ fmt(getCategoryTotal(cat)) }}
                    </span>
                  </div>
                  <p class="text-xs leading-relaxed" style="color: rgba(148,163,184,0.6);">
                    {{ cat.description }}
                  </p>

                  <!-- Sub-counts -->
                  <div class="flex flex-wrap gap-2 mt-2">
                    <span
                      v-for="k in cat.countKeys"
                      :key="k"
                      class="px-2 py-0.5 rounded-md text-xs tabular-nums"
                      style="background: rgba(255,255,255,0.06); color: rgba(148,163,184,0.7);"
                    >
                      {{ k.replace(/_/g, ' ') }}: {{ fmt(counts[k]) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Select / Clear controls -->
          <div class="flex items-center gap-3 mb-6">
            <button
              class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style="background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25);"
              @click="selectAll"
            >
              Select All
            </button>
            <button
              class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style="background: rgba(255,255,255,0.05); color: rgba(148,163,184,0.7); border: 1px solid rgba(255,255,255,0.1);"
              @click="clearAll"
            >
              Clear
            </button>

            <div class="flex-1" />

            <!-- Purge button -->
            <button
              :disabled="!readyToPurge"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
              :style="readyToPurge
                ? 'background: linear-gradient(135deg, #ef4444, #dc2626); color: white; box-shadow: 0 4px 14px rgba(239,68,68,0.35); cursor: pointer;'
                : 'background: rgba(255,255,255,0.05); color: rgba(148,163,184,0.35); cursor: not-allowed; border: 1px solid rgba(255,255,255,0.07);'"
              @click="openConfirm"
            >
              <i class="pi pi-trash text-sm" />
              Purge Selected
              <span
                v-if="selectedTypes.length > 0"
                class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style="background: rgba(255,255,255,0.25);"
              >{{ selectedTypes.length }}</span>
            </button>
          </div>

          <!-- Result Card -------------------------------------------------------->
          <Transition name="slide-up">
            <div
              v-if="purgeResult"
              class="rounded-2xl p-5 mb-6"
              style="background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.25);"
            >
              <div class="flex items-center gap-2 mb-3">
                <span class="text-lg">✅</span>
                <span class="font-semibold text-white text-sm">Purge Complete — {{ purgeResult.branch }}</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div
                  v-for="row in resultRows(purgeResult.deleted)"
                  :key="row.label"
                  class="rounded-lg px-3 py-2"
                  style="background: rgba(255,255,255,0.04);"
                >
                  <div class="text-xs mb-0.5" style="color: rgba(148,163,184,0.55);">{{ row.label }}</div>
                  <div class="text-sm font-semibold" style="color: #6ee7b7;">{{ fmt(row.value) }} deleted</div>
                </div>
              </div>
              <button
                class="mt-3 text-xs"
                style="color: rgba(148,163,184,0.4);"
                @click="purgeResult = null"
              >
                Dismiss
              </button>
            </div>
          </Transition>

        </template>
      </div>
    </Transition>

    <!-- Confirmation Modal ---------------------------------------------------->
    <Teleport to="body">
      <div
        v-if="showConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);"
        @click.self="!purging && closeConfirm()"
      >
        <div
          class="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
          style="background: #0f172a; border: 1px solid rgba(239,68,68,0.3);"
        >
          <!-- Modal header -->
          <div
            class="flex items-center gap-3 px-6 py-5"
            style="border-bottom: 1px solid rgba(239,68,68,0.15);"
          >
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style="background: rgba(239,68,68,0.15);"
            >⚠️</div>
            <div>
              <div class="font-bold text-white text-base">Confirm Permanent Deletion</div>
              <div class="text-xs mt-0.5" style="color: rgba(239,68,68,0.8);">This cannot be undone</div>
            </div>
          </div>

          <!-- Modal body -->
          <div class="px-6 py-5 space-y-4">
            <!-- What will be deleted -->
            <div
              class="rounded-xl p-4"
              style="background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2);"
            >
              <div class="text-xs font-semibold uppercase tracking-wide mb-2" style="color: rgba(239,68,68,0.7);">
                You are about to delete from <span class="text-white">{{ selectedBranch?.name }}</span>:
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="key in selectedTypes"
                  :key="key"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style="background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.25);"
                >
                  {{ CATEGORIES.find(c => c.key === key)?.emoji }}
                  {{ CATEGORIES.find(c => c.key === key)?.label }}
                </span>
              </div>
            </div>

            <!-- Confirmation input -->
            <div>
              <label class="block text-sm mb-2" style="color: rgba(148,163,184,0.7);">
                Type <span class="font-mono font-bold px-1.5 py-0.5 rounded" style="background: rgba(255,255,255,0.08); color: white;">{{ confirmationWord }}</span> to confirm:
              </label>
              <input
                v-model="confirmInput"
                :placeholder="confirmationWord"
                :disabled="purging"
                class="w-full rounded-xl px-3 py-2.5 text-sm font-mono"
                style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: white;"
                @keydown.enter="executePurge"
              />
            </div>

            <!-- Action buttons -->
            <div class="flex gap-3 pt-1">
              <button
                class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style="background: rgba(255,255,255,0.05); color: rgba(148,163,184,0.8); border: 1px solid rgba(255,255,255,0.1);"
                :disabled="purging"
                @click="closeConfirm"
              >
                Cancel
              </button>
              <button
                class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2"
                :disabled="confirmInput !== confirmationWord || purging"
                :style="confirmInput === confirmationWord && !purging
                  ? 'background: linear-gradient(135deg, #ef4444, #dc2626); color: white; box-shadow: 0 4px 14px rgba(239,68,68,0.3); cursor: pointer;'
                  : 'background: rgba(255,255,255,0.05); color: rgba(148,163,184,0.3); cursor: not-allowed;'"
                @click="executePurge"
              >
                <i v-if="purging" class="pi pi-spin pi-spinner text-sm" />
                <i v-else class="pi pi-trash text-sm" />
                {{ purging ? 'Purging…' : 'Yes, Delete Everything' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
.slide-up-enter-active { transition: all 0.25s ease; }
.slide-up-leave-active { transition: all 0.2s ease; }
.slide-up-enter-from  { opacity: 0; transform: translateY(10px); }
.slide-up-leave-to    { opacity: 0; transform: translateY(-6px); }
</style>
