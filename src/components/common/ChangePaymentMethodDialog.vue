<script setup>
// Admin correction: switch a payment between cash and GCash (e.g. GCash tapped
// by mistake). The backend keeps the original method and who changed it.
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { changePaymentMethod } from '@/api/payments.js'

const visible = defineModel('visible', { default: false })
const props = defineProps({ payment: { type: Object, default: null } })
const emit = defineEmits(['changed'])
const toast = useToast()

const reference = ref('')
const saving = ref(false)
const error = ref('')

const target = computed(() => (props.payment?.method === 'gcash' ? 'cash' : 'gcash'))
const label = (m) => (m === 'gcash' ? 'GCash' : 'Cash')

watch(visible, (v) => {
  if (v) { reference.value = props.payment?.reference_number || ''; error.value = '' }
})

async function save() {
  error.value = ''
  if (target.value === 'gcash' && props.payment?.type !== 'refund'
      && reference.value.trim().length < 4 && !props.payment?.has_receipt) {
    error.value = 'Enter at least the last 4 digits of the GCash reference number.'
    return
  }
  saving.value = true
  try {
    const res = await changePaymentMethod(props.payment.id, {
      method: target.value,
      reference_number: target.value === 'gcash' ? reference.value.trim() : undefined,
    })
    toast.add({ severity: 'success', summary: 'Payment updated', detail: `Changed to ${label(target.value)}. Cash and GCash totals updated.`, life: 3500 })
    visible.value = false
    emit('changed', res.data.data)
  } catch (e) {
    error.value = e.response?.data?.message || 'Failed to change the payment method.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" modal header="Change payment method" :style="{ width: '380px', maxWidth: '95vw' }" :draggable="false">
    <div v-if="payment" class="space-y-3 pt-1">
      <div class="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
        <span class="text-slate-500">₱{{ Number(payment.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 }) }} {{ payment.type }}</span>
        <span class="font-bold text-slate-800">{{ label(payment.method) }} → {{ label(target) }}</span>
      </div>
      <p class="text-xs text-slate-500">
        Use this when the wrong method was tapped. The amount and date stay the same; only which account it counts toward changes. The original method is kept in the record.
      </p>
      <div v-if="target === 'gcash' && payment.type !== 'refund'" class="flex items-center gap-2">
        <span class="w-16 shrink-0 text-xs text-slate-500">Ref # <span class="text-red-400">*</span></span>
        <input
          v-model="reference"
          inputmode="numeric"
          placeholder="Last 4 digits"
          class="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm tracking-widest focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
        />
      </div>
      <div v-if="error" class="px-1 text-xs font-medium text-red-500">{{ error }}</div>
      <div class="flex gap-2 pt-1">
        <button class="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50" @click="visible = false">Cancel</button>
        <button
          class="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style="background: linear-gradient(135deg, #2563eb, #4f46e5);"
          :disabled="saving"
          @click="save"
        >{{ saving ? 'Saving…' : `Change to ${label(target)}` }}</button>
      </div>
    </div>
  </Dialog>
</template>
