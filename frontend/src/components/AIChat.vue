<template>
  <button
    type="button"
    class="fixed bottom-5 right-5 z-40 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-indigo-700"
    @click="toggleChat"
  >
    Talk to my AI
  </button>

  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/20"
    @click.self="closeChat"
  >
    <aside class="absolute right-0 top-0 h-full w-full max-w-md border-l border-gray-200 bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h3 class="text-sm font-semibold text-gray-900">Workspace AI</h3>
          <p class="text-xs text-gray-500">Ctrl+K / Cmd+K</p>
        </div>
        <button type="button" class="text-gray-500 hover:text-gray-700" @click="closeChat">
          <i class="pi pi-times"></i>
        </button>
      </div>

      <div class="h-[calc(100%-8.5rem)] space-y-3 overflow-y-auto px-4 py-4">
        <p v-if="messages.length === 0" class="rounded-xl border border-dashed border-gray-200 p-3 text-sm text-gray-500">
          Ask about your schedule, tasks, or tracked time.
        </p>

        <div
          v-for="message in messages"
          :key="message.id"
          class="max-w-[90%] rounded-2xl px-3 py-2 text-sm"
          :class="
            message.role === 'user'
              ? 'ml-auto bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-800'
          "
        >
          {{ message.content }}
        </div>

        <div v-if="isTyping" class="inline-flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
          <i class="pi pi-spin pi-spinner text-xs"></i>
          AI is typing...
        </div>
      </div>

      <form class="border-t border-gray-200 p-4" @submit.prevent="sendMessage">
        <div class="flex items-center gap-2">
          <input
            ref="inputRef"
            v-model="prompt"
            type="text"
            placeholder="Ask anything about your workspace..."
            class="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            :disabled="!prompt.trim() || isTyping"
            class="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const authStore = useAuthStore()
const isOpen = ref(false)
const isTyping = ref(false)
const prompt = ref('')
const messages = ref<ChatMessage[]>([])
const inputRef = ref<HTMLInputElement | null>(null)

function openChat() {
  isOpen.value = true
  void nextTick(() => {
    inputRef.value?.focus()
  })
}

function closeChat() {
  isOpen.value = false
}

function toggleChat() {
  if (isOpen.value) {
    closeChat()
    return
  }

  openChat()
}

function handleKeyboardShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    toggleChat()
  }
}

async function sendMessage() {
  const messageText = prompt.value.trim()
  if (!messageText || isTyping.value || !authStore.token) {
    return
  }

  messages.value.push({
    id: `${Date.now()}-user`,
    role: 'user',
    content: messageText,
  })
  prompt.value = ''
  isTyping.value = true

  try {
    const { data } = await axios.post(
      `${import.meta.env.VITE_API_URL}/chat/message`,
      { prompt: messageText },
      {
        headers: {
          Authorization: 'Bearer ' + authStore.token,
        },
      },
    )

    messages.value.push({
      id: `${Date.now()}-assistant`,
      role: 'assistant',
      content: data?.message || 'No response from AI.',
    })
  } catch {
    messages.value.push({
      id: `${Date.now()}-assistant-error`,
      role: 'assistant',
      content: 'Unable to fetch AI response right now.',
    })
  } finally {
    isTyping.value = false
    void nextTick(() => {
      inputRef.value?.focus()
    })
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboardShortcut)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcut)
})
</script>
