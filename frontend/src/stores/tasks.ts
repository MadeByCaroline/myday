import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from './auth'

export interface SuggestedTask {
  id: string
  title: string
  description: string
  source: string
}

export interface SavedTask {
  id: string
  title: string
  description?: string
  isCompleted: boolean
  status: string
  source: string
  createdAt: string
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

  async function acceptTask(task: SuggestedTask) {
    loading.value = true

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/tasks`,
        {
          title: task.title,
          description: task.description,
          source: task.source,
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
        { title, description, source: 'MANUAL' },
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

  async function toggleTask(id: string) {
    const task = savedTasks.value.find((t) => t.id === id)
    if (!task) return

    const newValue = !task.isCompleted
    task.isCompleted = newValue

    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/tasks/${id}`,
        { isCompleted: newValue },
        { headers: getAuthHeaders() },
      )
    } catch {
      task.isCompleted = !newValue
    }
  }

  async function deleteTask(id: string) {
    await axios.delete(`${import.meta.env.VITE_API_URL}/tasks/${id}`, {
      headers: getAuthHeaders(),
    })

    savedTasks.value = savedTasks.value.filter((task) => task.id !== id)
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
    toggleTask,
    deleteTask,
  }
})
