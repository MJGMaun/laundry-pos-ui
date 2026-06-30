<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { useChatStore } from '@/stores/chat.js'
import { getConversations, getThread, sendMessage, startDirect, searchChatUsers } from '@/api/messages.js'

const toast = useToast()
const auth = useAuthStore()
const chat = useChatStore()

const conversations = ref([])
const loadingConvos = ref(false)
const activeId = ref(null)
const messages = ref([])
const draft = ref('')
const sending = ref(false)

const search = ref('')
const searchResults = ref([])
const searching = ref(false)

const threadEl = ref(null)
let threadTimer = null
let searchTimer = null

const me = computed(() => auth.user?.id)
const active = computed(() => conversations.value.find((c) => c.id === activeId.value) || null)

function avatarColor(name) {
  return `hsl(${((name?.charCodeAt(0) || 0) * 7) % 360}, 60%, 50%)`
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
}

async function loadConversations() {
  loadingConvos.value = true
  try {
    const res = await getConversations()
    conversations.value = res.data.data || []
  } catch {
    // offline or no branch selected — leave list empty
  } finally {
    loadingConvos.value = false
  }
}

async function loadThread() {
  if (!activeId.value) return
  try {
    const res = await getThread(activeId.value)
    const arr = (res.data.data || []).slice().reverse() // oldest → newest
    const grew = arr.length !== messages.value.length
    messages.value = arr
    if (grew) scrollToBottom()
  } catch {
    // ignore transient poll failures
  }
}

function startThreadPoll() {
  stopThreadPoll()
  threadTimer = setInterval(async () => {
    await loadThread()
    chat.refreshUnread()
  }, 8000)
}
function stopThreadPoll() {
  if (threadTimer) {
    clearInterval(threadTimer)
    threadTimer = null
  }
}

async function openConversation(c) {
  activeId.value = c.id
  messages.value = []
  await loadThread()
  scrollToBottom()
  startThreadPoll()
  // The GET marked it read server-side — clear the local badge and refresh global.
  const item = conversations.value.find((x) => x.id === c.id)
  if (item) item.unread_count = 0
  chat.refreshUnread()
}

function backToList() {
  stopThreadPoll()
  activeId.value = null
  messages.value = []
}

async function send() {
  const body = draft.value.trim()
  if (!body || !activeId.value || sending.value) return
  sending.value = true
  try {
    const res = await sendMessage(activeId.value, body)
    messages.value.push(res.data.data)
    draft.value = ''
    scrollToBottom()
    const item = conversations.value.find((x) => x.id === activeId.value)
    if (item) item.last_message = { body: res.data.data.body, sender_id: me.value, created_at: res.data.data.created_at }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Not sent', detail: e.response?.data?.message || 'Message failed to send', life: 4000 })
  } finally {
    sending.value = false
  }
}

function onSearchInput() {
  clearTimeout(searchTimer)
  const q = search.value.trim()
  if (!q) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const res = await searchChatUsers(q)
      searchResults.value = res.data.data || []
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 300)
}

async function startChat(user) {
  search.value = ''
  searchResults.value = []
  try {
    const res = await startDirect(user.username)
    const convo = res.data.data
    if (!conversations.value.find((c) => c.id === convo.id)) conversations.value.unshift(convo)
    openConversation(convo)
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.response?.data?.message || 'Could not start chat', life: 4000 })
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight
  })
}

onMounted(loadConversations)
onUnmounted(stopThreadPoll)
</script>

<template>
  <div class="flex h-full bg-slate-50">
    <!-- ── Conversation list ── -->
    <aside
      class="w-full flex-col border-r border-slate-200 bg-white sm:flex sm:w-80 shrink-0"
      :class="active ? 'hidden sm:flex' : 'flex'"
    >
      <div class="border-b border-slate-100 p-4">
        <h1 class="mb-3 text-lg font-bold text-slate-900">Messages</h1>
        <!-- New message: username autocomplete -->
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input
            v-model="search"
            type="search"
            placeholder="Message someone by username…"
            class="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
            @input="onSearchInput"
          />
          <!-- Autocomplete dropdown -->
          <div v-if="search.trim()" class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div v-if="searching" class="px-3 py-2.5 text-sm text-slate-400">Searching…</div>
            <div v-else-if="!searchResults.length" class="px-3 py-2.5 text-sm text-slate-400">No users found</div>
            <button
              v-for="u in searchResults"
              :key="u.id"
              class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              @click="startChat(u)"
            >
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" :style="`background:${avatarColor(u.name)}`">{{ u.name?.charAt(0).toUpperCase() }}</div>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-slate-800">{{ u.name }}</div>
                <div class="truncate text-xs text-slate-400">@{{ u.username }} · {{ u.role }}</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="loadingConvos" class="p-4 text-sm text-slate-400">Loading…</div>
        <div v-else-if="!conversations.length" class="p-4 text-sm text-slate-400">No conversations yet.</div>
        <button
          v-for="c in conversations"
          :key="c.id"
          class="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors"
          :class="c.id === activeId ? 'bg-blue-50' : 'hover:bg-slate-50'"
          @click="openConversation(c)"
        >
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            :style="c.type === 'branch' ? 'background:#0ea5e9' : `background:${avatarColor(c.title)}`"
          >{{ c.type === 'branch' ? '#' : c.title?.charAt(0).toUpperCase() }}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold text-slate-900">{{ c.type === 'branch' ? 'Branch chat' : c.title }}</span>
              <span v-if="c.last_message" class="shrink-0 text-[11px] text-slate-400">{{ fmtTime(c.last_message.created_at) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-xs text-slate-500">{{ c.last_message?.body || 'No messages yet' }}</span>
              <span v-if="c.unread_count > 0" class="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{{ c.unread_count > 99 ? '99+' : c.unread_count }}</span>
            </div>
          </div>
        </button>
      </div>
    </aside>

    <!-- ── Thread ── -->
    <section class="flex-1 flex-col bg-slate-50" :class="active ? 'flex' : 'hidden sm:flex'">
      <template v-if="active">
        <!-- Thread header -->
        <header class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button class="text-slate-500 hover:text-slate-700 sm:hidden" @click="backToList">←</button>
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            :style="active.type === 'branch' ? 'background:#0ea5e9' : `background:${avatarColor(active.title)}`"
          >{{ active.type === 'branch' ? '#' : active.title?.charAt(0).toUpperCase() }}</div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-slate-900">{{ active.type === 'branch' ? 'Branch chat' : active.title }}</div>
            <div v-if="active.type === 'direct'" class="truncate text-xs text-slate-400">@{{ active.other?.username }}</div>
            <div v-else class="text-xs text-slate-400">Everyone in this branch</div>
          </div>
        </header>

        <!-- Messages -->
        <div ref="threadEl" class="flex-1 space-y-2 overflow-y-auto p-4">
          <div v-if="!messages.length" class="pt-10 text-center text-sm text-slate-400">No messages yet — say hi 👋</div>
          <div v-for="m in messages" :key="m.id" class="flex" :class="m.sender_id === me ? 'justify-end' : 'justify-start'">
            <div class="max-w-[75%]">
              <div v-if="active.type === 'branch' && m.sender_id !== me" class="mb-0.5 pl-1 text-[11px] font-medium text-slate-400">{{ m.sender?.name }}</div>
              <div
                class="rounded-2xl px-3 py-2 text-sm"
                :class="m.sender_id === me ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800'"
              >{{ m.body }}</div>
              <div class="mt-0.5 text-[10px] text-slate-400" :class="m.sender_id === me ? 'text-right' : 'text-left pl-1'">{{ fmtTime(m.created_at) }}</div>
            </div>
          </div>
        </div>

        <!-- Composer -->
        <div class="border-t border-slate-200 bg-white p-3">
          <form class="flex items-end gap-2" @submit.prevent="send">
            <textarea
              v-model="draft"
              rows="1"
              placeholder="Type a message…"
              class="max-h-32 flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              @keydown.enter.exact.prevent="send"
            />
            <button
              type="submit"
              class="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40"
              :disabled="sending || !draft.trim()"
            >Send</button>
          </form>
        </div>
      </template>

      <!-- Empty state (desktop) -->
      <div v-else class="hidden flex-1 items-center justify-center text-sm text-slate-400 sm:flex">
        Select a conversation, or message someone by username.
      </div>
    </section>
  </div>
</template>
