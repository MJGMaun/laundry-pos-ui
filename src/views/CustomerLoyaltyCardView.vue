<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicLoyalty } from '@/api/loyalty.js'

const route = useRoute()
const data = ref(null)
const loading = ref(true)
const error = ref(null)

onMounted(async () => {
  try {
    const res = await getPublicLoyalty(route.params.username)
    data.value = res.data
  } catch (e) {
    error.value = e.response?.status === 404 ? 'Loyalty card not found.' : 'Unable to load loyalty card.'
  } finally {
    loading.value = false
  }
})

// ── Stamp helpers ──────────────────────────────────────────────────────────────
function stampsInCycle(rule) {
  return data.value.total_stamps % rule.every_n_stamps
}
function progressPct(rule) {
  return (stampsInCycle(rule) / rule.every_n_stamps) * 100
}
function stampsUntilNext(rule) {
  return rule.every_n_stamps - stampsInCycle(rule)
}
function stampDots(rule) {
  const filled = stampsInCycle(rule)
  const display = Math.min(rule.every_n_stamps, 20)
  return Array.from({ length: display }, (_, i) => i < filled)
}
const pendingCount = computed(() => data.value?.pending_rewards?.length ?? 0)

// ── 3D tilt + glare ────────────────────────────────────────────────────────────
const cardEl   = ref(null)
const tiltX    = ref(0)
const tiltY    = ref(0)
const glareX   = ref(50)
const glareY   = ref(50)
const glareOp  = ref(0)
const isActive = ref(false)
let resetTimer = null

const MAX_TILT = 18

function applyTilt(clientX, clientY) {
  const el = cardEl.value
  if (!el) return
  const { left, top, width, height } = el.getBoundingClientRect()
  const x = (clientX - left) / width   // 0→1
  const y = (clientY - top)  / height  // 0→1
  tiltY.value  =  (x - 0.5) * 2 * MAX_TILT
  tiltX.value  = -(y - 0.5) * 2 * MAX_TILT
  glareX.value = x * 100
  glareY.value = y * 100
  glareOp.value = 0.17
  isActive.value = true
  clearTimeout(resetTimer)
}

function resetTilt() {
  resetTimer = setTimeout(() => {
    tiltX.value   = 0
    tiltY.value   = 0
    glareOp.value = 0
    isActive.value = false
  }, 120)
}

function onMouseMove(e)  { applyTilt(e.clientX, e.clientY) }
function onMouseLeave()  { resetTilt() }

function onTouchMove(e) {
  e.preventDefault()
  const t = e.touches[0]
  applyTilt(t.clientX, t.clientY)
}
function onTouchEnd() { resetTilt() }

const cardStyle = computed(() => ({
  transform:  `perspective(900px) rotateX(${tiltX.value}deg) rotateY(${tiltY.value}deg) scale3d(${isActive.value ? 1.03 : 1}, ${isActive.value ? 1.03 : 1}, 1)`,
  transition: isActive.value ? 'transform 80ms linear' : 'transform 550ms cubic-bezier(0.23, 1, 0.32, 1)',
  willChange: 'transform',
}))

const glareStyle = computed(() => ({
  background: `radial-gradient(circle at ${glareX.value}% ${glareY.value}%, rgba(255,255,255,${glareOp.value * 0.5	}) 0%, rgba(180,160,255,${glareOp.value}) 40%, transparent 70%)`,
  opacity: glareOp.value > 0 ? 1 : 0,
  transition: isActive.value ? 'opacity 80ms linear' : 'opacity 500ms ease',
  pointerEvents: 'none',
}))
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-start px-4 py-8" style="background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);">

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center justify-center mt-24 gap-4">
      <div class="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
      <p class="text-slate-400 text-sm">Loading loyalty card…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mt-24 text-center">
      <div class="text-5xl mb-4">🎴</div>
      <p class="text-slate-300 font-semibold text-lg">{{ error }}</p>
      <p class="text-slate-500 text-sm mt-1">Check the link and try again.</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="text-center mb-8 animate-fade-up">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 text-3xl" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 8px 32px rgba(99,102,241,0.4);">
          <i class="pi pi-sync" style="font-size: 1rem"></i>
        </div>
        <h1 class="text-xl font-bold text-white">{{ data.branch?.name }}</h1>
        <p class="text-slate-400 text-sm mt-0.5">{{ data.branch?.address }}</p>
        <p class="text-slate-400 text-sm mt-0.5">{{ data.branch?.phone }}</p>
        <p class="text-slate-400 text-sm mt-0.5">{{ data.branch?.email }}</p>
      </div>

      <!-- Card -->
      <div class="w-full max-w-sm animate-fade-up" style="animation-delay: 80ms; perspective: 900px; animation: fade-up 400ms cubic-bezier(0.22,1,0.36,1) both, float 4s ease-in-out 600ms infinite;">
        <div
          ref="cardEl"
          class="rounded-3xl overflow-hidden relative select-none cursor-grab active:cursor-grabbing"
          :style="[cardStyle, 'background: linear-gradient(135deg, #1e1b4b, #312e81); box-shadow: 0 24px 64px rgba(0,0,0,0.5); border: 1px solid rgba(165,180,252,0.15);']"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
          @touchmove.prevent="onTouchMove"
          @touchend="onTouchEnd"
        >
          <!-- Glare overlay -->
          <div class="absolute inset-0 rounded-3xl z-10" :style="glareStyle" />

          <!-- Card top -->
          <div class="px-6 pt-6 pb-4" style="border-bottom: 1px solid rgba(165,180,252,0.1);">
            <p class="text-indigo-300/60 text-xs font-medium uppercase tracking-widest mb-1">Loyalty Card</p>
            <h2 class="text-white text-2xl font-bold leading-tight">{{ data.customer.name }}</h2>
            <p v-if="data.customer.loyalty_card_number" class="text-indigo-300/50 text-xs font-mono mt-1">
              {{ data.customer.loyalty_card_number }}
            </p>
          </div>

          <!-- Pending rewards badge -->
          <div v-if="pendingCount > 0" class="mx-6 mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl animate-pulse-soft" style="background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1)); border: 1px solid rgba(251,191,36,0.3);">
            <span class="text-2xl">🎁</span>
            <div>
              <p class="text-amber-300 font-semibold text-sm leading-tight">
                {{ pendingCount === 1 ? '1 reward ready to redeem!' : `${pendingCount} rewards ready!` }}
              </p>
              <p class="text-amber-400/60 text-xs mt-0.5">Show this to the cashier</p>
            </div>
          </div>

          <!-- Rules / stamp tracks -->
          <div class="px-6 py-5 space-y-6">
            <div v-for="rule in data.rules" :key="rule.id" class="space-y-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-white text-sm font-semibold leading-tight">{{ rule.reward_description }}</p>
                  <p class="text-indigo-300/50 text-xs mt-0.5">Every {{ rule.every_n_stamps }} stamps</p>
                </div>
                <div class="text-right shrink-0">
                  <span class="text-indigo-200 text-xs font-semibold">{{ stampsInCycle(rule) }}/{{ rule.every_n_stamps }}</span>
                </div>
              </div>

              <!-- Stamp dots -->
              <div class="flex flex-wrap gap-1.5">
                <div
                  v-for="(filled, i) in stampDots(rule)"
                  :key="i"
                  class="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-300"
                  :style="filled
                    ? 'background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 2px 8px rgba(99,102,241,0.5);'
                    : 'background: rgba(255,255,255,0.06); border: 1px solid rgba(165,180,252,0.15);'"
                >
                  <span v-if="filled">✦</span>
                  <span v-else class="text-indigo-400/30 text-xs">·</span>
                </div>
                <div v-if="rule.every_n_stamps > 20" class="flex items-center px-2">
                  <span class="text-indigo-300/40 text-xs">+{{ rule.every_n_stamps - 20 }} more</span>
                </div>
              </div>

              <!-- Progress bar -->
              <div class="h-1.5 rounded-full overflow-hidden" style="background: rgba(255,255,255,0.06);">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  style="background: linear-gradient(90deg, #6366f1, #a78bfa);"
                  :style="`width: ${progressPct(rule)}%`"
                />
              </div>

              <p class="text-indigo-300/50 text-xs text-center">
                <template v-if="stampsUntilNext(rule) === 0">🎉 Reward ready!</template>
                <template v-else>{{ stampsUntilNext(rule) }} more stamp{{ stampsUntilNext(rule) !== 1 ? 's' : '' }} until your next reward</template>
              </p>
            </div>

            <div v-if="!data.rules.length" class="text-center py-4">
              <p class="text-indigo-300/40 text-sm">No active loyalty programs yet.</p>
            </div>
          </div>

          <!-- Card footer -->
          <div class="px-6 pb-6 pt-2 flex items-center justify-between" style="border-top: 1px solid rgba(165,180,252,0.08);">
            <p class="text-indigo-300/30 text-xs">Earn 1 stamp per load</p>
            <div class="flex gap-0.5">
              <div v-for="n in 3" :key="n" class="w-1 h-1 rounded-full" style="background: rgba(165,180,252,0.2);" />
            </div>
          </div>
        </div>
      </div>

      <!-- Pending rewards list -->
      <div v-if="pendingCount > 0" class="w-full max-w-sm mt-5 space-y-2 animate-fade-up" style="animation-delay: 160ms;">
        <p class="text-slate-400 text-xs font-semibold uppercase tracking-wider px-1 mb-3">Available Rewards</p>
        <div
          v-for="reward in data.pending_rewards"
          :key="reward.id"
          class="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
          style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);"
        >
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style="background: rgba(251,191,36,0.15);">
            🎁
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">{{ reward.rule?.reward_description }}</p>
            <p class="text-slate-500 text-xs mt-0.5">Show this screen to cashier</p>
          </div>
          <div class="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
        </div>
      </div>

      <p class="text-slate-600 text-xs mt-8 text-center">Powered by Laundry POS</p>
    </template>
  </div>
</template>

<style scoped>
@keyframes fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-up { animation: fade-up 400ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.animate-spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.85; }
}
.animate-pulse-soft { animation: pulse-soft 2.5s ease-in-out infinite; }

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-8px); }
}
</style>
