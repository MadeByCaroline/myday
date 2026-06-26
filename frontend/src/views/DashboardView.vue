<template>
  <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">{{ greeting }}, {{ firstName }}&nbsp;!</h2>
          <p class="text-sm text-gray-500">{{ currentDate }}</p>
        </div>
        <div class="flex items-center gap-3">
          <button
            @click="optimizeDay"
            :disabled="tasksStore.loading || dashboardStore.isLoading"
            class="flex items-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <i class="pi pi-spin pi-spinner" v-if="tasksStore.loading && isOptimizing"></i>
            <i class="pi pi-calendar-plus" v-else></i>
            {{ tasksStore.loading && isOptimizing ? 'Optimisation...' : '✨ Optimiser ma journée' }}
          </button>
          <button
            @click="generateSummary"
            :disabled="dashboardStore.isLoading"
            class="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <i class="pi pi-spin pi-spinner" v-if="dashboardStore.isLoading"></i>
            <i class="pi pi-sparkles" v-else></i>
            {{ dashboardStore.isLoading ? 'Génération...' : 'Générer mon résumé' }}
          </button>
        </div>
      </header>

      <!-- Content area -->
      <div class="flex-1 overflow-auto p-8">
        <div v-if="!dashboardStore.generated && !dashboardStore.isLoading" class="text-center py-16">
          <div class="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <i class="pi pi-sparkles text-indigo-400 text-4xl"></i>
          </div>
          <h3 class="text-xl font-semibold text-gray-700 mb-2">Prêt à analyser votre journée ?</h3>
          <p class="text-gray-500 max-w-md mx-auto">
            Cliquez sur « Générer mon résumé » pour obtenir une vue d’ensemble IA de vos e-mails, de votre agenda et des tâches suggérées.
          </p>
        </div>

        <div v-if="dashboardStore.error" class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
          <i class="pi pi-exclamation-circle mr-2"></i>
          {{ dashboardStore.error }}
        </div>

        <div v-if="dashboardStore.generated" class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <!-- Summary Card -->
          <div class="xl:col-span-2">
            <SummaryCard :summary="dashboardStore.summary" />
          </div>

          <!-- Tasks Column -->
          <div>
            <TaskListView />
          </div>

          <!-- Agenda - full width -->
          <div class="xl:col-span-3">
            <DailyAgenda :events="dashboardStore.events" />
          </div>

          <!-- Email summaries - full width -->
          <div class="xl:col-span-3 bg-white rounded-2xl border border-gray-200 p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                <i class="pi pi-envelope text-indigo-600"></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-900">Temps forts des e-mails</h3>
            </div>
            <ul v-if="dashboardStore.emails.length > 0" class="space-y-3">
              <li
                v-for="email in dashboardStore.emails"
                :key="email.emailId"
                class="border border-gray-100 rounded-xl p-4 space-y-3"
              >
                <!-- Traceability tag row -->
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <!-- Sender avatar (initials) -->
                    <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span class="text-xs font-semibold text-indigo-700 uppercase">{{ senderInitials(email.senderName || email.senderEmail) }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900 truncate">{{ email.senderName || email.senderEmail }}</p>
                      <p class="text-xs text-gray-500 truncate">{{ email.senderEmail }}</p>
                    </div>
                    <a
                      v-if="email.link"
                      :href="email.link"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-gray-400 hover:text-indigo-600 transition-colors shrink-0"
                      title="Ouvrir l’e-mail d’origine"
                    >
                      <i class="pi pi-external-link text-sm"></i>
                    </a>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span
                      class="text-xs font-medium px-2.5 py-1 rounded-full border"
                      :class="categoryBadgeClass(email.category)"
                    >
                      {{ categoryLabel(email.category) }}
                    </span>
                    <button
                      type="button"
                      class="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-2 py-1 rounded-full transition-colors"
                      :title="`Exclure ${email.senderEmail} des résumés IA`"
                      :disabled="banningEmailId === email.emailId"
                      @click="banSender(email)"
                    >
                      <i v-if="banningEmailId === email.emailId" class="pi pi-spin pi-spinner text-xs"></i>
                      <i v-else class="pi pi-ban text-xs"></i>
                      Exclure
                    </button>
                  </div>
                </div>

                <!-- Subject line -->
                <p v-if="email.subject" class="text-xs font-medium text-gray-600 truncate">{{ email.subject }}</p>

                <!-- Summary + actions -->
                <div class="space-y-2">
                  <p class="text-sm text-gray-700 leading-relaxed">
                    {{ email.summary }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="action in email.suggestedActions"
                      :key="action"
                      type="button"
                      class="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="dashboardStore.isDrafting(email.emailId, action)"
                      @click="createDraft(email.emailId, action)"
                    >
                      <i
                        v-if="dashboardStore.isDrafting(email.emailId, action)"
                        class="pi pi-spin pi-spinner"
                      ></i>
                      <span>{{ action }}</span>
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            <p v-else class="text-sm text-gray-500">Aucun résumé d’e-mail disponible.</p>
          </div>
        </div>
      </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '../stores/auth'
import { useDashboardStore } from '../stores/dashboard.store'
import type { CategorizedEmailSummary } from '../stores/dashboard.store'
import { useTasksStore } from '../stores/tasks'
import SummaryCard from '../components/SummaryCard.vue'
import DailyAgenda from '../components/DailyAgenda.vue'
import TaskListView from '../components/TaskListView.vue'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const dashboardStore = useDashboardStore()
const tasksStore = useTasksStore()

const now = new Date()
const hour = now.getHours()
const isOptimizing = ref(false)
const banningEmailId = ref<string | null>(null)

const greeting = computed(() => {
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Bon après-midi'
  return 'Bonsoir'
})

const firstName = computed(() => {
  const name = authStore.user?.name || authStore.user?.email || 'vous'
  return name.split(' ')[0]
})

const currentDate = computed(() =>
  now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
)

function senderInitials(name: string): string {
  const trimmedName = name.trim()
  const parts = trimmedName.split(/\s+/).filter((p) => p.length > 0)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return (trimmedName[0] || '?').toUpperCase()
}

function categoryBadgeClass(category: string) {
  switch (category) {
    case 'URGENT':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'ACTION_REQUIRED':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'INVOICE':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'NEWSLETTER':
      return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'INFO':
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200'
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'URGENT':
      return 'Urgent'
    case 'ACTION_REQUIRED':
      return 'Action requise'
    case 'INVOICE':
      return 'Facture'
    case 'NEWSLETTER':
      return 'Newsletter'
    case 'INFO':
      return 'Information'
    default:
      return category
  }
}

async function generateSummary() {
  await dashboardStore.generateSummary()
}

async function createDraft(emailId: string, action: string) {
  try {
    const result = await dashboardStore.createDraft(emailId, action)
    toast.add({
      severity: 'success',
      summary: 'Succès',
      detail:
        result.provider === 'MICROSOFT'
          ? 'Brouillon créé dans Outlook !'
          : 'Brouillon créé dans Gmail !',
      life: 3000,
    })
  } catch (caughtError: unknown) {
    const detail =
      axios.isAxiosError(caughtError) && typeof caughtError.response?.data?.message === 'string'
        ? caughtError.response.data.message
        : 'Impossible de créer le brouillon.'

    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail,
      life: 4000,
    })
  }
}

async function banSender(email: CategorizedEmailSummary) {
  const senderEmail = email.senderEmail
  if (!senderEmail || !authStore.token) return

  banningEmailId.value = email.emailId
  try {
    const { data: currentSettings } = await axios.get(
      `${import.meta.env.VITE_API_URL}/settings`,
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
    const existing: string[] = Array.isArray(currentSettings.excludedSenders) ? currentSettings.excludedSenders : []
    if (!existing.includes(senderEmail)) {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/settings`,
        { excludedSenders: [...existing, senderEmail] },
        { headers: { Authorization: 'Bearer ' + authStore.token } },
      )
    }
    toast.add({
      severity: 'success',
      summary: 'Expéditeur exclu',
      detail: `"${senderEmail}" sera exclu des futurs résumés IA.`,
      life: 3000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail: 'Impossible de mettre à jour la liste d\'exclusion.',
      life: 4000,
    })
  } finally {
    banningEmailId.value = null
  }
}

async function optimizeDay() {
  isOptimizing.value = true
  try {
    const blocks = await tasksStore.optimizeDay()
    if (blocks.length === 0) {
      toast.add({
        severity: 'info',
        summary: 'Optimisation',
        detail: 'Aucune tâche ouverte à planifier.',
        life: 3000,
      })
    } else {
      toast.add({
        severity: 'success',
        summary: '✨ Journée optimisée !',
        detail: `${blocks.length} tâche(s) planifiée(s) dans votre agenda.`,
        life: 4000,
      })
    }
  } catch (caughtError: unknown) {
    console.error('[AI Scheduling Error]:', caughtError)
    const detail =
      axios.isAxiosError(caughtError) && typeof caughtError.response?.data?.message === 'string'
        ? caughtError.response.data.message
        : 'Impossible d\'optimiser la journée.'

    toast.add({
      severity: 'error',
      summary: 'Erreur',
      detail,
      life: 4000,
    })
  } finally {
    isOptimizing.value = false
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated && !authStore.user) {
    try {
      const { data } = await axios.get(
        `${import.meta.env.VITE_API_URL}/auth/profile`,
        { headers: { Authorization: 'Bearer ' + authStore.token } },
      )
      authStore.setUser(data)
    } catch {
      authStore.logout()
      router.push('/login')
    }
  }
  await tasksStore.fetchSavedTasks()
  await dashboardStore.fetchDashboardData()
})
</script>
