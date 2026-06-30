import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { useTasksStore, type SavedTask } from '../../src/stores/tasks'

vi.mock('axios')

// Stub Pinia dependency stores
vi.mock('../../src/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token' }),
}))

vi.mock('../../src/stores/workspace.store', () => ({
  useWorkspaceStore: () => ({ creationWorkspaceId: null }),
}))

function makeTask(overrides: Partial<SavedTask> = {}): SavedTask {
  return {
    id: 'task-1',
    title: 'Test task',
    status: 'TODO',
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('useTasksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('setSuggestedTasks', () => {
    it('populates suggestedTasks with generated IDs', () => {
      const store = useTasksStore()
      store.setSuggestedTasks([
        { title: 'Task A', description: 'Desc A', source: 'email' },
        { title: 'Task B', description: 'Desc B', source: 'calendar' },
      ])

      expect(store.suggestedTasks).toHaveLength(2)
      expect(store.suggestedTasks[0].id).toMatch(/^suggested-0-/)
      expect(store.suggestedTasks[1].id).toMatch(/^suggested-1-/)
      expect(store.suggestedTasks[0].title).toBe('Task A')
    })
  })

  describe('removeSuggestedTask', () => {
    it('removes a suggested task by id', () => {
      const store = useTasksStore()
      store.setSuggestedTasks([{ title: 'Task A', description: '', source: 'email' }])
      const id = store.suggestedTasks[0].id

      store.removeSuggestedTask(id)

      expect(store.suggestedTasks).toHaveLength(0)
    })
  })

  describe('fetchSavedTasks', () => {
    it('stores the tasks returned by the API', async () => {
      const tasks = [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2' })]
      vi.spyOn(axios, 'get').mockResolvedValue({ data: tasks })

      const store = useTasksStore()
      await store.fetchSavedTasks()

      expect(store.savedTasks).toEqual(tasks)
      expect(store.loading).toBe(false)
    })

    it('stores an empty array when API returns a non-array', async () => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: null })

      const store = useTasksStore()
      await store.fetchSavedTasks()

      expect(store.savedTasks).toEqual([])
    })
  })

  describe('updateTaskStatus', () => {
    it('optimistically updates status and confirms on success', async () => {
      vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      const store = useTasksStore()
      store.savedTasks = [makeTask({ id: 'task-1', status: 'TODO' })]

      await store.updateTaskStatus('task-1', 'DONE')

      expect(store.savedTasks[0].status).toBe('DONE')
    })

    it('rolls back status when the API call fails', async () => {
      vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Network error'))

      const store = useTasksStore()
      store.savedTasks = [makeTask({ id: 'task-1', status: 'TODO' })]

      await store.updateTaskStatus('task-1', 'DONE')

      expect(store.savedTasks[0].status).toBe('TODO')
    })

    it('does nothing when the task is not found', async () => {
      const patchSpy = vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} })

      const store = useTasksStore()
      store.savedTasks = [makeTask({ id: 'task-1', status: 'TODO' })]

      await store.updateTaskStatus('non-existent', 'DONE')

      expect(patchSpy).not.toHaveBeenCalled()
    })
  })

  describe('deleteTask', () => {
    it('removes the task from savedTasks after deletion', async () => {
      vi.spyOn(axios, 'delete').mockResolvedValue({ data: {} })

      const store = useTasksStore()
      store.savedTasks = [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2' })]

      await store.deleteTask('task-1')

      expect(store.savedTasks).toHaveLength(1)
      expect(store.savedTasks[0].id).toBe('task-2')
    })
  })

  describe('bulkUpdateTasks', () => {
    it('updates the status of all specified tasks locally on success', async () => {
      vi.spyOn(axios, 'post').mockResolvedValue({ data: { count: 2 } })

      const store = useTasksStore()
      store.savedTasks = [
        makeTask({ id: 'task-1', status: 'TODO' }),
        makeTask({ id: 'task-2', status: 'IN_PROGRESS' }),
        makeTask({ id: 'task-3', status: 'TODO' }),
      ]

      await store.bulkUpdateTasks(['task-1', 'task-2'], 'DONE')

      expect(store.savedTasks[0].status).toBe('DONE')
      expect(store.savedTasks[1].status).toBe('DONE')
      expect(store.savedTasks[2].status).toBe('TODO')
      expect(store.loading).toBe(false)
    })

    it('sends a POST request to /tasks/bulk-update with the correct payload', async () => {
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { count: 1 } })

      const store = useTasksStore()
      store.savedTasks = [makeTask({ id: 'task-1', status: 'TODO' })]

      await store.bulkUpdateTasks(['task-1'], 'IN_PROGRESS')

      expect(postSpy).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/bulk-update'),
        { taskIds: ['task-1'], status: 'IN_PROGRESS' },
        expect.objectContaining({ headers: expect.any(Object) }),
      )
    })

    it('resets loading to false even if the API call throws', async () => {
      vi.spyOn(axios, 'post').mockRejectedValue(new Error('Server error'))

      const store = useTasksStore()
      store.savedTasks = [makeTask({ id: 'task-1', status: 'TODO' })]

      await expect(store.bulkUpdateTasks(['task-1'], 'DONE')).rejects.toThrow()
      expect(store.loading).toBe(false)
    })
  })

  describe('acceptTask', () => {
    it('adds the accepted task to savedTasks and removes it from suggestedTasks', async () => {
      const savedTask = makeTask({ id: 'saved-1', title: 'From email' })
      vi.spyOn(axios, 'post').mockResolvedValue({ data: savedTask })

      const store = useTasksStore()
      store.setSuggestedTasks([{ title: 'From email', description: '', source: 'email' }])
      const suggested = store.suggestedTasks[0]

      await store.acceptTask(suggested)

      expect(store.savedTasks[0]).toEqual(savedTask)
      expect(store.suggestedTasks).toHaveLength(0)
    })
  })
})
