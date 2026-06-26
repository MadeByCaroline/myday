<template>
  <div class="min-h-screen bg-gray-50 flex">
    <!-- Sidebar -->
    <aside class="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div class="p-6 border-b border-gray-200">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <i class="pi pi-calendar text-white"></i>
          </div>
          <span class="text-xl font-bold text-gray-900">MyDay</span>
        </div>
      </div>

      <nav class="p-4 flex-1">
        <RouterLink to="/dashboard" :class="navLinkClass">
          <i class="pi pi-home"></i>
          <span>Dashboard</span>
        </RouterLink>
        <RouterLink to="/tasks" :class="navLinkClass">
          <i class="pi pi-check-square"></i>
          <span>Tasks</span>
        </RouterLink>
        <RouterLink to="/calendar" :class="navLinkClass">
          <i class="pi pi-calendar"></i>
          <span>Calendar</span>
        </RouterLink>
        <RouterLink to="/integrations" :class="navLinkClass">
          <i class="pi pi-plug"></i>
          <span>Integrations</span>
        </RouterLink>
      </nav>

      <div class="p-4 border-t border-gray-200">
        <div class="flex items-center gap-3">
          <img
            v-if="authStore.user?.picture"
            :src="authStore.user.picture"
            :alt="authStore.user.name ?? ''"
            class="w-8 h-8 rounded-full"
          />
          <div v-else class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <i class="pi pi-user text-indigo-600 text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ authStore.user?.name || authStore.user?.email }}</p>
            <p class="text-xs text-gray-500 truncate">{{ authStore.user?.email }}</p>
          </div>
          <button @click="handleLogout" class="text-gray-400 hover:text-gray-600">
            <i class="pi pi-sign-out text-sm"></i>
          </button>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <header class="bg-white border-b border-gray-200 px-8 py-4">
        <h2 class="text-2xl font-bold text-gray-900">Tasks</h2>
        <p class="text-sm text-gray-500 mt-1">Manage your tasks</p>
      </header>

      <div class="flex-1 overflow-y-auto p-8">
        <!-- Add task form -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">Add a new task</h3>
          <form @submit.prevent="handleAddTask" class="flex gap-3">
            <input
              v-model="newTaskTitle"
              type="text"
              placeholder="What do you need to do?"
              class="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
            <button
              type="submit"
              :disabled="!newTaskTitle.trim() || tasksStore.loading"
              class="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <i class="pi pi-plus"></i>
              Add Task
            </button>
          </form>
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {{ errorMessage }}
        </div>

        <!-- Loading state -->
        <div v-if="tasksStore.loading && tasksStore.savedTasks.length === 0" class="flex items-center justify-center py-12">
          <i class="pi pi-spin pi-spinner text-indigo-600 text-2xl"></i>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="!tasksStore.loading && tasksStore.savedTasks.length === 0"
          class="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center"
        >
          <i class="pi pi-check-square text-4xl text-gray-300 mb-4 block"></i>
          <p class="text-gray-500 font-medium">No tasks yet</p>
          <p class="text-gray-400 text-sm mt-1">Add a task above to get started</p>
        </div>

        <!-- Task list -->
        <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          <div
            v-for="task in tasksStore.savedTasks"
            :key="task.id"
            class="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <!-- Completion checkbox -->
            <input
              type="checkbox"
              :checked="task.isCompleted"
              @change="tasksStore.toggleTask(task.id)"
              class="w-4 h-4 text-indigo-600 border-gray-300 rounded cursor-pointer accent-indigo-600"
            />

            <!-- Task details -->
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium text-gray-900 truncate"
                :class="{ 'line-through text-gray-400': task.isCompleted }"
              >
                {{ task.title }}
              </p>
              <p v-if="task.description" class="text-xs text-gray-500 mt-0.5 truncate">
                {{ task.description }}
              </p>
            </div>

            <!-- Source badge -->
            <span class="hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full font-medium"
              :class="task.source === 'MANUAL' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-600'"
            >
              {{ task.source === 'MANUAL' ? 'Manual' : 'AI' }}
            </span>

            <!-- Delete button -->
            <button
              @click="handleDeleteTask(task.id)"
              class="text-gray-300 hover:text-red-500 transition-colors p-1"
              title="Delete task"
            >
              <i class="pi pi-trash text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTasksStore } from '../stores/tasks'

const authStore = useAuthStore()
const tasksStore = useTasksStore()
const router = useRouter()

const newTaskTitle = ref('')
const errorMessage = ref<string | null>(null)

const navLinkClass =
  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors mb-1'

async function handleAddTask() {
  const title = newTaskTitle.value.trim()
  if (!title) return

  errorMessage.value = null

  try {
    await tasksStore.createManualTask(title)
    newTaskTitle.value = ''
  } catch {
    errorMessage.value = 'Failed to add task. Please try again.'
  }
}

async function handleDeleteTask(id: string) {
  errorMessage.value = null

  try {
    await tasksStore.deleteTask(id)
  } catch {
    errorMessage.value = 'Failed to delete task. Please try again.'
  }
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

onMounted(async () => {
  try {
    await tasksStore.fetchSavedTasks()
  } catch {
    errorMessage.value = 'Failed to load tasks.'
  }
})
</script>
