import { ref, watch } from 'vue'

export function useCountUp(targetRef, duration = 900, decimals = 0) {
  const display = ref(0)
  let raf = null

  watch(targetRef, (target) => {
    if (raf) cancelAnimationFrame(raf)
    const start = display.value
    const end = Number(target) || 0
    const startTime = performance.now()

    function step(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      display.value = Number((start + (end - start) * eased).toFixed(decimals))
      if (progress < 1) raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
  }, { immediate: true })

  return display
}
