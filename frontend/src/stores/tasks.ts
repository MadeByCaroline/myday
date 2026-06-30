import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from './auth'
import { useWorkspaceStore } from './workspace.store'

export interface SuggestedTask {
  id: string
  title: string
  description: string
  source: string
}

export interface TaskWorkspace {
  id: string
  name: string
  color: string
  icon: string
}

export interface SavedTask {
  id: string
  title: string
  description?: string | null
  status: string
  source: string
  createdAt: string
  scheduledStartTime?: string | null
  scheduledEndTime?: string | null
  workspaceId?: string | null
  workspace?: TaskWorkspace | null
}

export interface TimeBlock {
  taskId: string
  suggestedStartTime: string
  suggestedEndTime: string
  title: string
}

export const useTasksStore = defineStore('tasks', () => {
  const suggestedTasks = ref<SuggestedTask[]>([])
  const savedTasks = ref<SavedTask[]>([])
  const loading = ref(false)

  function setSuggestedTasks(tasks: Array<{ title: string; description: string; source: string }>) {
    const timestamp = Date.now()
    suggestedTasks.value = tasks.map((task, index) => ({
      ...task,
      id: `suggested-${index}-${timestamp}`,
    }))
  }

  function removeSuggestedTask(id: string) {
    suggestedTasks.value = suggestedTasks.value.filter((task) => task.id !== id)
  }

  function getAuthHeaders() {
    const authStore = useAuthStore()
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  function getTaskCreationWorkspaceId() {
    const workspaceStore = useWorkspaceStore()
    return workspaceStore.creationWorkspaceId || undefined
  }

  async function acceptTask(task: SuggestedTask) {
    loading.value = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/tasks`,
        {
          title: task.title,
          description: task.description,
          source: task.source,
          workspaceId: getTaskCreationWorkspaceId(),
        },
        {
          headers: getAuthHeaders(),
        },
      )

      savedTasks.value.unshift(data)
      removeSuggestedTask(task.id)
    } finally {
      loading.value = false
    }
  }

  async function createManualTask(title: string, description?: string) {
    loading.value = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/tasks`,
        {
          title,
          description,
          source: 'MANUAL',
          workspaceId: getTaskCreationWorkspaceId(),
        },
        { headers: getAuthHeaders() },
      )

      savedTasks.value.unshift(data)
    } finally {
      loading.value = false
    }
  }

  async function fetchSavedTasks() {
    loading.value = true

    try {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/tasks`, {
        headers: getAuthHeaders(),
      })

      savedTasks.value = Array.isArray(data) ? data : []
    } finally {
      loading.value = false
    }
  }

  async function updateTaskStatus(id: string, status: string) {
    const task = savedTasks.value.find((t) => t.id === id)
    if (!task) return

    const oldStatus = task.status
    task.status = status

    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/tasks/${id}`,
        { status },
        { headers: getAuthHeaders() },
      )
    } catch {
      task.status = oldStatus
    }
  }

  async function optimizeDay(): Promise<TimeBlock[]> {
    loading.value = true

    try {
      const currentTasks = savedTasks.value || []
      const payload = currentTasks.length > 0 ? { tasks: currentTasks } : {}

      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/schedule/optimize`,
        payload,
        { headers: getAuthHeaders() },
      )

      const blocks = Array.isArray(data)
        ? data.filter(
            (block): block is TimeBlock =>
              !!block
              && typeof block.taskId === 'string'
              && typeof block.title === 'string'
              && typeof block.suggestedStartTime === 'string'
              && typeof block.suggestedEndTime === 'string',
          )
        : []

      if (blocks.length > 0) {
        const scheduledBlocks = new Map(blocks.map((block) => [block.taskId, block]))
        savedTasks.value = (savedTasks.value || []).map((task) =>
          scheduledBlocks.has(task.id)
            ? {
                ...task,
                status: 'SCHEDULED',
                scheduledStartTime: scheduledBlocks.get(task.id)?.suggestedStartTime,
                scheduledEndTime: scheduledBlocks.get(task.id)?.suggestedEndTime,
              }
            : task,
        )
      }

      return blocks
    } finally {
      loading.value = false
    }
  }

  async function deleteTask(id: string) {
    await axios.delete(`${import.meta.env.VITE_API_URL}/tasks/${id}`, {
      headers: getAuthHeaders(),
    })

    savedTasks.value = savedTasks.value.filter((task) => task.id !== id)
  }

  async function bulkUpdateTasks(taskIds: string[], status: string) {
    loading.value = true

    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/tasks/bulk-update`,
        { taskIds, status },
        { headers: getAuthHeaders() },
      )

      const taskIdSet = new Set(taskIds)
      savedTasks.value = savedTasks.value.map((task) =>
        taskIdSet.has(task.id) ? { ...task, status } : task,
      )
    } finally {
      loading.value = false
    }
  }

  return {
    suggestedTasks,
    savedTasks,
    loading,
    setSuggestedTasks,
    removeSuggestedTask,
    acceptTask,
    createManualTask,
    fetchSavedTasks,
    updateTaskStatus,
    deleteTask,
    optimizeDay,
    bulkUpdateTasks,
  }
})
