<template>
  <div class="min-h-screen bg-gray-50 flex">
    <aside class="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div class="p-6 border-b border-gray-200">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <i class="pi pi-calendar text-white"></i>
          </div>
          <span class="text-xl font-bold text-gray-900">MyDay</span>
        </div>
      </div>

      <nav class="p-4 flex-1">
        <RouterLink to="/dashboard" :class="navLinkClass">
          <i class="pi pi-home"></i>
          <span>Dashboard</span>
        </RouterLink>
        <RouterLink to="/tasks" :class="navLinkClass">
          <i class="pi pi-check-square"></i>
          <span>Tasks</span>
        </RouterLink>
        <RouterLink to="/calendar" :class="navLinkClass">
          <i class="pi pi-calendar"></i>
          <span>Calendar</span>
        </RouterLink>
        <RouterLink to="/integrations" :class="navLinkClass">
          <i class="pi pi-plug"></i>
          <span>Integrations</span>
        </RouterLink>
      </nav>

      <div v-if="timerStore.activeEntry" class="mx-4 mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-indigo-600">Running timer</p>
        <p class="mt-2 text-sm font-medium text-gray-900">{{ timerStore.activeEntry.task.title }}</p>
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="font-mono text-lg font-semibold text-gray-900">{{ formattedElapsedTime }}</span>
          <button
            @click="handleStopTimer"
            :disabled="timerStore.loading"
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Stop
          </button>
        </div>
        <p v-if="timerErrorMessage" class="mt-2 text-xs text-red-600">{{ timerErrorMessage }}</p>
      </div>

      <div class="p-4 border-t border-gray-200">
        <div class="flex items-center gap-3">
          <img
            v-if="authStore.user?.picture"
            :src="authStore.user.picture"
            :alt="authStore.user.name ?? ''"
            class="w-8 h-8 rounded-full"
          />
          <div v-else class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <i class="pi pi-user text-indigo-600 text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ authStore.user?.name || authStore.user?.email }}</p>
            <p class="text-xs text-gray-500 truncate">{{ authStore.user?.email }}</p>
          </div>
          <button @click="handleLogout" class="text-gray-400 hover:text-gray-600">
            <i class="pi pi-sign-out text-sm"></i>
          </button>
        </div>
      </div>
    </aside>

    <main class="flex-1 min-w-0">
      <RouterView />
    </main>

    <AIChat />
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import AIChat from '../components/AIChat.vue'
import { useAuthStore } from '../stores/auth'
import { useTimerStore } from '../stores/timer.store'

const navLinkClass =
  'flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 mb-1 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 aria-[current=page]:font-medium'

const authStore = useAuthStore()
const router = useRouter()
const timerStore = useTimerStore()
const timerErrorMessage = ref<string | null>(null)

const formattedElapsedTime = computed(() => {
  const hours = String(Math.floor(timerStore.elapsedSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((timerStore.elapsedSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(timerStore.elapsedSeconds % 60).padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
})

async function handleStopTimer() {
  timerErrorMessage.value = null

  try {
    await timerStore.stopTimer()
  } catch (caughtError: unknown) {
    if (axios.isAxiosError(caughtError)) {
      timerErrorMessage.value = caughtError.response?.data?.message || 'Unable to stop the running timer.'
      return
    }

    timerErrorMessage.value = 'Unable to stop the running timer.'
  }
}

function handleLogout() {
  timerStore.reset()
  authStore.logout()
  router.push('/login')
}

onMounted(async () => {
  if (!authStore.token) {
    timerStore.reset()
    return
  }

  await timerStore.fetchCurrentTimer()
})
</script>
