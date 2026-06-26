<template>
  <div class="p-8">
    <div class="mx-auto max-w-5xl">
      <header class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">My Day</h1>
        <p class="mt-1 text-sm text-gray-500">{{ todayLabel }}</p>
      </header>

      <div class="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Filtre rapide</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="workspace in quickFilterWorkspaces"
            :key="workspace.id"
            type="button"
            class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="isWorkspaceVisible(workspace.id) ? 'text-white' : 'bg-white text-gray-500'"
            :style="workspacePillStyle(workspace)"
            @click="toggleWorkspace(workspace.id)"
          >
            <span class="h-2 w-2 rounded-full bg-current"></span>
            <span>{{ workspace.name }}</span>
          </button>
        </div>
      </div>

      <div v-if="myDayStore.loading" class="rounded-2xl border border-gray-200 bg-white p-8 text-gray-500">
        Chargement de votre timeline...
      </div>

      <div v-else-if="myDayStore.error" class="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
        {{ myDayStore.error }}
      </div>

      <div v-else-if="filteredTimeline.length === 0" class="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">
        Aucun élément à afficher pour les filtres sélectionnés.
      </div>

      <div v-else class="rounded-2xl border border-gray-200 bg-white p-6">
        <div v-for="(item, index) in filteredTimeline" :key="item.id" class="flex gap-4">
          <div class="w-20 flex-shrink-0 pt-1 text-right text-xs font-medium text-gray-500">
            {{ formatTime(item.startTime) }}
          </div>
          <div class="relative flex w-4 justify-center">
            <span class="z-10 mt-1 h-3 w-3 rounded-full" :style="{ backgroundColor: item.workspace.color }"></span>
            <span
              v-if="index < filteredTimeline.length - 1"
              class="absolute top-4 bottom-0 w-px bg-gray-200"
            ></span>
          </div>
          <div class="flex-1 pb-5">
            <article class="rounded-xl border bg-white p-4" :style="timelineCardStyle(item.workspace.color)">
              <div class="flex items-start justify-between gap-3">
                <h2 class="text-sm font-semibold text-gray-900">{{ item.title }}</h2>
                <span class="text-xs text-gray-500">
                  {{ formatTime(item.startTime) }} - {{ formatTime(item.endTime) }}
                </span>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :style="workspaceBadgeStyle(item.workspace)">
                  {{ item.workspace.name }}
                </span>
                <span class="text-xs text-gray-500">{{ item.type === 'TASK' ? 'Tâche' : 'Événement' }}</span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMyDayStore } from '../stores/myDay.store'
import { useWorkspaceStore, type Workspace } from '../stores/workspace.store'

const myDayStore = useMyDayStore()
const workspaceStore = useWorkspaceStore()
const visibleWorkspaceIds = ref<string[]>([])

const todayLabel = computed(() =>
  new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
)

const quickFilterWorkspaces = computed(() => {
  const seen = new Set<string>()
  const options: Workspace[] = []

  for (const workspace of workspaceStore.workspaces) {
    if (seen.has(workspace.id)) continue
    seen.add(workspace.id)
    options.push(workspace)
  }

  for (const item of myDayStore.getTodayTimeline) {
    if (seen.has(item.workspace.id)) continue
    seen.add(item.workspace.id)
    options.push(item.workspace)
  }

  return options
})

watch(
  quickFilterWorkspaces,
  (workspaces) => {
    const currentIds = workspaces.map((workspace) => workspace.id)
    if (visibleWorkspaceIds.value.length === 0) {
      visibleWorkspaceIds.value = currentIds
      return
    }

    const preserved = visibleWorkspaceIds.value.filter((id) => currentIds.includes(id))
    const additions = currentIds.filter((id) => !preserved.includes(id))
    visibleWorkspaceIds.value = [...preserved, ...additions]
  },
  { immediate: true },
)

const filteredTimeline = computed(() =>
  myDayStore.getTodayTimeline.filter((item) => visibleWorkspaceIds.value.includes(item.workspace.id)),
)

function toggleWorkspace(workspaceId: string) {
  if (visibleWorkspaceIds.value.includes(workspaceId)) {
    visibleWorkspaceIds.value = visibleWorkspaceIds.value.filter((id) => id !== workspaceId)
    return
  }
  visibleWorkspaceIds.value = [...visibleWorkspaceIds.value, workspaceId]
}

function isWorkspaceVisible(workspaceId: string) {
  return visibleWorkspaceIds.value.includes(workspaceId)
}

function timelineCardStyle(color: string) {
  return {
    borderLeftWidth: '4px',
    borderLeftColor: color,
  }
}

function workspacePillStyle(workspace: Workspace) {
  if (isWorkspaceVisible(workspace.id)) {
    return { backgroundColor: workspace.color, borderColor: workspace.color }
  }
  return { borderColor: workspace.color, color: workspace.color }
}

function workspaceBadgeStyle(workspace: Workspace) {
  return {
    borderColor: workspace.color,
    color: workspace.color,
    backgroundColor: workspaceBackgroundColor(workspace.color),
  }
}

function workspaceBackgroundColor(color: string) {
  const rgb = parseWorkspaceColor(color)
  if (!rgb) return 'rgba(148, 163, 184, 0.12)'
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`
}

function parseWorkspaceColor(color: string) {
  const normalized = color.trim()
  if (/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    }
  }
  if (/^#([0-9a-fA-F]{3})$/.test(normalized)) {
    return {
      r: Number.parseInt(normalized[1] + normalized[1], 16),
      g: Number.parseInt(normalized[2] + normalized[2], 16),
      b: Number.parseInt(normalized[3] + normalized[3], 16),
    }
  }
  return null
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

onMounted(async () => {
  if (workspaceStore.workspaces.length === 0) {
    await workspaceStore.fetchWorkspaces()
  }
  await myDayStore.fetchTodayData()
})
</script>
