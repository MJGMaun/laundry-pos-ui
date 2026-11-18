<script setup>
// GCash proof input: last 4+ digits of the reference number, or a photo of
// the receipt. Either one is enough; the backend enforces the same rule.
import { ref, watch, onBeforeUnmount } from 'vue'
import { compressImage } from '@/utils/compressImage.js'

const reference = defineModel('reference', { default: '' })
const receipt   = defineModel('receipt', { default: null })
defineProps({ allowPhoto: { type: Boolean, default: true } })

const fileInput = ref(null)
const preview   = ref('')
const busy      = ref(false)

watch(receipt, (f) => {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = f instanceof Blob ? URL.createObjectURL(f) : ''
}, { immediate: true })
onBeforeUnmount(() => { if (preview.value) URL.revokeObjectURL(preview.value) })

async function onPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  busy.value = true
  try { receipt.value = await compressImage(file) } finally { busy.value = false }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <span class="w-16 shrink-0 text-xs text-slate-500">Ref # <span class="text-red-400">*</span></span>
      <input
        v-model="reference"
        inputmode="numeric"
        maxlength="20"
        placeholder="Last 4 digits"
        class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tracking-widest transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
      />
      <button
        v-if="allowPhoto"
        type="button"
        class="shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-95"
        :class="receipt ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'"
        :disabled="busy"
        @click="fileInput?.click()"
      >{{ busy ? '…' : receipt ? '📷 Retake' : '📷 Photo' }}</button>
      <input ref="fileInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onPick" />
    </div>
    <div v-if="preview" class="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-1.5">
      <img :src="preview" alt="GCash receipt" class="h-12 w-12 rounded-lg object-cover" />
      <span class="flex-1 text-xs font-medium text-emerald-700">Receipt photo attached</span>
      <button type="button" class="px-2 text-xs font-semibold text-red-500 hover:text-red-600" @click="receipt = null">✕ Remove</button>
    </div>
    <div v-else class="px-1 text-[11px] text-slate-400">Type the last 4 digits of the GCash reference, or take a photo of the receipt.</div>
  </div>
</template>
