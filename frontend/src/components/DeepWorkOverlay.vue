<template>
  <div class="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
    <div class="w-full max-w-4xl text-center">
      <p class="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-300">Concentration</p>
      <p class="mt-6 font-mono text-7xl font-semibold tracking-tight sm:text-8xl">{{ formattedTimer }}</p>
      <p class="mt-3 text-sm text-slate-400">
        {{ timerLabel }}
      </p>

      <div class="mt-12 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <p class="text-sm uppercase tracking-[0.25em] text-slate-400">Tâche en cours</p>
        <h2 class="mt-4 text-3xl font-semibold text-white sm:text-4xl">
          {{ uiStore.deepWorkTask?.title || 'Session de concentration' }}
        </h2>
        <p class="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
          {{ uiStore.deepWorkTask?.description || 'Concentrez-vous sur une seule priorité importante. Le reste peut attendre.' }}
        </p>
      </div>

      <button
        @click="handleStopDeepWork"
        :disabled="uiStore.loading"
        class="mt-12 inline-flex items-center rounded-full border border-red-400/40 bg-red-500/10 px-8 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Terminer la session
      </button>

      <p v-if="errorMessage" class="mt-4 text-sm text-red-300">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui.store'

const uiStore = useUiStore()
const currentTime = ref(Date.now())
const errorMessage = ref<string | null>(null)
let intervalId: ReturnType<typeof setInterval> | null = null

const remainingSeconds = computed(() => {
  if (!uiStore.deepWorkEndsAt) {
    return 0
  }

  return Math.max(0, Math.floor((new Date(uiStore.deepWorkEndsAt).getTime() - currentTime.value) / 1000))
})

const formattedTimer = computed(() => {
  const hours = String(Math.floor(remainingSeconds.value / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((remainingSeconds.value % 3600) / 60)).padStart(2, '0')
  const seconds = String(remainingSeconds.value % 60).padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
})

const timerLabel = computed(() =>
  remainingSeconds.value > 0 ? 'Temps restant dans cette session de concentration' : 'Session terminée — vous pouvez la clôturer quand vous le souhaitez',
)

async function handleStopDeepWork() {
  errorMessage.value = null

  try {
    await uiStore.stopDeepWork()
  } catch (caughtError: unknown) {
    if (axios.isAxiosError(caughtError)) {
      errorMessage.value = caughtError.response?.data?.message || 'Impossible de terminer le mode concentration.'
      return
    }

    errorMessage.value = 'Impossible de terminer le mode concentration.'
  }
}

onMounted(() => {
  currentTime.value = Date.now()
  intervalId = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})
</script>
