import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getBranches } from '@/api/branches.js'

export const useBranchStore = defineStore('branch', () => {
  const branches = ref([])
  const currentBranchId = ref(localStorage.getItem('branch_id') ? Number(localStorage.getItem('branch_id')) : null)

  const currentBranch = computed(() => branches.value.find((b) => b.id === currentBranchId.value) || null)

  function setBranches(list) {
    branches.value = list
  }

  async function loadBranches() {
    const res = await getBranches()
    branches.value = res.data.data || res.data
  }

  function selectBranch(id) {
    currentBranchId.value = id
    if (id) {
      localStorage.setItem('branch_id', id)
    } else {
      localStorage.removeItem('branch_id')
    }
  }

  return { branches, currentBranchId, currentBranch, setBranches, loadBranches, selectBranch }
})
