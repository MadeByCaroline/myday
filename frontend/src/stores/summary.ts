import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from './auth'
import { useTasksStore } from './tasks'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
}

export const useSummaryStore = defineStore('summary', () => {
  const summary = ref('')
  const events = ref<CalendarEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const generated = ref(false)

  function getAuthHeaders() {
    const authStore = useAuthStore()
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  async function generateSummary() {
    const tasksStore = useTasksStore()
    loading.value = true
    error.value = null

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/summary/generate`,
        {},
        {
          headers: getAuthHeaders(),
        },
      )

      summary.value = data.summary || ''
      events.value = data.events || []
      tasksStore.setSuggestedTasks(data.suggested_tasks || [])
      generated.value = true
    } catch (caughtError: unknown) {
      if (axios.isAxiosError(caughtError)) {
        error.value = caughtError.response?.data?.message || 'Failed to generate summary'
      } else {
        error.value = 'Failed to generate summary'
      }
    } finally {
      loading.value = false
    }
  }

  function reset() {
    summary.value = ''
    events.value = []
    generated.value = false
    error.value = null
  }

  return { summary, events, loading, error, generated, generateSummary, reset }
})
