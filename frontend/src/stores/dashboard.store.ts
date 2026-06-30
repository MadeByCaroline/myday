import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from './auth'
import type { SuggestedTask } from './tasks'
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

export type DashboardIntegrationState = 'loading' | 'ready' | 'error'

export interface DashboardIntegrationStatus {
  provider: string
  status: DashboardIntegrationState
  code?: 'needs_reauth' | 'provider_unavailable'
  message?: string
}

interface DashboardResponse {
  summary?: string
  events?: CalendarEvent[]
  suggested_tasks?: SuggestedTask[]
  email_summaries?: Partial<CategorizedEmailSummary>[]
  error?: string
  integrations?: DashboardIntegrationStatus[]
}

export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref('')
  const emails = ref<CategorizedEmailSummary[]>([])
  const events = ref<CalendarEvent[]>([])
  const isLoading = ref(false)
  const draftingActionKey = ref<string | null>(null)
  const error = ref<string | null>(null)
  const generated = ref(false)
  const integrations = ref<DashboardIntegrationStatus[]>([])

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
    const authStore = useAuthStore()
    isLoading.value = true
    error.value = null
    integrations.value = getConnectedProviders(authStore).map((provider) => ({
      provider,
      status: 'loading',
    }))

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/summary/generate`,
        {},
        {
          headers: getAuthHeaders(),
        },
      )
      const dashboardData = data as DashboardResponse

      summary.value = dashboardData.summary || ''
      events.value = dashboardData.events || []
      emails.value = (dashboardData.email_summaries || []).map((email: Partial<CategorizedEmailSummary>) => ({
        emailId: email.emailId || '',
        summary: email.summary || '',
        category: (email.category as EmailCategory) || 'INFO',
        suggestedActions: Array.isArray(email.suggestedActions) ? email.suggestedActions : [],
        senderName: email.senderName || '',
        senderEmail: email.senderEmail || '',
        subject: email.subject || '',
        link: email.link || '',
      }))
      tasksStore.setSuggestedTasks(dashboardData.suggested_tasks || [])
      error.value = dashboardData.error || null
      integrations.value = mergeIntegrationStatuses(
        getConnectedProviders(authStore),
        dashboardData.integrations || [],
      )
      generated.value = true
    } catch (caughtError: unknown) {
      if (axios.isAxiosError(caughtError)) {
        error.value = caughtError.response?.data?.message || 'Impossible de générer le résumé.'
      } else {
        error.value = 'Impossible de générer le résumé.'
      }
      integrations.value = getConnectedProviders(authStore).map((provider) => ({
        provider,
        status: 'error',
        code: 'provider_unavailable',
        message: error.value || 'Impossible de contacter ce service pour le moment.',
      }))
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
    integrations.value = []
  }

  function getConnectedProviders(authStore: ReturnType<typeof useAuthStore>) {
    const providers: string[] = []
    if ((authStore.user?.connectedGoogleAccounts || []).length > 0) {
      providers.push('GOOGLE')
    }
    if ((authStore.user?.connectedOutlookAccounts || []).length > 0) {
      providers.push('MICROSOFT')
    }
    return providers
  }

  function mergeIntegrationStatuses(
    connectedProviders: string[],
    receivedStatuses: DashboardIntegrationStatus[],
  ) {
    const statusMap = new Map(receivedStatuses.map((status) => [status.provider.toUpperCase(), status]))

    return connectedProviders.map((provider) => statusMap.get(provider) || {
      provider,
      status: 'ready' as const,
    })
  }

  return {
    summary,
    emails,
    events,
    isLoading,
    draftingActionKey,
    error,
    generated,
    integrations,
    fetchDashboardData,
    generateSummary,
    createDraft,
    isDrafting,
    reset,
  }
})
