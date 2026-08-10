<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { getBranchPageAccess, setBranchPageAccess } from '@/api/pageAccess.js'

const props = defineProps({
  branchId: { type: Number, required: true },
  branchName: { type: String, default: '' },
})

const toast = useToast()

const pages = ref([])
const roles = ref({})
const loading = ref(false)
const saving = ref(null) // `${page}:${role}` while in flight

const ROLE_LABELS = { admin: 'Admin', cashier: 'Cashier', staff: 'Staff' }

// Pages arrive in registry order; group headings come from the same metadata so
// the screen never drifts from what the server actually enforces.
const grouped = computed(() => {
  const out = []
  pages.value.forEach((page) => {
    const last = out[out.length - 1]
    if (!last || last.group !== page.group) out.push({ group: page.group, pages: [page] })
    else last.pages.push(page)
  })
  return out
})

async function load() {
  loading.value = true
  try {
    const res = await getBranchPageAccess(props.branchId)
    pages.value = res.data.pages || []
    roles.value = res.data.roles || {}
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to load access', life: 4000 })
  } finally {
    loading.value = false
  }
}

const cell = (page, role) => roles.value[role]?.[page] || { view: false, edit: false }

async function toggle(page, role, ability) {
  if (!page.configurable) return

  const current = cell(page.key, role)
  const next = { view: current.view, edit: current.edit }

  next[ability] = !next[ability]
  // Edit implies view, and removing view removes edit — the server enforces
  // this too, but doing it here keeps the checkboxes honest as you click.
  if (ability === 'edit' && next.edit) next.view = true
  if (ability === 'view' && !next.view) next.edit = false

  saving.value = `${page.key}:${role}`
  try {
    const res = await setBranchPageAccess(props.branchId, {
      page: page.key,
      role,
      can_view: next.view,
      can_edit: next.edit,
    })
    roles.value = res.data.roles || roles.value
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Failed to save', life: 4000 })
  } finally {
    saving.value = null
  }
}

onMounted(load)
</script>

<template>
  <div>
    <p class="text-xs text-gray-500 mb-3 leading-relaxed">
      Controls both the menu and the API for <strong>{{ branchName }}</strong> — a page turned off here
      cannot be reached by typing its address either. <strong>Edit</strong> covers adding, changing, and
      deleting on that page. Super admins are never affected.
    </p>

    <div v-if="loading" class="py-10 text-center text-sm text-gray-400">Loading…</div>

    <div v-else class="overflow-x-auto -mx-1 px-1">
      <table class="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th class="text-left font-medium text-gray-600 px-3 py-2 sticky left-0 bg-white z-10">Page</th>
            <th v-for="(label, role) in ROLE_LABELS" :key="role" class="px-3 py-2 text-center font-medium text-gray-600" colspan="2">
              {{ label }}
            </th>
          </tr>
          <tr class="text-[11px] text-gray-400">
            <th class="sticky left-0 bg-white z-10" />
            <template v-for="(label, role) in ROLE_LABELS" :key="role">
              <th class="px-2 py-1 font-normal text-center">view</th>
              <th class="px-2 py-1 font-normal text-center">edit</th>
            </template>
          </tr>
        </thead>

        <tbody>
          <template v-for="section in grouped" :key="section.group">
            <tr>
              <td colspan="7" class="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 sticky left-0 bg-white">
                {{ section.group }}
              </td>
            </tr>
            <tr
              v-for="page in section.pages"
              :key="page.key"
              class="border-t border-gray-50"
              :class="page.configurable ? '' : 'opacity-50'"
            >
              <td class="px-3 py-2 whitespace-nowrap sticky left-0 bg-white">
                {{ page.label }}
                <span v-if="!page.configurable" class="ml-1 text-[10px] text-gray-400">super admin only</span>
              </td>
              <template v-for="(label, role) in ROLE_LABELS" :key="role">
                <td class="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-40"
                    :checked="cell(page.key, role).view"
                    :disabled="!page.configurable || saving === `${page.key}:${role}`"
                    @change="toggle(page, role, 'view')"
                  />
                </td>
                <td class="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-40"
                    :checked="cell(page.key, role).edit"
                    :disabled="!page.configurable || saving === `${page.key}:${role}`"
                    @change="toggle(page, role, 'edit')"
                  />
                </td>
              </template>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-gray-400 mt-3">
      Changes save as you tick. Staff already signed in pick them up on their next page load.
    </p>
  </div>
</template>
