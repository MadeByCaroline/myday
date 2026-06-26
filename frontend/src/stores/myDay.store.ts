import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'
import { useTasksStore } from './tasks'
import { useWorkspaceStore, type Workspace } from './workspace.store'

interface CalendarWorkspaceEvent {
  id: string
  title: string
  start: string
  end: string
  provider?: 'GOOGLE' | 'MICROSOFT'
  workspaceId?: string | null
  workspaceName?: string | null
}

export interface MyDayTimelineItem {
  id: string
  type: 'TASK' | 'EVENT'
  title: string
  startTime: string
  endTime: string
  workspace: Workspace
}

const UNASSIGNED_WORKSPACE: Workspace = {
  id: 'workspace-unassigned',
  name: 'Sans espace',
  color: '#94A3B8',
  icon: 'pi pi-question-circle',
}

export const useMyDayStore = defineStore('my-day', () => {
  const authStore = useAuthStore()
  const tasksStore = useTasksStore()
  const workspaceStore = useWorkspaceStore()

  const events = ref<CalendarWorkspaceEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const workspaceMap = computed(() => new Map(workspaceStore.workspaces.map((workspace) => [workspace.id, workspace])))

  function getAuthHeaders() {
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  function isToday(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    return date.toDateString() === new Date().toDateString()
  }

  function resolveWorkspace(workspaceId?: string | null, workspaceName?: string | null): Workspace {
    if (workspaceId) {
      const knownWorkspace = workspaceMap.value.get(workspaceId)
      if (knownWorkspace) {
        return knownWorkspace
      }

      return {
        ...UNASSIGNED_WORKSPACE,
        id: workspaceId,
        name: workspaceName || 'Sans espace',
      }
    }

    return UNASSIGNED_WORKSPACE
  }

  const getTodayTimeline = computed<MyDayTimelineItem[]>(() => {
    const taskItems = tasksStore.savedTasks
      .filter((task) => typeof task.scheduledStartTime === 'string' && task.scheduledStartTime.length > 0)
      .filter((task) => isToday(task.scheduledStartTime as string))
      .map((task) => ({
        id: `task-${task.id}`,
        type: 'TASK' as const,
        title: task.title,
        startTime: task.scheduledStartTime as string,
        endTime: task.scheduledEndTime || (task.scheduledStartTime as string),
        workspace: resolveWorkspace(task.workspaceId, task.workspace?.name),
      }))

    const eventItems = events.value
      .filter((event) => isToday(event.start))
      .map((event) => ({
        id: `event-${event.id}-${event.start}`,
        type: 'EVENT' as const,
        title: event.title,
        startTime: event.start,
        endTime: event.end,
        workspace: resolveWorkspace(event.workspaceId, event.workspaceName),
      }))

    return [...taskItems, ...eventItems].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  })

  async function fetchTodayData() {
    if (!authStore.token) return

    loading.value = true
    error.value = null

    try {
      await Promise.all([tasksStore.fetchSavedTasks(), fetchTodayEvents()])
    } catch {
      error.value = 'Impossible de charger la vue My Day.'
    } finally {
      loading.value = false
    }
  }

  async function fetchTodayEvents() {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/calendar/today`, {
      headers: getAuthHeaders(),
    })
    events.value = Array.isArray(data) ? data : []
  }

  return {
    events,
    loading,
    error,
    getTodayTimeline,
    fetchTodayData,
  }
})
