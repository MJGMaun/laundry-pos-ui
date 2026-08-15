<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getLoyaltyRules, createLoyaltyRule, updateLoyaltyRule, deleteLoyaltyRule } from '@/api/loyalty.js'

const toast   = useToast()
const confirm = useConfirm()

const rules   = ref([])
const loading = ref(false)
const saving  = ref(false)

const showModal = ref(false)
const editing   = ref(null)
const form      = ref(defaultForm())

function defaultForm() {
  return { every_n_stamps: '', reward_type: 'free_load', reward_amount: '', reward_description: '', is_active: true, reset_stamps: false }
}

const REWARD_TYPES = [
  { value: 'free_load',      label: '🧺 Free load',  chip: 'bg-green-100 text-green-700' },
  { value: 'fixed_discount', label: '💸 Amount off', chip: 'bg-blue-100 text-blue-700' },
  { value: 'free_item',      label: '🧴 Free item',  chip: 'bg-amber-100 text-amber-700' },
]

const typeChip = (type) => REWARD_TYPES.find((t) => t.value === type)?.chip || 'bg-slate-100 text-slate-600'

function typeLabel(rule) {
  if (rule.reward_type === 'fixed_discount') {
    return `💸 ₱${Number(rule.reward_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} off`
  }
  return REWARD_TYPES.find((t) => t.value === rule.reward_type)?.label || rule.reward_type
}

async function load() {
  loading.value = true
  try {
    const res = await getLoyaltyRules()
    rules.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.value = defaultForm()
  showModal.value = true
}

function openEdit(rule) {
  editing.value = rule
  form.value = {
    every_n_stamps:    rule.every_n_stamps,
    reward_type:       rule.reward_type,
    reward_amount:     rule.reward_amount ?? '',
    reward_description: rule.reward_description,
    is_active:         rule.is_active,
  }
  showModal.value = true
}

async function save() {
  if (!form.value.every_n_stamps || !form.value.reward_description) return
  // An amount-off rule with no amount would redeem for ₱0 and quietly burn the
  // customer's reward, so block it here as well as server-side.
  if (form.value.reward_type === 'fixed_discount' && !(Number(form.value.reward_amount) > 0)) {
    toast.add({ severity: 'warn', summary: 'Amount required', detail: 'Enter the peso amount to take off.', life: 3000 })
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateLoyaltyRule(editing.value.id, form.value)
    } else {
      await createLoyaltyRule(form.value)
    }
    showModal.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Saved', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = false
  }
}

function remove(rule) {
  confirm.require({
    message: `Delete "${rule.reward_description}"?`,
    header: 'Delete Rule',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deleteLoyaltyRule(rule.id)
        await load()
        toast.add({ severity: 'success', summary: 'Deleted', life: 2500 })
      } catch {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete', life: 4000 })
      }
    },
  })
}

async function toggleActive(rule) {
  try {
    await updateLoyaltyRule(rule.id, { is_active: !rule.is_active })
    rule.is_active = !rule.is_active
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update', life: 4000 })
  }
}

onMounted(load)
</script>

<template>
  <div class="p-5 max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Loyalty Program</h1>
        <p class="text-sm text-slate-400 mt-0.5">Stamps are earned per load. Configure rewards per milestone.</p>
      </div>
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
        style="background: linear-gradient(135deg, #2563eb, #4f46e5); box-shadow: 0 4px 12px rgba(37,99,235,0.3);"
        @click="openCreate"
      >
        + Add Rule
      </button>
    </div>

    <!-- Empty -->
    <div v-if="!loading && !rules.length" class="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <div class="text-4xl mb-3">🎁</div>
      <p class="text-slate-500 font-medium">No loyalty rules yet</p>
      <p class="text-slate-400 text-sm mt-1">Add a rule to start rewarding your customers</p>
      <button
        class="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
        style="background: #2563eb;"
        @click="openCreate"
      >Add first rule</button>
    </div>

    <!-- Skeleton -->
    <div v-else-if="loading" class="space-y-3">
      <div v-for="n in 3" :key="n" class="skeleton h-20 rounded-2xl" />
    </div>

    <!-- Rules list -->
    <div v-else class="space-y-3">
      <div
        v-for="rule in rules"
        :key="rule.id"
        class="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-4"
        :class="!rule.is_active ? 'opacity-50' : ''"
      >
        <!-- Stamp badge -->
        <div class="flex flex-col items-center justify-center w-14 h-14 rounded-2xl shrink-0 text-center"
          style="background: linear-gradient(135deg, #eff6ff, #dbeafe);">
          <span class="text-xl font-black text-blue-600">{{ rule.every_n_stamps }}</span>
          <span class="text-[10px] text-blue-400 font-medium leading-tight">stamps</span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-800">{{ rule.reward_description }}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="typeChip(rule.reward_type)">
              {{ typeLabel(rule) }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Toggle active -->
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
            :class="rule.is_active
              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
              : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'"
            @click="toggleActive(rule)"
          >{{ rule.is_active ? 'Active' : 'Inactive' }}</button>

          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
            @click="openEdit(rule)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>

          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
            @click="remove(rule)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <Transition name="modal-backdrop">
        <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4"
          style="background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);">
          <Transition name="modal">
            <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
              <div class="px-6 pt-6 pb-4 border-b border-slate-100">
                <h2 class="text-lg font-bold text-slate-900">{{ editing ? 'Edit Rule' : 'New Loyalty Rule' }}</h2>
              </div>
              <div class="px-6 py-5 space-y-4">
                <div>
                  <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Every N stamps</label>
                  <input
                    v-model="form.every_n_stamps"
                    type="number" min="1"
                    placeholder="e.g. 10"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                  <p class="text-xs text-slate-400 mt-1">Customer earns a reward every this many stamps</p>
                </div>

                <div>
                  <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Reward type</label>
                  <div class="flex gap-2">
                    <button
                      v-for="t in REWARD_TYPES"
                      :key="t.value"
                      class="flex-1 py-2 rounded-xl text-xs font-medium border transition-all"
                      :class="form.reward_type === t.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'"
                      @click="form.reward_type = t.value"
                    >{{ t.label }}</button>
                  </div>
                  <p v-if="form.reward_type === 'free_load'" class="text-xs text-slate-400 mt-1">
                    Takes off the cheapest load that earns stamps — the value varies with what's in the order.
                  </p>
                  <p v-else-if="form.reward_type === 'fixed_discount'" class="text-xs text-slate-400 mt-1">
                    Takes off the same peso amount every time.
                  </p>
                  <p v-else class="text-xs text-slate-400 mt-1">
                    Handed over at the counter — no discount is applied to the order.
                  </p>
                </div>

                <div v-if="form.reward_type === 'fixed_discount'">
                  <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Amount off</label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                    <input
                      v-model="form.reward_amount"
                      type="number" min="0.01" step="0.01"
                      placeholder="e.g. 100"
                      class="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
                  <p class="text-xs text-slate-400 mt-1">
                    Capped at the order's stamp-earning loads, and never redeemed in part — an order too small keeps the reward pending.
                  </p>
                </div>

                <div>
                  <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Description</label>
                  <input
                    v-model="form.reward_description"
                    placeholder="e.g. 1 free load of wash & fold"
                    class="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>

                <label class="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    class="w-10 h-5 rounded-full transition-all relative"
                    :class="form.is_active ? 'bg-blue-600' : 'bg-slate-200'"
                    @click="form.is_active = !form.is_active"
                  >
                    <div class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                      :class="form.is_active ? 'left-5' : 'left-0.5'" />
                  </div>
                  <span class="text-sm text-slate-700 font-medium">Active</span>
                </label>

                <div v-if="!editing" class="rounded-xl border p-3 transition-all"
                  :class="form.reset_stamps ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'">
                  <label class="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      class="w-10 h-5 rounded-full transition-all relative shrink-0"
                      :class="form.reset_stamps ? 'bg-amber-500' : 'bg-slate-200'"
                      @click="form.reset_stamps = !form.reset_stamps"
                    >
                      <div class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        :class="form.reset_stamps ? 'left-5' : 'left-0.5'" />
                    </div>
                    <div>
                      <span class="text-sm font-medium" :class="form.reset_stamps ? 'text-amber-800' : 'text-slate-700'">Reset existing stamps</span>
                      <p class="text-xs mt-0.5" :class="form.reset_stamps ? 'text-amber-600' : 'text-slate-400'">
                        {{ form.reset_stamps ? 'All customer stamp balances will be zeroed out when this rule is saved.' : 'Existing stamps carry over to the new rule.' }}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div class="px-6 py-4 border-t border-slate-100 flex gap-3">
                <button
                  class="flex-1 py-2.5 rounded-2xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
                  @click="showModal = false"
                >Cancel</button>
                <button
                  class="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50"
                  style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
                  :disabled="saving || !form.every_n_stamps || !form.reward_description"
                  @click="save"
                >{{ saving ? 'Saving…' : 'Save' }}</button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-backdrop-enter-active { animation: fade-in 200ms ease both; }
.modal-backdrop-leave-active { animation: fade-in 150ms ease reverse both; }
.modal-enter-active { animation: scale-in 220ms cubic-bezier(0.34,1.56,0.64,1) both; }
.modal-leave-active { animation: scale-in 150ms ease reverse both; }
@keyframes fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
</style>
