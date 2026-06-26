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
  suggestedActions: string[]
  senderName: string
  senderEmail: string
  subject: string
  link: string
}

export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref('')
  const emails = ref<CategorizedEmailSummary[]>([])
  const events = ref<CalendarEvent[]>([])
  const isLoading = ref(false)
  const draftingActionKey = ref<string | null>(null)
  const error = ref<string | null>(null)
  const generated = ref(false)

  function getAuthHeaders() {
    const authStore = useAuthStore()
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  async function fetchDashboardData() {
    if (generated.value) {
      return
    }

    await _loadData()
  }

  async function generateSummary() {
    await _loadData()
  }

  async function _loadData() {
    const tasksStore = useTasksStore()
    isLoading.value = true
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
      emails.value = (data.email_summaries || []).map((email: Partial<CategorizedEmailSummary>) => ({
        emailId: email.emailId || '',
        summary: email.summary || '',
        category: (email.category as EmailCategory) || 'INFO',
        suggestedActions: Array.isArray(email.suggestedActions) ? email.suggestedActions : [],
        senderName: email.senderName || '',
        senderEmail: email.senderEmail || '',
        subject: email.subject || '',
        link: email.link || '',
      }))
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

  function getDraftActionKey(emailId: string, action: string) {
    return `${emailId}:${action}`
  }

  function isDrafting(emailId: string, action: string) {
    return draftingActionKey.value === getDraftActionKey(emailId, action)
  }

  async function createDraft(emailId: string, action: string) {
    draftingActionKey.value = getDraftActionKey(emailId, action)

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/emails/draft/${emailId}`,
        { action },
        {
          headers: getAuthHeaders(),
        },
      )

      return data as { draftId: string | null; provider: 'GOOGLE' | 'MICROSOFT' }
    } finally {
      draftingActionKey.value = null
    }
  }

  function reset() {
    summary.value = ''
    emails.value = []
    events.value = []
    generated.value = false
    draftingActionKey.value = null
    error.value = null
  }

  return {
    summary,
    emails,
    events,
    isLoading,
    draftingActionKey,
    error,
    generated,
    fetchDashboardData,
    generateSummary,
    createDraft,
    isDrafting,
    reset,
  }
})
