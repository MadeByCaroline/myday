<template>
  <main class="flex-1 flex flex-col overflow-hidden">
    <header class="bg-white border-b border-gray-200 px-8 py-4">
      <h2 class="text-2xl font-bold text-gray-900">Paramètres</h2>
      <p class="text-sm text-gray-500 mt-1">Personnalisez votre assistant IA et vos préférences e-mail</p>
    </header>

    <div class="flex-1 overflow-auto p-8 space-y-6">
      <!-- AI Summary Instructions -->
      <section class="bg-white border border-gray-200 rounded-2xl p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
            <i class="pi pi-sparkles text-violet-600"></i>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Style du résumé IA</h3>
            <p class="text-sm text-gray-500">Personnalisez la manière dont l’IA résume vos e-mails</p>
          </div>
        </div>
        <textarea
          v-model="aiSummaryInstructions"
          rows="4"
          placeholder='ex. « Résume en puces, mets l’accent sur les échéances et les actions à mener. Ignore les e-mails marketing. »'
          class="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
        />
        <div class="mt-3 flex justify-end">
          <button
            type="button"
            :disabled="saving"
            class="flex items-center gap-2 bg-violet-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            @click="saveInstructions"
          >
            <i v-if="saving" class="pi pi-spin pi-spinner"></i>
            <i v-else class="pi pi-check"></i>
            {{ saving ? 'Enregistrement...' : 'Enregistrer les instructions' }}
          </button>
        </div>
      </section>

      <!-- Excluded Senders -->
      <section class="bg-white border border-gray-200 rounded-2xl p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
            <i class="pi pi-ban text-red-600"></i>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Expéditeurs ignorés</h3>
            <p class="text-sm text-gray-500">Les e-mails de ces expéditeurs seront exclus des résumés IA</p>
          </div>
        </div>

        <div class="flex gap-2 mb-4">
          <input
            v-model="newSender"
            type="text"
            placeholder="ex. newsletter@example.com ou @newsletter.com"
            class="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400"
            @keyup.enter="addSender"
          />
          <button
            type="button"
            :disabled="!newSender.trim() || saving"
            class="flex items-center gap-2 bg-red-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
            class="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-1.5 rounded-full"
          >
            {{ sender }}
            <button
              type="button"
              class="text-red-400 hover:text-red-600 transition-colors"
              :aria-label="`Retirer ${sender}`"
              @click="removeSender(sender)"
            >
              <i class="pi pi-times text-xs"></i>
            </button>
          </span>
        </div>
        <p v-else class="text-sm text-gray-400 italic">Aucun expéditeur exclu pour le moment.</p>
      </section>

      <div v-if="successMessage" class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center gap-2">
        <i class="pi pi-check-circle"></i>
        {{ successMessage }}
      </div>
      <div v-if="errorMessage" class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
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

const authStore = useAuthStore()

const aiSummaryInstructions = ref('')
const excludedSenders = ref<string[]>([])
const newSender = ref('')
const saving = ref(false)
const successMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

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

onMounted(() => {
  fetchSettings()
})
</script>
