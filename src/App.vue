<script setup>
import { watch } from 'vue'
import { useOnline } from '@vueuse/core'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useToast } from 'primevue/usetoast'
import { useQueueStore } from '@/stores/queue.js'

const isOnline = useOnline()
const toast = useToast()
const queue = useQueueStore()

queue.refresh()

watch(isOnline, async (online) => {
  if (!online || queue.pendingCount === 0) return
  const synced = await queue.sync()
  await queue.refresh()
  if (synced > 0) {
    toast.add({
      severity: 'success',
      summary: 'Synced',
      detail: `${synced} queued item${synced !== 1 ? 's' : ''} synced successfully`,
      life: 5000,
    })
  }
})
</script>

<template>
  <RouterView />
  <Toast position="bottom-right" />
  <ConfirmDialog />
</template>
