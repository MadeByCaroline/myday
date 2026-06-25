<template>
  <div class="bg-white rounded-2xl border border-gray-200 p-6">
    <div class="flex items-center gap-3 mb-6">
      <div class="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
        <i class="pi pi-calendar text-green-600"></i>
      </div>
      <h3 class="text-lg font-semibold text-gray-900">Today's Agenda</h3>
      <span class="ml-auto text-sm text-gray-500">
        {{ events.length }} event{{ events.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <div v-if="events.length === 0" class="text-center py-8 text-gray-400">
      <i class="pi pi-calendar text-3xl mb-3 block"></i>
      <p>No events scheduled for today</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="event in sortedEvents"
        :key="event.id"
        class="flex gap-4 group"
      >
        <!-- Time -->
        <div class="w-20 flex-shrink-0 text-right pt-1">
          <span class="text-xs font-medium text-gray-500">{{ formatTime(event.start) }}</span>
        </div>
        <!-- Dot + line -->
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full bg-indigo-400 flex-shrink-0 mt-1"></div>
          <div class="w-0.5 bg-gray-200 flex-1 min-h-4 mt-1"></div>
        </div>
        <!-- Card -->
        <div class="flex-1 pb-4">
          <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 group-hover:border-indigo-300 transition-colors">
            <div class="flex items-start justify-between gap-2">
              <h4 class="text-sm font-semibold text-gray-900">{{ event.title }}</h4>
              <span class="text-xs text-gray-500 flex-shrink-0">{{ formatDuration(event.start, event.end) }}</span>
            </div>
            <div v-if="event.location" class="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <i class="pi pi-map-marker"></i>
              <span>{{ event.location }}</span>
            </div>
            <p v-if="event.description" class="mt-1 text-xs text-gray-500 line-clamp-2">
              {{ event.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
}

const props = defineProps<{ events: CalendarEvent[] }>()

const sortedEvents = computed(() =>
  [...props.events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  ),
)

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch { return '' }
}

function formatDuration(start: string, end: string): string {
  if (!start || !end) return ''
  try {
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  } catch { return '' }
}
</script>
