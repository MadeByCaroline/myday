<template>
  <div class="space-y-4">
    <!-- Suggested Tasks -->
    <div class="bg-white rounded-2xl border border-gray-200 p-5">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
          <i class="pi pi-lightbulb text-amber-600"></i>
        </div>
        <h3 class="text-base font-semibold text-gray-900">Tâches suggérées</h3>
        <span
          v-if="tasksStore.suggestedTasks.length > 0"
          class="ml-auto bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full"
        >
          {{ tasksStore.suggestedTasks.length }}
        </span>
      </div>

      <div v-if="tasksStore.suggestedTasks.length === 0" class="text-center py-6 text-gray-400 text-sm">
        <i class="pi pi-check-circle text-2xl mb-2 block text-green-400"></i>
        Aucune suggestion en attente
      </div>

      <TransitionGroup name="task-list" tag="div" class="space-y-3">
        <div
          v-for="task in tasksStore.suggestedTasks"
          :key="task.id"
          class="border border-gray-200 rounded-xl p-3"
        >
          <span class="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 capitalize inline-block mb-2">
            {{ formatSourceLabel(task.source) }}
          </span>
          <p class="text-sm font-medium text-gray-900 mb-1">{{ task.title }}</p>
          <p v-if="task.description" class="text-xs text-gray-500 mb-3">{{ task.description }}</p>
          <div class="flex gap-2">
            <button
              @click="handleAccept(task)"
              :disabled="tasksStore.loading"
              class="flex-1 bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              <i class="pi pi-check mr-1"></i>Accepter
            </button>
            <button
              @click="handleRefuse(task.id)"
              class="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <i class="pi pi-times mr-1"></i>Refuser
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Accepted Tasks -->
    <div v-if="tasksStore.savedTasks.length > 0" class="bg-white rounded-2xl border border-gray-200 p-5">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
          <i class="pi pi-check-circle text-green-600"></i>
        </div>
        <h3 class="text-base font-semibold text-gray-900">Tâches acceptées</h3>
      </div>
      <div class="space-y-2">
        <div
          v-for="task in tasksStore.savedTasks"
          :key="task.id"
          class="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-xl"
        >
          <i class="pi pi-check-circle text-green-500 mt-0.5 flex-shrink-0"></i>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900">{{ task.title }}</p>
            <p v-if="task.description" class="text-xs text-gray-500 truncate">{{ task.description }}</p>
          </div>
          <button
            @click="tasksStore.deleteTask(task.id)"
            class="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <i class="pi pi-trash text-xs"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTasksStore } from '../stores/tasks'
import type { SuggestedTask } from '../stores/tasks'

const tasksStore = useTasksStore()

async function handleAccept(task: SuggestedTask) {
  await tasksStore.acceptTask(task)
}

function handleRefuse(id: string) {
  tasksStore.removeSuggestedTask(id)
}

function formatSourceLabel(source: string) {
  switch (source?.toLowerCase()) {
    case 'calendar':
      return 'Calendrier'
    case 'email':
      return 'E-mail'
    default:
      return source
  }
}
</script>

<style scoped>
.task-list-enter-active,
.task-list-leave-active {
  transition: all 0.3s ease;
}
.task-list-enter-from,
.task-list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
