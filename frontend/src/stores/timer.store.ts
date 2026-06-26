import axios from 'axios'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

interface TrackedTask {
  id: string
  title: string
}

export interface ActiveTimeEntry {
  id: string
  startTime: string
  endTime: string | null
  duration: number | null
  taskId: string
  userId: string
  task: TrackedTask
}

export const useTimerStore = defineStore('timer', () => {
  const activeEntry = ref<ActiveTimeEntry | null>(null)
  const elapsedSeconds = ref(0)
  const loading = ref(false)
  let intervalId: ReturnType<typeof setInterval> | null = null

  const isRunning = computed(() => activeEntry.value !== null)

  function getAuthHeaders() {
    const authStore = useAuthStore()
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  function clearIntervalTimer() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function syncElapsedSeconds() {
    if (!activeEntry.value) {
      elapsedSeconds.value = 0
      return
    }

    elapsedSeconds.value = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(activeEntry.value.startTime).getTime()) / 1000,
      ),
    )
  }

  function startIntervalTimer() {
    clearIntervalTimer()
    syncElapsedSeconds()

    if (!activeEntry.value) {
      return
    }

    intervalId = setInterval(() => {
      syncElapsedSeconds()
    }, 1000)
  }

  function setActiveEntry(entry: ActiveTimeEntry | null) {
    activeEntry.value = entry

    if (!entry) {
      clearIntervalTimer()
      elapsedSeconds.value = 0
      return
    }

    startIntervalTimer()
  }

  async function fetchCurrentTimer() {
    loading.value = true

    try {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/time/current`, {
        headers: getAuthHeaders(),
      })

      setActiveEntry(data ?? null)
      return data ?? null
    } finally {
      loading.value = false
    }
  }

  async function startTimer(taskId: string) {
    if (activeEntry.value?.taskId === taskId) {
      return activeEntry.value
    }

    loading.value = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/time/start/${taskId}`,
        {},
        {
          headers: getAuthHeaders(),
        },
      )

      setActiveEntry(data)
      return data
    } finally {
      loading.value = false
    }
  }

  async function stopTimer(entryId = activeEntry.value?.id) {
    if (!entryId) {
      return null
    }

    loading.value = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/time/stop/${entryId}`,
        {},
        {
          headers: getAuthHeaders(),
        },
      )

      if (activeEntry.value?.id === entryId) {
        setActiveEntry(null)
      }

      return data
    } finally {
      loading.value = false
    }
  }

  function reset() {
    setActiveEntry(null)
  }

  function canStartTask(taskId: string) {
    return !activeEntry.value || activeEntry.value.taskId === taskId
  }

  function isTaskActive(taskId: string) {
    return activeEntry.value?.taskId === taskId
  }

  return {
    activeEntry,
    elapsedSeconds,
    loading,
    isRunning,
    fetchCurrentTimer,
    startTimer,
    stopTimer,
    reset,
    canStartTask,
    isTaskActive,
  }
})
