<script setup>
import { ref, watch } from 'vue'
import { getOrder } from '@/api/orders.js'
import { getSettings } from '@/api/settings.js'
import { useToast } from 'primevue/usetoast'
import { usePrinter } from '@/composables/usePrinter.js'
import { buildReceiptBytes } from '@/utils/escpos.js'
import ReceiptDocument from './ReceiptDocument.vue'

const props = defineProps({
  orderId: { type: [Number, String], default: null },
})

const emit = defineEmits(['close'])

const toast    = useToast()
const printer  = usePrinter()

const loading  = ref(false)
const printing = ref(false)
const order    = ref(null)
const settings = ref({})

watch(
  () => props.orderId,
  async (id) => {
    if (!id) { order.value = null; return }
    loading.value = true
    order.value   = null
    try {
      const [orderRes, settingsRes] = await Promise.all([
        getOrder(id),
        getSettings(),
      ])
      order.value    = orderRes.data.data || orderRes.data
      const arr      = settingsRes.data.settings || []
      const flat     = {}
      arr.forEach((s) => { flat[s.key] = s.value })
      settings.value = flat
    } catch (e) {
      console.error('ReceiptModal load error', e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function connectAndPrint() {
  if (!order.value) return
  printing.value = true
  try {
    // Connect if not already connected
    if (!printer.connected.value) {
      const ok = await printer.connect()
      if (!ok) {
        toast.add({ severity: 'error', summary: 'Printer', detail: 'Could not connect to printer', life: 4000 })
        return
      }
    }
    const bytes = buildReceiptBytes(order.value, settings.value)
    await printer.print(bytes)
    toast.add({ severity: 'success', summary: 'Printed', detail: 'Receipt sent to printer', life: 2500 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Print error', detail: e.message || 'Failed to print', life: 4000 })
  } finally {
    printing.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <!-- ── Modal backdrop ── -->
  <Teleport to="body">
    <Transition name="rcp-modal-backdrop">
      <div
        v-if="orderId"
        class="rcp-modal-overlay"
        @click.self="close"
      >
        <Transition name="rcp-modal">
          <div class="rcp-modal-box">

            <!-- Header bar -->
            <div class="rcp-modal-header">
              <span class="rcp-modal-title">Receipt Preview</span>
              <button class="rcp-modal-close" @click="close">✕</button>
            </div>

            <!-- Receipt preview (visual, in the modal) -->
            <div class="rcp-modal-body">
              <div v-if="loading" class="rcp-modal-loading">
                <svg class="rcp-spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(100,116,139,0.3)" stroke-width="3"/>
                  <path d="M12 2a10 10 0 0110 10" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>
                </svg>
                <span>Loading receipt…</span>
              </div>
              <div v-else-if="order" class="rcp-paper">
                <ReceiptDocument :order="order" :settings="settings" />
              </div>
            </div>

            <!-- Actions -->
            <div class="rcp-modal-footer">
              <button class="rcp-btn-ghost" @click="close">Close</button>
              <button
                class="rcp-btn-print"
                :disabled="loading || !order || printing"
                @click="connectAndPrint"
              >
                <span v-if="printing">Printing…</span>
                <span v-else-if="printer.connected">🖨 Print Receipt</span>
                <span v-else>🔵 Connect &amp; Print</span>
              </button>
            </div>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ── */
.rcp-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0 env(safe-area-inset-bottom, 0) 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(6px);
}
@media (min-width: 640px) {
  .rcp-modal-overlay { align-items: center; padding: 16px; }
}

/* ── Modal box ── */
.rcp-modal-box {
  background: #f8fafc;
  border-radius: 24px 24px 0 0;
  width: 100%;
  max-width: 420px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 40px rgba(0,0,0,0.25);
}
@media (min-width: 640px) {
  .rcp-modal-box {
    border-radius: 20px;
    max-height: 88vh;
    box-shadow: 0 32px 80px rgba(0,0,0,0.3);
  }
}

/* ── Header ── */
.rcp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  background: #fff;
  border-radius: 24px 24px 0 0;
}
@media (min-width: 640px) {
  .rcp-modal-header { border-radius: 20px 20px 0 0; }
}
.rcp-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.rcp-modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 50%;
  cursor: pointer;
  font-size: 13px;
  transition: background 150ms ease;
}
.rcp-modal-close:hover { background: #e2e8f0; }

/* ── Body (scrollable paper preview) ── */
.rcp-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  min-height: 0;
  background: #e2e8f0;
}

.rcp-modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: #64748b;
  font-size: 14px;
}

.rcp-spinner {
  width: 28px;
  height: 28px;
  animation: rcp-spin 800ms linear infinite;
}
@keyframes rcp-spin { to { transform: rotate(360deg); } }

/* ── Paper simulation ── */
.rcp-paper {
  background: #fff;
  border-radius: 4px;
  padding: 12px 14px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06);
  max-width: 300px;  /* ~80mm at screen DPI */
  margin: 0 auto;
  /* Top/bottom torn-edge effect */
  position: relative;
}
.rcp-paper::before,
.rcp-paper::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 6px;
  background-image: radial-gradient(circle at 50% 0%, #e2e8f0 6px, transparent 6px);
  background-size: 12px 6px;
}
.rcp-paper::before { top: -6px; }
.rcp-paper::after  { bottom: -6px; background-image: radial-gradient(circle at 50% 100%, #e2e8f0 6px, transparent 6px); }

/* ── Footer actions ── */
.rcp-modal-footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
  flex-shrink: 0;
}

.rcp-btn-ghost {
  flex: 1;
  padding: 12px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  border: 1.5px solid #e2e8f0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 150ms ease;
}
.rcp-btn-ghost:hover { background: #f8fafc; }
.rcp-btn-ghost:active { transform: scale(0.97); }

.rcp-btn-print {
  flex: 2;
  padding: 12px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  border: none;
  background: linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99,102,241,0.35);
  transition: all 150ms ease;
}
.rcp-btn-print:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #6366f1 100%);
  box-shadow: 0 6px 18px rgba(99,102,241,0.45);
  transform: translateY(-1px);
}
.rcp-btn-print:active:not(:disabled) { transform: scale(0.97); }
.rcp-btn-print:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Transitions ── */
.rcp-modal-backdrop-enter-active { animation: rcp-fade-in 180ms ease both; }
.rcp-modal-backdrop-leave-active { animation: rcp-fade-in 130ms ease reverse both; }
.rcp-modal-enter-active { animation: rcp-slide-up 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.rcp-modal-leave-active { animation: rcp-slide-up 150ms ease reverse both; }
@media (min-width: 640px) {
  .rcp-modal-enter-active { animation: rcp-scale-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .rcp-modal-leave-active { animation: rcp-scale-in 150ms ease reverse both; }
}

@keyframes rcp-fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes rcp-slide-up { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
@keyframes rcp-scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
</style>
