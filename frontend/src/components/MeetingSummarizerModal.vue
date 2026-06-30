<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-3xl rounded-3xl border border-indigo-100 bg-white shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600">
          <i class="pi pi-comments text-lg text-white"></i>
        </div>
        <div class="flex-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-indigo-600">IA</p>
          <h2 class="text-xl font-bold text-gray-900">Meeting Summarizer</h2>
        </div>
        <button type="button" class="text-gray-400 hover:text-gray-600 transition-colors" @click="$emit('close')">
          <i class="pi pi-times text-lg"></i>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-2">Transcription brute</label>
          <textarea
            v-model="transcriptText"
            :maxlength="MAX_CHARS"
            :disabled="loading"
            rows="10"
            placeholder="Collez ici la transcription Zoom / Teams / Meet..."
            class="w-full border border-gray-300 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none disabled:opacity-60 disabled:bg-gray-50"
          ></textarea>
          <div class="mt-1 flex items-center justify-between text-xs">
            <p :class="transcriptText.length >= WARNING_CHARS ? 'text-amber-600' : 'text-gray-400'">
              {{
                transcriptText.length >= WARNING_CHARS
                  ? 'Attention : les longues transcriptions peuvent dégrader la qualité du résumé.'
                  : ''
              }}
            </p>
            <p class="text-gray-400">{{ transcriptText.length }} / {{ MAX_CHARS }}</p>
          </div>
        </div>

        <div
          v-if="error"
          class="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <i class="pi pi-exclamation-circle mt-0.5 flex-shrink-0"></i>
          <span>{{ error }}</span>
        </div>

        <button
          type="button"
          :disabled="loading || transcriptText.trim().length === 0"
          class="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          @click="summarizeMeeting"
        >
          <i class="pi pi-spin pi-spinner" v-if="loading"></i>
          <i class="pi pi-sparkles" v-else></i>
          {{ loading ? 'Analyse en cours...' : 'Résumer la réunion' }}
        </button>

        <div v-if="result" class="space-y-4">
          <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-gray-800">Decision Summary</h3>
              <button
                type="button"
                class="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                @click="copySummary"
              >
                <i :class="summaryCopied ? 'pi pi-check' : 'pi pi-copy'"></i>
                {{ summaryCopied ? 'Copié !' : 'Copier' }}
              </button>
            </div>
            <p class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {{ result.decisionSummary || 'Aucun résumé de décision disponible.' }}
            </p>
          </div>

          <div class="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-gray-800">
                Action Items
                <span class="ml-1.5 text-xs bg-gray-200 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
                  {{ result.actionItems.length }}
                </span>
              </h3>
              <button
                type="button"
                :disabled="tasksStore.loading || selectedActionItems.length === 0"
                class="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                @click="syncTasksToWorkspace"
              >
                <i class="pi pi-spin pi-spinner" v-if="tasksStore.loading"></i>
                <i class="pi pi-cloud-upload" v-else></i>
                Sync Tasks to Workspace
              </button>
            </div>

            <p v-if="result.actionItems.length === 0" class="text-sm text-gray-500 text-center py-4">
              Aucune action détectée.
            </p>

            <ul v-else class="space-y-2">
              <li
                v-for="(item, index) in result.actionItems"
                :key="`${item.title}-${index}`"
                class="flex items-start gap-3 border border-gray-100 rounded-xl px-4 py-3 bg-white"
              >
                <input
                  :id="`action-item-${index}`"
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  :checked="selectedIndexes.has(index)"
                  @change="toggleSelection(index)"
                />
                <div class="min-w-0 flex-1">
                  <label :for="`action-item-${index}`" class="text-sm font-medium text-gray-900 cursor-pointer">
                    {{ item.title }}
                  </label>
                  <p class="mt-0.5 text-xs text-gray-400">
                    <span v-if="item.dueDate"><i class="pi pi-calendar mr-1"></i>{{ item.dueDate }}</span>
                    <span v-else>Sans échéance</span>
                  </p>
                </div>
                <span
                  class="text-xs px-2 py-0.5 rounded-full shrink-0"
                  :class="priorityBadgeClass(item.priority)"
                >
                  {{ item.priority }}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTasksStore } from '../stores/tasks'

const MAX_CHARS = 5000
const WARNING_CHARS = 4500

interface ActionItem {
  title: string
  dueDate: string | null
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

interface MeetingSummaryResult {
  actionItems: ActionItem[]
  decisionSummary: string
}

defineProps<{ visible: boolean }>()
defineEmits<{ close: [] }>()

const authStore = useAuthStore()
const tasksStore = useTasksStore()

const transcriptText = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<MeetingSummaryResult | null>(null)
const selectedIndexes = ref(new Set<number>())
const summaryCopied = ref(false)

const selectedActionItems = computed(() =>
  (result.value?.actionItems || []).filter((_, index) => selectedIndexes.value.has(index)),
)

function priorityBadgeClass(priority: ActionItem['priority']) {
  if (priority === 'HIGH') return 'bg-red-100 text-red-700'
  if (priority === 'LOW') return 'bg-gray-100 text-gray-700'
  return 'bg-amber-100 text-amber-700'
}

function toggleSelection(index: number) {
  if (selectedIndexes.value.has(index)) {
    selectedIndexes.value.delete(index)
  } else {
    selectedIndexes.value.add(index)
  }
  selectedIndexes.value = new Set(selectedIndexes.value)
}

function initializeSelection() {
  selectedIndexes.value = new Set(
    (result.value?.actionItems || []).map((_, index) => index),
  )
}

async function summarizeMeeting() {
  if (!transcriptText.value.trim() || !authStore.token) return
  loading.value = true
  error.value = null

  try {
    const { data } = await axios.post<MeetingSummaryResult>(
      `${import.meta.env.VITE_API_URL}/ai/summarize-meeting`,
      { transcriptText: transcriptText.value.trim() },
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
    result.value = data
    initializeSelection()
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
      error.value = err.response.data.message
    } else {
      error.value = 'Une erreur est survenue lors de l’analyse de la réunion.'
    }
  } finally {
    loading.value = false
  }
}

async function syncTasksToWorkspace() {
  if (selectedActionItems.value.length === 0) return
  try {
    await tasksStore.bulkCreate(
      selectedActionItems.value.map((item) => ({
        title: item.title,
        dueDate: item.dueDate,
        status: 'TODO',
      })),
    )
  } catch {
    // handled by store
  }
}

async function copySummary() {
  if (!result.value?.decisionSummary) return
  try {
    await navigator.clipboard.writeText(result.value.decisionSummary)
    summaryCopied.value = true
    setTimeout(() => {
      summaryCopied.value = false
    }, 2000)
  } catch {
    // clipboard unavailable
  }
}
</script>
