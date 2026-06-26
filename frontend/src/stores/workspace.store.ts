import axios from 'axios'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

export const ALL_WORKSPACES_ID = 'ALL'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'active_workspace_id'

export interface Workspace {
  id: string
  name: string
  color: string
  icon: string
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const authStore = useAuthStore()
  const workspaces = ref<Workspace[]>([])
  const activeWorkspaceId = ref<string>(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || ALL_WORKSPACES_ID)
  const loading = ref(false)

  const activeWorkspace = computed(() =>
    workspaces.value.find((workspace) => workspace.id === activeWorkspaceId.value) || null,
  )
  const creationWorkspaceId = computed(() =>
    activeWorkspaceId.value !== ALL_WORKSPACES_ID ? activeWorkspaceId.value : (workspaces.value[0]?.id ?? null),
  )

  function getAuthHeaders() {
    return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
  }

  function setActiveWorkspaceId(workspaceId: string) {
    activeWorkspaceId.value = workspaceId
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)
  }

  async function fetchWorkspaces() {
    if (!authStore.token) {
      reset()
      return
    }

    loading.value = true

    try {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/workspaces`, {
        headers: getAuthHeaders(),
      })

      workspaces.value = Array.isArray(data) ? data : []
      if (
        activeWorkspaceId.value !== ALL_WORKSPACES_ID
        && !workspaces.value.some((workspace) => workspace.id === activeWorkspaceId.value)
      ) {
        setActiveWorkspaceId(ALL_WORKSPACES_ID)
      }
    } finally {
      loading.value = false
    }
  }

  function reset() {
    workspaces.value = []
    activeWorkspaceId.value = ALL_WORKSPACES_ID
    localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
  }

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    creationWorkspaceId,
    loading,
    setActiveWorkspaceId,
    fetchWorkspaces,
    reset,
  }
})
