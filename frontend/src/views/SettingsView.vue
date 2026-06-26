<template>
  <main class="flex-1 flex flex-col overflow-hidden">
    <header class="theme-header border-b px-8 py-4">
      <h2 class="theme-title text-2xl font-bold">Paramètres</h2>
      <p class="theme-text-secondary mt-1 text-sm">Personnalisez votre assistant IA et vos préférences e-mail</p>
    </header>

    <div class="flex-1 overflow-auto p-8 space-y-6">
      <section class="theme-card rounded-2xl border p-6">
        <div class="mb-4 flex items-center gap-3">
          <div class="theme-accent-icon flex h-9 w-9 items-center justify-center rounded-xl">
            <i class="pi pi-palette"></i>
          </div>
          <div>
            <h3 class="theme-title text-lg font-semibold">Thème de l’interface</h3>
            <p class="theme-text-secondary text-sm">Choisissez l’ambiance visuelle de votre espace de travail.</p>
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-3">
          <button
            v-for="theme in themeOptions"
            :key="theme.name"
            type="button"
            :disabled="themeSaving"
            :class="[
              'theme-picker rounded-2xl p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
              themeStore.currentTheme === theme.name && 'theme-picker-active',
            ]"
            @click="applyTheme(theme.name)"
          >
            <div class="mb-3 flex gap-2">
              <span
                v-for="color in theme.preview"
                :key="color"
                class="h-6 w-6 rounded-full border"
                :style="{ backgroundColor: color, borderColor: 'rgba(148, 163, 184, 0.35)' }"
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="theme-title text-sm font-semibold">{{ theme.label }}</p>
                <p class="theme-text-secondary mt-1 text-xs">{{ theme.description }}</p>
              </div>
              <i
                v-if="themeStore.currentTheme === theme.name"
                class="pi pi-check-circle"
                style="color: var(--accent)"
              ></i>
            </div>
          </button>
        </div>
      </section>

      <!-- AI Summary Instructions -->
      <section class="theme-card rounded-2xl border p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="theme-accent-icon w-9 h-9 rounded-xl flex items-center justify-center">
            <i class="pi pi-sparkles"></i>
          </div>
          <div>
            <h3 class="theme-title text-lg font-semibold">Style du résumé IA</h3>
            <p class="theme-text-secondary text-sm">Personnalisez la manière dont l’IA résume vos e-mails</p>
          </div>
        </div>
        <textarea
          v-model="aiSummaryInstructions"
          rows="4"
          placeholder='ex. « Résume en puces, mets l’accent sur les échéances et les actions à mener. Ignore les e-mails marketing. »'
          class="theme-input w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
        />
        <div class="mt-3 flex justify-end">
          <button
            type="button"
            :disabled="saving"
            class="theme-button-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            @click="saveInstructions"
          >
            <i v-if="saving" class="pi pi-spin pi-spinner"></i>
            <i v-else class="pi pi-check"></i>
            {{ saving ? 'Enregistrement...' : 'Enregistrer les instructions' }}
          </button>
        </div>
      </section>

      <!-- Excluded Senders -->
      <section class="theme-card rounded-2xl border p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="theme-danger-icon w-9 h-9 rounded-xl flex items-center justify-center">
            <i class="pi pi-ban"></i>
          </div>
          <div>
            <h3 class="theme-title text-lg font-semibold">Expéditeurs ignorés</h3>
            <p class="theme-text-secondary text-sm">Les e-mails de ces expéditeurs seront exclus des résumés IA</p>
          </div>
        </div>

        <div class="flex gap-2 mb-4">
          <input
            v-model="newSender"
            type="text"
            placeholder="ex. newsletter@example.com ou @newsletter.com"
            class="theme-input flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            @keyup.enter="addSender"
          />
          <button
            type="button"
            :disabled="!newSender.trim() || saving"
            class="theme-button-secondary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            @click="addSender"
          >
            <i class="pi pi-plus"></i>
            Ajouter
          </button>
        </div>

        <div v-if="excludedSenders.length > 0" class="flex flex-wrap gap-2">
          <span
            v-for="sender in excludedSenders"
            :key="sender"
            class="theme-badge-danger inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full"
          >
            {{ sender }}
            <button
              type="button"
              class="transition-colors"
              style="color: var(--danger)"
              :aria-label="`Retirer ${sender}`"
              @click="removeSender(sender)"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </span>
        </div>
        <p v-else class="theme-text-muted text-sm italic">Aucun expéditeur exclu pour le moment.</p>
      </section>

      <div v-if="successMessage" class="theme-alert-success rounded-xl px-4 py-3 text-sm flex items-center gap-2">
        <i class="pi pi-check-circle"></i>
        {{ successMessage }}
      </div>
      <div v-if="errorMessage" class="theme-alert-danger rounded-xl px-4 py-3 text-sm flex items-center gap-2">
        <i class="pi pi-exclamation-circle"></i>
        {{ errorMessage }}
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import axios from 'axios'
import { onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { THEMES, useThemeStore, type ThemeName } from '../stores/theme.store'

const authStore = useAuthStore()
const themeStore = useThemeStore()

const aiSummaryInstructions = ref('')
const excludedSenders = ref<string[]>([])
const newSender = ref('')
const saving = ref(false)
const themeSaving = ref(false)
const successMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const themeOptions: Array<{ name: ThemeName; label: string; description: string; preview: string[] }> = [
  {
    name: THEMES[0],
    label: 'Clair',
    description: 'Un rendu lumineux et net pour la journée.',
    preview: ['#ffffff', '#eef2ff', '#4f46e5'],
  },
  {
    name: THEMES[1],
    label: 'Sombre',
    description: 'Un contraste doux pour les environnements peu éclairés.',
    preview: ['#111827', '#1f2937', '#60a5fa'],
  },
  {
    name: THEMES[2],
    label: 'Zen',
    description: 'Une palette naturelle et apaisante.',
    preview: ['#f5f5dc', '#d8e7c7', '#8fbc8f'],
  },
]

function getAuthHeaders() {
  return authStore.token ? { Authorization: 'Bearer ' + authStore.token } : {}
}

function showSuccess(msg: string) {
  successMessage.value = msg
  errorMessage.value = null
  setTimeout(() => { successMessage.value = null }, 3000)
}

function showError(msg: string) {
  errorMessage.value = msg
  successMessage.value = null
}

async function fetchSettings() {
  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/settings`, {
      headers: getAuthHeaders(),
    })
    aiSummaryInstructions.value = data.aiSummaryInstructions ?? ''
    excludedSenders.value = Array.isArray(data.excludedSenders) ? data.excludedSenders : []
  } catch {
    showError('Échec du chargement des paramètres.')
  }
}

async function saveInstructions() {
  saving.value = true
  try {
    await axios.put(
      `${import.meta.env.VITE_API_URL}/settings`,
      { aiSummaryInstructions: aiSummaryInstructions.value || null },
      { headers: getAuthHeaders() },
    )
    showSuccess('Instructions IA enregistrées.')
  } catch {
    showError('Échec de l’enregistrement des instructions.')
  } finally {
    saving.value = false
  }
}

async function addSender() {
  const sender = newSender.value.trim()
  if (!sender || excludedSenders.value.includes(sender)) return

  const updated = [...excludedSenders.value, sender]
  saving.value = true
  try {
    await axios.put(
      `${import.meta.env.VITE_API_URL}/settings`,
      { excludedSenders: updated },
      { headers: getAuthHeaders() },
    )
    excludedSenders.value = updated
    newSender.value = ''
    showSuccess(`"${sender}" a été ajouté à la liste d’exclusion.`)
  } catch {
    showError('Impossible de mettre à jour la liste d’exclusion.')
  } finally {
    saving.value = false
  }
}

async function removeSender(sender: string) {
  const updated = excludedSenders.value.filter((s) => s !== sender)
  saving.value = true
  try {
    await axios.put(
      `${import.meta.env.VITE_API_URL}/settings`,
      { excludedSenders: updated },
      { headers: getAuthHeaders() },
    )
    excludedSenders.value = updated
    showSuccess(`"${sender}" a été retiré de la liste d’exclusion.`)
  } catch {
    showError('Impossible de mettre à jour la liste d’exclusion.')
  } finally {
    saving.value = false
  }
}

async function applyTheme(themeName: ThemeName) {
  themeSaving.value = true
  try {
    await themeStore.setTheme(themeName)
    showSuccess(`Thème « ${themeOptions.find((theme) => theme.name === themeName)?.label ?? themeName} » appliqué.`)
  } catch {
    showError('Le thème a été appliqué localement, mais la synchronisation a échoué.')
  } finally {
    themeSaving.value = false
  }
}

onMounted(() => {
  void fetchSettings()
})
</script>
