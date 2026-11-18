<script setup>
// Small 📎 button that loads a payment's GCash receipt photo (authenticated
// blob fetch) and shows it full size.
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import { getPaymentReceipt } from '@/api/payments.js'

const props = defineProps({ paymentId: { type: [Number, String], required: true } })

const show    = ref(false)
const url     = ref('')
const loading = ref(false)
const error   = ref('')

async function open() {
  show.value = true
  if (url.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await getPaymentReceipt(props.paymentId)
    url.value = URL.createObjectURL(res.data)
  } catch {
    error.value = 'Could not load the receipt photo.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600"
    title="View GCash receipt"
    @click.stop="open"
  >📎 Receipt</button>
  <Dialog v-model:visible="show" modal header="GCash receipt" :style="{ width: '480px', maxWidth: '95vw' }" :draggable="false">
    <div v-if="loading" class="py-10 text-center text-sm text-slate-400">Loading…</div>
    <div v-else-if="error" class="py-10 text-center text-sm text-red-500">{{ error }}</div>
    <a v-else-if="url" :href="url" target="_blank" rel="noopener">
      <img :src="url" alt="GCash receipt" class="max-h-[70vh] w-full rounded-xl object-contain" />
    </a>
  </Dialog>
</template>
