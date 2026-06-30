<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-2xl rounded-3xl border border-indigo-100 bg-white shadow-2xl flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600">
          <i class="pi pi-file-edit text-lg text-white"></i>
        </div>
        <div class="flex-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-emerald-600">IA</p>
          <h2 class="text-xl font-bold text-gray-900">Générateur de contenu</h2>
        </div>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 transition-colors"
          @click="$emit('close')"
        >
          <i class="pi pi-times text-lg"></i>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-5">
        <!-- Input area -->
        <div v-if="!result">
          <label class="block text-sm font-semibold text-gray-700 mb-2">
            Notes de réunion
          </label>
          <textarea
            v-model="notes"
            :disabled="loading"
            :maxlength="MAX_CHARS"
            rows="8"
            placeholder="Collez ici vos notes de réunion brutes..."
            class="w-full border border-gray-300 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent resize-none disabled:opacity-60 disabled:bg-gray-50"
          ></textarea>
          <div class="flex items-center justify-between mt-1">
            <p class="text-xs text-red-600" v-if="notes.length >= MAX_CHARS">
              Limite de {{ MAX_CHARS }} caractères atteinte.
            </p>
            <p v-else class="text-xs text-gray-400"></p>
            <p class="text-xs text-gray-400">{{ notes.length }} / {{ MAX_CHARS }}</p>
          </div>

          <!-- Error -->
          <div
            v-if="error"
            class="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <i class="pi pi-exclamation-circle mt-0.5 flex-shrink-0"></i>
            <span>{{ error }} Essayez de reformuler vos notes.</span>
          </div>

          <!-- Generate button -->
          <button
            type="button"
            :disabled="loading || notes.trim().length === 0"
            class="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            @click="generate"
          >
            <i class="pi pi-spin pi-spinner" v-if="loading"></i>
            <i class="pi pi-sparkles" v-else></i>
            {{ loading ? 'Génération en cours...' : 'Générer le contenu' }}
          </button>
        </div>

        <!-- Skeleton loading -->
        <div v-if="loading && !result" class="space-y-3 animate-pulse">
          <div class="h-4 bg-gray-200 rounded-full w-1/3"></div>
          <div class="h-3 bg-gray-200 rounded-full w-full"></div>
          <div class="h-3 bg-gray-200 rounded-full w-5/6"></div>
          <div class="h-3 bg-gray-200 rounded-full w-4/6"></div>
        </div>

        <!-- Results -->
        <div v-if="result">
          <!-- Tabs -->
          <div class="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              :class="activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'"
              @click="activeTab = tab.key"
            >
              <i :class="tab.icon"></i>
              {{ tab.label }}
            </button>
          </div>

          <!-- LinkedIn Tab -->
          <div v-if="activeTab === 'linkedin'" class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-800">Post LinkedIn</h3>
              <button
                type="button"
                class="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                @click="copyToClipboard(result.linkedin, 'linkedin')"
              >
                <i :class="copied === 'linkedin' ? 'pi pi-check' : 'pi pi-copy'"></i>
                {{ copied === 'linkedin' ? 'Copié !' : 'Copier' }}
              </button>
            </div>
            <div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {{ result.linkedin || 'Aucun contenu généré.' }}
            </div>
          </div>

          <!-- Email Tab -->
          <div v-if="activeTab === 'email'" class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-800">E-mail de suivi</h3>
              <button
                type="button"
                class="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                @click="copyToClipboard(result.email, 'email')"
              >
                <i :class="copied === 'email' ? 'pi pi-check' : 'pi pi-copy'"></i>
                {{ copied === 'email' ? 'Copié !' : 'Copier' }}
              </button>
            </div>
            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-mono">
              {{ result.email || 'Aucun contenu généré.' }}
            </div>
          </div>

          <!-- Tasks Tab -->
          <div v-if="activeTab === 'tasks'" class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-800">
                Tâches extraites
                <span class="ml-1.5 text-xs bg-gray-200 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
                  {{ result.tasks.length }}
                </span>
              </h3>
              <button
                v-if="result.tasks.length > 0"
                type="button"
                :disabled="tasksStore.loading || addedToWorkspace"
                class="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                @click="addToWorkspace"
              >
                <i class="pi pi-spin pi-spinner" v-if="tasksStore.loading"></i>
                <i class="pi pi-check" v-else-if="addedToWorkspace"></i>
                <i class="pi pi-plus" v-else></i>
                {{ addedToWorkspace ? 'Ajouté !' : 'Ajouter à l\'espace de travail' }}
              </button>
            </div>

            <div v-if="result.tasks.length === 0" class="text-sm text-gray-500 text-center py-6">
              Aucune tâche identifiée dans les notes.
            </div>

            <ul v-else class="space-y-2">
              <li
                v-for="(task, index) in result.tasks"
                :key="index"
                class="flex items-start gap-3 border border-gray-100 rounded-xl px-4 py-3 bg-white"
              >
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0 mt-0.5">{{ index + 1 }}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900">{{ task.title }}</p>
                  <p v-if="task.dueDate" class="text-xs text-gray-400 mt-0.5">
                    <i class="pi pi-calendar mr-1"></i>Échéance : {{ task.dueDate }}
                  </p>
                </div>
                <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">{{ task.status }}</span>
              </li>
            </ul>
          </div>

          <!-- Reset -->
          <button
            type="button"
            class="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
            @click="reset"
          >
            <i class="pi pi-refresh mr-1"></i>Analyser de nouvelles notes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { useTasksStore } from '../stores/tasks'

const MAX_CHARS = 5000

interface TaskItem {
  title: string
  dueDate: string | null
  status: string
}

interface GeneratedResult {
  linkedin: string
  email: string
  tasks: TaskItem[]
}

defineProps<{ visible: boolean }>()
defineEmits<{ close: [] }>()

const authStore = useAuthStore()
const tasksStore = useTasksStore()

const notes = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<GeneratedResult | null>(null)
const activeTab = ref<'linkedin' | 'email' | 'tasks'>('linkedin')
const copied = ref<'linkedin' | 'email' | null>(null)
const addedToWorkspace = ref(false)

const tabs = [
  { key: 'linkedin' as const, label: 'LinkedIn', icon: 'pi pi-linkedin' },
  { key: 'email' as const, label: 'E-mail', icon: 'pi pi-envelope' },
  { key: 'tasks' as const, label: 'Tâches', icon: 'pi pi-check-square' },
]

async function generate() {
  if (!notes.value.trim() || !authStore.token) return
  loading.value = true
  error.value = null

  try {
    const { data } = await axios.post<GeneratedResult>(
      `${import.meta.env.VITE_API_URL}/ai/generate-content`,
      { notes: notes.value.trim() },
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
    result.value = data
    activeTab.value = 'linkedin'
    addedToWorkspace.value = false
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
      error.value = err.response.data.message
    } else {
      error.value = 'Une erreur est survenue lors de la génération.'
    }
  } finally {
    loading.value = false
  }
}

async function addToWorkspace() {
  if (!result.value || result.value.tasks.length === 0) return
  try {
    await tasksStore.bulkCreate(result.value.tasks)
    addedToWorkspace.value = true
  } catch {
    // error handled by tasksStore
  }
}

async function copyToClipboard(text: string, type: 'linkedin' | 'email') {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = type
    setTimeout(() => {
      copied.value = null
    }, 2000)
  } catch {
    // clipboard not available
  }
}

function reset() {
  result.value = null
  notes.value = ''
  error.value = null
  addedToWorkspace.value = false
}
</script>
