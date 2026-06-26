<template>
  <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Good {{ greeting }}, {{ firstName }}!</h2>
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
            {{ dashboardStore.isLoading ? 'Generating...' : 'Generate My Summary' }}
          </button>
        </div>
      </header>

      <!-- Content area -->
      <div class="flex-1 overflow-auto p-8">
        <div v-if="!dashboardStore.generated && !dashboardStore.isLoading" class="text-center py-16">
          <div class="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <i class="pi pi-sparkles text-indigo-400 text-4xl"></i>
          </div>
          <h3 class="text-xl font-semibold text-gray-700 mb-2">Ready to analyze your day?</h3>
          <p class="text-gray-500 max-w-md mx-auto">
            Click "Generate My Summary" to get an AI-powered overview of your emails, calendar events, and suggested tasks.
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
              <h3 class="text-lg font-semibold text-gray-900">Email Highlights</h3>
            </div>
            <ul v-if="dashboardStore.emails.length > 0" class="space-y-3">
              <li
                v-for="email in dashboardStore.emails"
                :key="email.emailId"
                class="border border-gray-100 rounded-xl p-3 flex items-start gap-3"
              >
                <span
                 class="text-xs font-medium px-2.5 py-1 rounded-full border"
                 :class="categoryBadgeClass(email.category)"
               >
                 {{ email.category }}
               </span>
               <div class="flex-1 space-y-3">
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
            <p v-else class="text-sm text-gray-500">No email summaries available.</p>
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

const greeting = computed(() => {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
})

const firstName = computed(() => {
  const name = authStore.user?.name || authStore.user?.email || 'there'
  return name.split(' ')[0]
})

const currentDate = computed(() =>
  now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
)

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
