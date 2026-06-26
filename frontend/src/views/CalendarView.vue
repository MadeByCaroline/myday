<template>
  <div class="p-8">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Planning quotidien</h1>
          <p class="text-sm text-gray-500">{{ todayLabel }}</p>
        </div>
        <span class="text-sm text-gray-500">
          {{ events.length }} événement{{ events.length === 1 ? '' : 's' }}
        </span>
      </div>

      <div v-if="loading" class="bg-white rounded-2xl border border-gray-200 p-8 text-gray-500">
        Chargement de vos événements de calendrier...
      </div>

      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
        {{ error }}
      </div>

      <div v-else class="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div v-if="events.length === 0" class="p-12 text-center text-gray-500">
          Aucun événement trouvé entre 08:00 et 20:00 aujourd’hui.
        </div>

        <div v-else class="relative h-[720px]">
          <div
            v-for="hour in hours"
            :key="hour"
            class="absolute left-0 right-0 border-t border-gray-100"
            :style="{ top: `${((hour - 8) / 12) * 720}px` }"
          >
            <span class="absolute -top-3 left-4 text-xs text-gray-400 bg-white px-2">
              {{ formatHour(hour) }}
            </span>
          </div>

          <div class="absolute inset-y-0 left-20 border-l border-gray-200"></div>

          <div
            v-for="event in visibleEvents"
            :key="`${event.provider}-${event.id}-${event.start}`"
            class="absolute left-24 right-4 rounded-lg border bg-white shadow-sm overflow-hidden"
            :style="{ top: `${eventTop(event)}px`, height: `${eventHeight(event)}px` }"
          >
            <div class="flex h-full">
              <div :class="['w-1.5', providerBarClass(event.provider)]"></div>
              <div class="p-3 flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ event.title }}</p>
                  <span class="text-xs text-gray-500 whitespace-nowrap">
                    {{ formatEventTime(event.start) }} - {{ formatEventTime(event.end) }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1">{{ event.provider === 'GOOGLE' ? 'Google' : 'Microsoft' }}</p>
                <p v-if="event.location" class="text-xs text-gray-500 mt-1 truncate">
                  <i class="pi pi-map-marker mr-1"></i>{{ event.location }}
                </p>
                <button
                  v-if="event.link"
                  type="button"
                  class="mt-2 text-xs bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700"
                  @click="openLink(event.link)"
                >
                  Rejoindre la réunion
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

interface UnifiedEvent {
  id: string
  title: string
  start: string
  end: string
  provider: 'GOOGLE' | 'MICROSOFT'
  location?: string
  link?: string
}

const authStore = useAuthStore()
const loading = ref(false)
const error = ref<string | null>(null)
const events = ref<UnifiedEvent[]>([])
const hours = Array.from({ length: 13 }, (_, index) => index + 8)

const todayLabel = computed(() =>
  new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
)

const visibleEvents = computed(() =>
  events.value
    .filter((event) => {
      const startHour = new Date(event.start).getHours()
      return Number.isFinite(startHour) && startHour >= 8 && startHour < 20
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
)

function minutesFromEightAm(value: string): number {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.min(12 * 60, date.getHours() * 60 + date.getMinutes() - 8 * 60))
}

function eventTop(event: UnifiedEvent): number {
  return (minutesFromEightAm(event.start) / (12 * 60)) * 720
}

function eventHeight(event: UnifiedEvent): number {
  const start = minutesFromEightAm(event.start)
  const end = minutesFromEightAm(event.end)
  const duration = Math.max(30, end - start)
  return (duration / (12 * 60)) * 720
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`
}

function formatEventTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function providerBarClass(provider: UnifiedEvent['provider']) {
  return provider === 'GOOGLE' ? 'bg-green-500' : 'bg-blue-500'
}

function openLink(link: string) {
  window.open(link, '_blank', 'noopener,noreferrer')
}

async function fetchTodayEvents() {
  if (!authStore.token) return
  loading.value = true
  error.value = null
  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/calendar/today`, {
      headers: {
        Authorization: 'Bearer ' + authStore.token,
      },
    })
    events.value = Array.isArray(data) ? data : []
  } catch {
    error.value = 'Impossible de charger les événements du calendrier.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchTodayEvents()
})
</script>
