import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'

interface DeepWorkTask {
  id: string
  title: string
  description?: string | null
}

export const useUiStore = defineStore('ui', () => {
  const isDeepWorkModeActive = ref(false)
  const deepWorkTask = ref<DeepWorkTask | null>(null)
  const deepWorkStartedAt = ref<string | null>(null)
  const deepWorkEndsAt = ref<string | null>(null)
  const deepWorkDurationMinutes = ref<number | null>(null)
  const loading = ref(false)

  const hasDeepWorkTask = computed(() => deepWorkTask.value !== null)

  function getAuthHeaders() {
    const authStore = useAuthStore()
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  async function startDeepWork(task: DeepWorkTask, durationMinutes = 60) {
    loading.value = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/focus/start`,
        {
          durationMinutes,
        },
        {
          headers: getAuthHeaders(),
        },
      )

      isDeepWorkModeActive.value = true
      deepWorkTask.value = task
      deepWorkStartedAt.value = data.startedAt
      deepWorkEndsAt.value = data.endsAt
      deepWorkDurationMinutes.value = data.durationMinutes
      return data
    } finally {
      loading.value = false
    }
  }

  async function stopDeepWork() {
    loading.value = true

    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/focus/stop`,
        {},
        {
          headers: getAuthHeaders(),
        },
      )
      resetDeepWork()
    } finally {
      loading.value = false
    }
  }

  function resetDeepWork() {
    isDeepWorkModeActive.value = false
    deepWorkTask.value = null
    deepWorkStartedAt.value = null
    deepWorkEndsAt.value = null
    deepWorkDurationMinutes.value = null
  }

  return {
    isDeepWorkModeActive,
    deepWorkTask,
    deepWorkStartedAt,
    deepWorkEndsAt,
    deepWorkDurationMinutes,
    hasDeepWorkTask,
    loading,
    startDeepWork,
    stopDeepWork,
    resetDeepWork,
  }
})
