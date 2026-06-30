<template>
  <div class="theme-shell min-h-screen flex">
    <aside v-if="!uiStore.isDeepWorkModeActive" class="theme-sidebar w-64 border-r flex flex-col">
      <div class="theme-header p-6 border-b">
        <div class="flex items-center gap-3">
          <div class="theme-button-primary w-10 h-10 rounded-xl flex items-center justify-center">
            <i class="pi pi-calendar text-white"></i>
          </div>
          <span class="theme-title text-xl font-bold">MyDay</span>
        </div>
      </div>

      <div class="p-4 border-b">
        <p class="theme-text-secondary text-xs font-semibold uppercase tracking-wide">Espace actif</p>
        <div class="theme-panel-muted mt-3 rounded-2xl border p-3">
          <div class="flex items-center gap-3">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: currentWorkspaceOption.color }"></span>
            <i :class="[currentWorkspaceOption.icon, 'text-sm']"></i>
            <span class="theme-title text-sm font-medium truncate">{{ currentWorkspaceOption.name }}</span>
          </div>
          <select
            v-model="selectedWorkspaceId"
            :disabled="workspaceStore.loading"
            class="mt-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option :value="ALL_WORKSPACES_ID">Toutes les vues</option>
            <option v-for="workspace in workspaceStore.workspaces" :key="workspace.id" :value="workspace.id">
              {{ workspace.name }}
            </option>
          </select>
        </div>
      </div>

      <nav class="p-4 flex-1">
        <RouterLink :to="{ name: 'my-day' }" :class="navLinkClass">
          <i class="pi pi-sun"></i>
          <span>My Day</span>
        </RouterLink>
        <RouterLink :to="{ name: 'dashboard' }" :class="navLinkClass">
          <i class="pi pi-home"></i>
          <span>Tableau de bord</span>
        </RouterLink>
        <RouterLink :to="{ name: 'tasks' }" :class="navLinkClass">
          <i class="pi pi-check-square"></i>
          <span>Tâches</span>
        </RouterLink>
        <RouterLink :to="{ name: 'calendar' }" :class="navLinkClass">
          <i class="pi pi-calendar"></i>
          <span>Calendrier</span>
        </RouterLink>
        <RouterLink :to="{ name: 'integrations' }" :class="navLinkClass">
          <i class="pi pi-plug"></i>
          <span>Intégrations</span>
        </RouterLink>
        <RouterLink :to="{ name: 'analytics' }" :class="navLinkClass">
          <i class="pi pi-chart-bar"></i>
          <span>Analyses</span>
        </RouterLink>
        <RouterLink :to="{ name: 'settings' }" :class="navLinkClass">
          <i class="pi pi-cog"></i>
          <span>Paramètres</span>
        </RouterLink>
      </nav>

      <div v-if="timerStore.activeEntry" class="theme-panel-muted mx-4 mb-4 rounded-2xl border p-4">
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: var(--accent)">Chrono en cours</p>
        <p class="theme-title mt-2 text-sm font-medium">{{ timerStore.activeEntry.task.title }}</p>
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="theme-title font-mono text-lg font-semibold">{{ formattedElapsedTime }}</span>
          <button
            @click="handleStopTimer"
            :disabled="timerStore.loading"
            class="theme-button-primary rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            Arrêter
          </button>
        </div>
        <p v-if="timerErrorMessage" class="mt-2 text-xs" style="color: var(--danger)">{{ timerErrorMessage }}</p>
      </div>

      <div class="theme-header p-4 border-t">
        <div class="flex items-center gap-3">
          <img
            v-if="authStore.user?.picture"
            :src="authStore.user.picture"
            :alt="authStore.user.name ?? ''"
            class="w-8 h-8 rounded-full"
          />
          <div v-else class="theme-accent-icon w-8 h-8 rounded-full flex items-center justify-center">
            <i class="pi pi-user text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="theme-title text-sm font-medium truncate">{{ authStore.user?.name || authStore.user?.email }}</p>
              <span
                v-if="authStore.isPremium"
                class="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >Pro</span>
            </div>
            <p class="theme-text-secondary text-xs truncate">{{ authStore.user?.email }}</p>
          </div>
          <button @click="handleLogout" class="theme-icon-button">
            <i class="pi pi-sign-out text-sm"></i>
          </button>
        </div>
      </div>
    </aside>

    <main v-if="!uiStore.isDeepWorkModeActive" class="flex-1 min-w-0">
      <RouterView />
    </main>

    <AIChat v-if="!uiStore.isDeepWorkModeActive" />
    <DeepWorkOverlay v-if="uiStore.isDeepWorkModeActive" />
    <MorningBriefingModal
      :visible="isMorningBriefingVisible"
      :briefing="morningBriefing"
      :is-fallback="isMorningBriefingFallback"
      @close="dismissMorningBriefing"
    />
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import AIChat from '../components/AIChat.vue'
import DeepWorkOverlay from '../components/DeepWorkOverlay.vue'
import MorningBriefingModal from '../components/MorningBriefingModal.vue'
import { useAuthStore } from '../stores/auth'
import { useTimerStore } from '../stores/timer.store'
import { ALL_WORKSPACES_ID, useWorkspaceStore } from '../stores/workspace.store'
import { useUiStore } from '../stores/ui.store'

const navLinkClass =
  'theme-nav-link flex items-center gap-3 px-3 py-2 rounded-lg mb-1 aria-[current=page]:font-medium'

const authStore = useAuthStore()
const router = useRouter()
const timerStore = useTimerStore()
const workspaceStore = useWorkspaceStore()
const uiStore = useUiStore()
const timerErrorMessage = ref<string | null>(null)
const LAST_BRIEFING_DATE_KEY = 'lastBriefingDate'
const isMorningBriefingVisible = ref(false)
const isMorningBriefingFallback = ref(false)
const morningBriefing = ref({
  greeting: 'Bonjour ! Tout est prêt pour bien démarrer.',
  emailSummary: 'Aucune donnée de briefing disponible.',
  scheduleOverview: 'Aucune donnée de briefing disponible.',
  recommendedFocus: 'Commencez par votre tâche prioritaire.',
})

const selectedWorkspaceId = computed({
  get: () => workspaceStore.activeWorkspaceId,
  set: (value: string) => workspaceStore.setActiveWorkspaceId(value),
})

const currentWorkspaceOption = computed(() => {
  if (workspaceStore.activeWorkspaceId === ALL_WORKSPACES_ID) {
    return {
      id: ALL_WORKSPACES_ID,
      name: 'Toutes les vues',
      color: '#6366F1',
      icon: 'pi pi-objects-column',
    }
  }

  return workspaceStore.activeWorkspace || {
    id: ALL_WORKSPACES_ID,
    name: 'Toutes les vues',
    color: '#6366F1',
    icon: 'pi pi-objects-column',
  }
})

const formattedElapsedTime = computed(() => {
  const hours = String(Math.floor(timerStore.elapsedSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((timerStore.elapsedSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(timerStore.elapsedSeconds % 60).padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
})

async function handleStopTimer() {
  timerErrorMessage.value = null

  try {
    await timerStore.stopTimer()
  } catch (caughtError: unknown) {
    if (axios.isAxiosError(caughtError)) {
      timerErrorMessage.value = caughtError.response?.data?.message || "Impossible d'arrêter le chrono en cours."
      return
    }

    timerErrorMessage.value = "Impossible d'arrêter le chrono en cours."
  }
}

function handleLogout() {
  uiStore.resetDeepWork()
  timerStore.reset()
  workspaceStore.reset()
  authStore.logout()
  router.push('/login')
}

function getDateKeyForToday() {
  return new Date().toISOString().slice(0, 10)
}

function dismissMorningBriefing() {
  localStorage.setItem(LAST_BRIEFING_DATE_KEY, getDateKeyForToday())
  isMorningBriefingVisible.value = false
}

async function maybeShowMorningBriefing() {
  if (!authStore.token) {
    return
  }

  const today = getDateKeyForToday()
  if (localStorage.getItem(LAST_BRIEFING_DATE_KEY) === today) {
    return
  }

  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/ai/morning-briefing`, {
      headers: { Authorization: 'Bearer ' + authStore.token },
    })

    morningBriefing.value = {
      greeting: data.greeting || morningBriefing.value.greeting,
      emailSummary: data.emailSummary || morningBriefing.value.emailSummary,
      scheduleOverview: data.scheduleOverview || morningBriefing.value.scheduleOverview,
      recommendedFocus: data.recommendedFocus || morningBriefing.value.recommendedFocus,
    }
    isMorningBriefingFallback.value = data.isFallback === true

    isMorningBriefingVisible.value = true
  } catch (error) {
    console.warn('Impossible de charger le briefing matinal.', error)
  }
}

onMounted(async () => {
  if (!authStore.token) {
    workspaceStore.reset()
    timerStore.reset()
    return
  }

  await Promise.all([
    timerStore.fetchCurrentTimer(),
    workspaceStore.fetchWorkspaces(),
  ])
  await maybeShowMorningBriefing()
})
</script>
