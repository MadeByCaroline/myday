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

export type EmailCategory = 'URGENT' | 'NEWSLETTER' | 'INVOICE' | 'ACTION_REQUIRED' | 'INFO'

export interface CategorizedEmailSummary {
  emailId: string
  summary: string
  category: EmailCategory
}

export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref('')
  const emails = ref<CategorizedEmailSummary[]>([])
  const events = ref<CalendarEvent[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const generated = ref(false)

  function getAuthHeaders() {
    const authStore = useAuthStore()
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  async function fetchDashboardData() {
    if (generated.value) return

    const tasksStore = useTasksStore()
    isLoading.value = true
    error.value = null

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/summary/generate`,
        {},
        { headers: getAuthHeaders() },
      )

      summary.value = data.summary || ''
      events.value = data.events || []
      emails.value = data.email_summaries || []
      tasksStore.setSuggestedTasks(data.suggested_tasks || [])
      generated.value = true
    } catch (caughtError: unknown) {
      if (axios.isAxiosError(caughtError)) {
        error.value = caughtError.response?.data?.message || 'Failed to fetch dashboard data'
      } else {
        error.value = 'Failed to fetch dashboard data'
      }
    } finally {
      isLoading.value = false
    }
  }

  async function generateSummary() {
    const tasksStore = useTasksStore()
    isLoading.value = true
    error.value = null

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/summary/generate`,
        {},
        { headers: getAuthHeaders() },
      )

      summary.value = data.summary || ''
      events.value = data.events || []
      emails.value = data.email_summaries || []
      tasksStore.setSuggestedTasks(data.suggested_tasks || [])
      generated.value = true
    } catch (caughtError: unknown) {
      if (axios.isAxiosError(caughtError)) {
        error.value = caughtError.response?.data?.message || 'Failed to generate summary'
      } else {
        error.value = 'Failed to generate summary'
      }
    } finally {
      isLoading.value = false
    }
  }

  function reset() {
    summary.value = ''
    emails.value = []
    events.value = []
    generated.value = false
    error.value = null
  }

  return { summary, emails, events, isLoading, error, generated, fetchDashboardData, generateSummary, reset }
})
