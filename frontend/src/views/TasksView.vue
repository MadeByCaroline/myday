<template>
  <main class="flex-1 flex flex-col overflow-hidden">
    <header class="bg-white border-b border-gray-200 px-8 py-4">
      <h2 class="text-2xl font-bold text-gray-900">Tâches</h2>
      <p class="text-sm text-gray-500 mt-1">Gérez vos tâches</p>
    </header>

    <div class="flex-1 overflow-x-auto p-6">
      <div v-if="errorMessage" class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
        {{ errorMessage }}
      </div>

      <div v-if="tasksStore.loading && tasksStore.savedTasks.length === 0" class="flex items-center justify-center py-12">
        <i class="pi pi-spin pi-spinner text-indigo-600 text-2xl"></i>
      </div>

      <div v-else class="flex gap-5 min-w-max h-full">
        <div class="w-80 flex flex-col bg-gray-100 rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-3 h-3 rounded-full bg-gray-400 inline-block"></span>
            <h3 class="text-sm font-semibold text-gray-700 flex-1">À faire</h3>
            <span class="text-xs bg-gray-200 text-gray-600 font-semibold px-2 py-0.5 rounded-full">{{ todoTasks.length }}</span>
          </div>

          <form @submit.prevent="handleAddTask" class="flex gap-2 mb-3">
            <input
              v-model="newTaskTitle"
              type="text"
              placeholder="Nouvelle tâche..."
              class="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
            />
            <button
              type="submit"
              :disabled="!newTaskTitle.trim() || tasksStore.loading"
              class="bg-indigo-600 text-white px-3 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Ajouter"
            >
              <i class="pi pi-plus text-sm"></i>
            </button>
          </form>

          <draggable
            :list="todoTasks"
            group="tasks"
            item-key="id"
            class="flex-1 space-y-2 min-h-16"
            @change="onColumnChange($event, 'TODO')"
          >
            <template #item="{ element }">
              <div
                class="bg-white rounded-xl p-3 shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing"
                :style="taskCardStyle(element)"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-gray-900 flex-1">{{ element.title }}</p>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      @click="handleStartTimer(element.id)"
                      :disabled="isStartDisabled(element.id)"
                      :class="startButtonClass(element.id)"
                      :title="timerStore.isTaskActive(element.id) ? 'Chrono en cours' : 'Démarrer le suivi du temps'"
                    >
                      <i class="pi pi-play text-xs"></i>
                    </button>
                    <button
                      @click="handleStartDeepWork(element)"
                      :disabled="isDeepWorkDisabled(element.id)"
                      :class="deepWorkButtonClass(element.id)"
                      :title="uiStore.deepWorkTask?.id === element.id ? 'Session de concentration active' : 'Lancer le mode concentration'"
                    >
                      <i class="pi pi-bolt text-xs"></i>
                    </button>
                    <button
                      @click="handleDeleteTask(element.id)"
                      class="text-gray-300 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <i class="pi pi-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                <p v-if="element.description" class="text-xs text-gray-500 mt-1">{{ element.description }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    class="inline-flex text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="element.source === 'MANUAL' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-600'"
                  >
                    {{ element.source === 'MANUAL' ? 'Manuel' : 'IA' }}
                  </span>
                  <span
                    v-if="isAllWorkspaces"
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                    :style="workspaceBadgeStyle(element)"
                  >
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: workspaceMeta(element).color }"></span>
                    <i :class="[workspaceMeta(element).icon, 'text-[10px]']"></i>
                    {{ workspaceMeta(element).name }}
                  </span>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <div class="w-80 flex flex-col bg-blue-50 rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-3 h-3 rounded-full bg-blue-400 inline-block"></span>
            <h3 class="text-sm font-semibold text-gray-700 flex-1">En cours</h3>
            <span class="text-xs bg-blue-100 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{{ inProgressTasks.length }}</span>
          </div>

          <draggable
            :list="inProgressTasks"
            group="tasks"
            item-key="id"
            class="flex-1 space-y-2 min-h-16"
            @change="onColumnChange($event, 'IN_PROGRESS')"
          >
            <template #item="{ element }">
              <div
                class="bg-white rounded-xl p-3 shadow-sm border border-blue-100 cursor-grab active:cursor-grabbing"
                :style="taskCardStyle(element)"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-gray-900 flex-1">{{ element.title }}</p>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      @click="handleStartTimer(element.id)"
                      :disabled="isStartDisabled(element.id)"
                      :class="startButtonClass(element.id)"
                      :title="timerStore.isTaskActive(element.id) ? 'Chrono en cours' : 'Démarrer le suivi du temps'"
                    >
                      <i class="pi pi-play text-xs"></i>
                    </button>
                    <button
                      @click="handleStartDeepWork(element)"
                      :disabled="isDeepWorkDisabled(element.id)"
                      :class="deepWorkButtonClass(element.id)"
                      :title="uiStore.deepWorkTask?.id === element.id ? 'Session de concentration active' : 'Lancer le mode concentration'"
                    >
                      <i class="pi pi-bolt text-xs"></i>
                    </button>
                    <button
                      @click="handleDeleteTask(element.id)"
                      class="text-gray-300 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <i class="pi pi-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                <p v-if="element.description" class="text-xs text-gray-500 mt-1">{{ element.description }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    class="inline-flex text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="element.source === 'MANUAL' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-600'"
                  >
                    {{ element.source === 'MANUAL' ? 'Manuel' : 'IA' }}
                  </span>
                  <span
                    v-if="isAllWorkspaces"
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                    :style="workspaceBadgeStyle(element)"
                  >
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: workspaceMeta(element).color }"></span>
                    <i :class="[workspaceMeta(element).icon, 'text-[10px]']"></i>
                    {{ workspaceMeta(element).name }}
                  </span>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <div class="w-80 flex flex-col bg-violet-50 rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-3 h-3 rounded-full bg-violet-400 inline-block"></span>
            <h3 class="text-sm font-semibold text-gray-700 flex-1">Planifié ✨</h3>
            <span class="text-xs bg-violet-100 text-violet-600 font-semibold px-2 py-0.5 rounded-full">{{ scheduledTasks.length }}</span>
          </div>

          <draggable
            :list="scheduledTasks"
            group="tasks"
            item-key="id"
            class="flex-1 space-y-2 min-h-16"
            @change="onColumnChange($event, 'SCHEDULED')"
          >
            <template #item="{ element }">
              <div
                class="bg-white rounded-xl p-3 shadow-sm border border-violet-100 cursor-grab active:cursor-grabbing"
                :style="taskCardStyle(element)"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-gray-900 flex-1">{{ element.title }}</p>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      @click="handleStartTimer(element.id)"
                      :disabled="isStartDisabled(element.id)"
                      :class="startButtonClass(element.id)"
                      :title="timerStore.isTaskActive(element.id) ? 'Chrono en cours' : 'Démarrer le suivi du temps'"
                    >
                      <i class="pi pi-play text-xs"></i>
                    </button>
                    <button
                      @click="handleStartDeepWork(element)"
                      :disabled="isDeepWorkDisabled(element.id)"
                      :class="deepWorkButtonClass(element.id)"
                      :title="uiStore.deepWorkTask?.id === element.id ? 'Session de concentration active' : 'Lancer le mode concentration'"
                    >
                      <i class="pi pi-bolt text-xs"></i>
                    </button>
                    <button
                      @click="handleDeleteTask(element.id)"
                      class="text-gray-300 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <i class="pi pi-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                <p v-if="element.description" class="text-xs text-gray-500 mt-1">{{ element.description }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span class="inline-flex text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-600">
                    IA planifiée
                  </span>
                  <span
                    v-if="isAllWorkspaces"
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                    :style="workspaceBadgeStyle(element)"
                  >
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: workspaceMeta(element).color }"></span>
                    <i :class="[workspaceMeta(element).icon, 'text-[10px]']"></i>
                    {{ workspaceMeta(element).name }}
                  </span>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <div class="w-80 flex flex-col bg-green-50 rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-3 h-3 rounded-full bg-green-400 inline-block"></span>
            <h3 class="text-sm font-semibold text-gray-700 flex-1">Terminé</h3>
            <span class="text-xs bg-green-100 text-green-600 font-semibold px-2 py-0.5 rounded-full">{{ doneTasks.length }}</span>
          </div>

          <draggable
            :list="doneTasks"
            group="tasks"
            item-key="id"
            class="flex-1 space-y-2 min-h-16"
            @change="onColumnChange($event, 'DONE')"
          >
            <template #item="{ element }">
              <div
                class="bg-white rounded-xl p-3 shadow-sm border border-green-100 cursor-grab active:cursor-grabbing"
                :style="taskCardStyle(element)"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-gray-500 line-through flex-1">{{ element.title }}</p>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      @click="handleStartTimer(element.id)"
                      :disabled="isStartDisabled(element.id)"
                      :class="startButtonClass(element.id)"
                      :title="timerStore.isTaskActive(element.id) ? 'Chrono en cours' : 'Démarrer le suivi du temps'"
                    >
                      <i class="pi pi-play text-xs"></i>
                    </button>
                    <button
                      @click="handleStartDeepWork(element)"
                      :disabled="isDeepWorkDisabled(element.id)"
                      :class="deepWorkButtonClass(element.id)"
                      :title="uiStore.deepWorkTask?.id === element.id ? 'Session de concentration active' : 'Lancer le mode concentration'"
                    >
                      <i class="pi pi-bolt text-xs"></i>
                    </button>
                    <button
                      @click="handleDeleteTask(element.id)"
                      class="text-gray-300 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <i class="pi pi-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                <p v-if="element.description" class="text-xs text-gray-400 mt-1">{{ element.description }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    class="inline-flex text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="element.source === 'MANUAL' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-600'"
                  >
                    {{ element.source === 'MANUAL' ? 'Manuel' : 'IA' }}
                  </span>
                  <span
                    v-if="isAllWorkspaces"
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                    :style="workspaceBadgeStyle(element)"
                  >
                    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: workspaceMeta(element).color }"></span>
                    <i :class="[workspaceMeta(element).icon, 'text-[10px]']"></i>
                    {{ workspaceMeta(element).name }}
                  </span>
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import draggable from 'vuedraggable'
import { useTasksStore } from '../stores/tasks'
import { useTimerStore } from '../stores/timer.store'
import { ALL_WORKSPACES_ID, useWorkspaceStore, type Workspace } from '../stores/workspace.store'
import { useUiStore } from '../stores/ui.store'
import type { SavedTask } from '../stores/tasks'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'SCHEDULED'

const tasksStore = useTasksStore()
const timerStore = useTimerStore()
const workspaceStore = useWorkspaceStore()
const uiStore = useUiStore()

const newTaskTitle = ref('')
const errorMessage = ref<string | null>(null)

const isAllWorkspaces = computed(() => workspaceStore.activeWorkspaceId === ALL_WORKSPACES_ID)
const visibleTasks = computed<SavedTask[]>(() =>
  isAllWorkspaces.value
    ? tasksStore.savedTasks
    : tasksStore.savedTasks.filter((task) => task.workspaceId === workspaceStore.activeWorkspaceId),
)
const todoTasks = computed<SavedTask[]>(() => visibleTasks.value.filter((task) => task.status === 'TODO'))
const inProgressTasks = computed<SavedTask[]>(() => visibleTasks.value.filter((task) => task.status === 'IN_PROGRESS'))
const scheduledTasks = computed<SavedTask[]>(() => visibleTasks.value.filter((task) => task.status === 'SCHEDULED'))
const doneTasks = computed<SavedTask[]>(() => visibleTasks.value.filter((task) => task.status === 'DONE'))

function workspaceMeta(task: SavedTask): Workspace {
  return task.workspace || {
    id: task.workspaceId || 'unassigned',
    name: 'Sans espace',
    color: '#94A3B8',
    icon: 'pi pi-question-circle',
  }
}

function taskCardStyle(task: SavedTask) {
  if (!isAllWorkspaces.value) {
    return undefined
  }

  return {
    borderLeftWidth: '4px',
    borderLeftColor: workspaceMeta(task).color,
  }
}

function workspaceBadgeStyle(task: SavedTask) {
  const workspace = workspaceMeta(task)
  return {
    borderColor: workspace.color,
    color: workspace.color,
    backgroundColor: workspaceBackgroundColor(workspace.color),
  }
}

function workspaceBackgroundColor(color: string) {
  const hex = color.trim()
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return `${hex}1A`
  }

  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    const [r, g, b] = hex.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}1A`
  }

  return color
}

function onColumnChange(
  event: { added?: { element: SavedTask; newIndex: number }; removed?: unknown; moved?: unknown },
  columnStatus: TaskStatus,
) {
  if (event.added) {
    tasksStore.updateTaskStatus(event.added.element.id, columnStatus)
  }
}

function isStartDisabled(taskId: string) {
  return !timerStore.canStartTask(taskId) || timerStore.loading
}

function startButtonClass(taskId: string) {
  return [
    'transition-colors',
    timerStore.isTaskActive(taskId)
      ? 'text-green-600'
      : 'text-gray-300 hover:text-indigo-600 disabled:text-gray-200',
  ]
}

function isDeepWorkDisabled(taskId: string) {
  return !timerStore.canStartTask(taskId) || timerStore.loading || uiStore.loading
}

function deepWorkButtonClass(taskId: string) {
  return [
    'transition-colors',
    uiStore.deepWorkTask?.id === taskId && uiStore.isDeepWorkModeActive
      ? 'text-violet-600'
      : 'text-gray-300 hover:text-violet-600 disabled:text-gray-200',
  ]
}

async function handleAddTask() {
  const title = newTaskTitle.value.trim()
  if (!title) return

  errorMessage.value = null

  try {
    await tasksStore.createManualTask(title)
    newTaskTitle.value = ''
  } catch {
    errorMessage.value = 'Impossible d\'ajouter la tâche. Veuillez réessayer.'
  }
}

async function handleDeleteTask(id: string) {
  errorMessage.value = null

  try {
    await tasksStore.deleteTask(id)
  } catch {
    errorMessage.value = 'Impossible de supprimer la tâche. Veuillez réessayer.'
  }
}

async function handleStartTimer(taskId: string) {
  errorMessage.value = null

  try {
    await timerStore.startTimer(taskId)
  } catch (caughtError: unknown) {
    if (axios.isAxiosError(caughtError)) {
      errorMessage.value = caughtError.response?.data?.message || 'Impossible de démarrer le chrono.'
      return
    }

    errorMessage.value = 'Impossible de démarrer le chrono.'
  }
}

async function handleStartDeepWork(task: SavedTask) {
  errorMessage.value = null

  try {
    if (!timerStore.isTaskActive(task.id)) {
      await timerStore.startTimer(task.id)
    }

    await uiStore.startDeepWork({
      id: task.id,
      title: task.title,
      description: task.description,
    })
  } catch (caughtError: unknown) {
    if (axios.isAxiosError(caughtError)) {
      errorMessage.value = caughtError.response?.data?.message || 'Impossible de lancer le mode concentration.'
      return
    }

    errorMessage.value = 'Impossible de lancer le mode concentration.'
  }
}

onMounted(async () => {
  try {
    await Promise.all([
      workspaceStore.fetchWorkspaces(),
      tasksStore.fetchSavedTasks(),
    ])
  } catch {
    errorMessage.value = 'Impossible de charger les tâches.'
  }
})
</script>
