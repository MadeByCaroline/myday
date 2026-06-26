<template>
  <div class="min-h-screen bg-gray-50 flex">
    <!-- Sidebar -->
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
      </nav>

      <div class="p-4 border-t border-gray-200">
        <div class="flex items-center gap-3">
          <img
            v-if="authStore.user?.picture"
            :src="authStore.user.picture"
            :alt="authStore.user.name"
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

    <!-- Main content -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Good {{ greeting }}, {{ firstName }}!</h2>
          <p class="text-sm text-gray-500">{{ currentDate }}</p>
        </div>
        <button
          @click="generateSummary"
          :disabled="summaryStore.loading"
          class="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <i class="pi pi-spin pi-spinner" v-if="summaryStore.loading"></i>
          <i class="pi pi-sparkles" v-else></i>
          {{ summaryStore.loading ? 'Generating...' : 'Generate My Summary' }}
        </button>
      </header>

      <section class="bg-white border-b border-gray-200 px-8 py-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-900">Connected Accounts</h3>
            <p class="text-xs text-gray-500 mt-1">
              Google: {{ connectedGoogleAccounts.length > 0 ? connectedGoogleAccounts.join(', ') : 'none' }}
            </p>
            <p class="text-xs text-gray-500 mt-1">
              Outlook: {{ connectedOutlookAccounts.length > 0 ? connectedOutlookAccounts.join(', ') : 'none' }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              @click="linkAnotherGoogleAccount"
              :disabled="!authStore.token"
              class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Link another Google Account
            </button>
            <button
              @click="connectOutlookAccount"
              :disabled="!authStore.token"
              class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Connect Outlook
            </button>
          </div>
        </div>
      </section>

      <section v-if="linkErrorMessage" class="bg-red-50 border-b border-red-200 px-8 py-3 text-sm text-red-700">
        <i class="pi pi-exclamation-circle mr-2"></i>
        {{ linkErrorMessage }}
      </section>

      <!-- Content area -->
      <div class="flex-1 overflow-auto p-8">
        <div v-if="!summaryStore.generated && !summaryStore.loading" class="text-center py-16">
          <div class="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <i class="pi pi-sparkles text-indigo-400 text-4xl"></i>
          </div>
          <h3 class="text-xl font-semibold text-gray-700 mb-2">Ready to analyze your day?</h3>
          <p class="text-gray-500 max-w-md mx-auto">
            Click "Generate My Summary" to get an AI-powered overview of your emails, calendar events, and suggested tasks.
          </p>
        </div>

        <div v-if="summaryStore.error" class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
          <i class="pi pi-exclamation-circle mr-2"></i>
          {{ summaryStore.error }}
        </div>

        <div v-if="summaryStore.generated" class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <!-- Summary Card -->
          <div class="xl:col-span-2">
            <SummaryCard :summary="summaryStore.summary" />
          </div>

          <!-- Tasks Column -->
          <div>
            <TaskListView />
          </div>

          <!-- Agenda - full width -->
          <div class="xl:col-span-3">
            <DailyAgenda :events="summaryStore.events" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { useSummaryStore } from '../stores/summary'
import { useTasksStore } from '../stores/tasks'
import SummaryCard from '../components/SummaryCard.vue'
import DailyAgenda from '../components/DailyAgenda.vue'
import TaskListView from '../components/TaskListView.vue'

const router = useRouter()
const authStore = useAuthStore()

const navLinkClass =
  'flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 mb-1 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 aria-[current=page]:font-medium'
const summaryStore = useSummaryStore()
const tasksStore = useTasksStore()
const linkErrorMessage = ref<string | null>(null)

const now = new Date()
const hour = now.getHours()

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
const connectedGoogleAccounts = computed(() => authStore.user?.connectedGoogleAccounts || [])
const connectedOutlookAccounts = computed(() => authStore.user?.connectedOutlookAccounts || [])

async function generateSummary() {
  await summaryStore.generateSummary()
}

function handleLogout() {
  authStore.logout()
  summaryStore.reset()
  router.push('/login')
}

async function linkAnotherGoogleAccount() {
  if (!authStore.token) return

  try {
    const { data } = await axios.get(
      `${import.meta.env.VITE_API_URL}/auth/google/link`,
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
    window.location.href = data.url
  } catch {
    linkErrorMessage.value = 'Could not start Google account linking. Please refresh the page and try again.'
  }
}

async function connectOutlookAccount() {
  if (!authStore.token) return

  try {
    const { data } = await axios.get(
      `${import.meta.env.VITE_API_URL}/auth/microsoft/link`,
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
    window.location.href = data.url
  } catch {
    linkErrorMessage.value = 'Could not start Outlook account linking. Please refresh the page and try again.'
  }
}

onMounted(async () => {
  const hasLinkError = new URLSearchParams(window.location.search).get('linkError') === '1'
  if (hasLinkError) {
    linkErrorMessage.value = 'Account linking failed. Please verify account permissions and try again.'
  }

  const refreshProfile = new URLSearchParams(window.location.search).get('refreshProfile') === '1'

  if (authStore.isAuthenticated && (!authStore.user || refreshProfile)) {
    try {
      const { data } = await axios.get(
        `${import.meta.env.VITE_API_URL}/auth/profile`,
        { headers: { Authorization: 'Bearer ' + authStore.token } },
      )
      authStore.setUser(data)
      if (refreshProfile) {
        window.history.replaceState({}, '', '/dashboard')
      }
    } catch {
      authStore.logout()
      router.push('/login')
    }
  }
  await tasksStore.fetchSavedTasks()
})
</script>
