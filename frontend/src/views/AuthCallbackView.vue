<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-xl p-8 text-center">
      <div v-if="error" class="text-red-500">
        <i class="pi pi-times-circle text-4xl mb-4 block"></i>
        <p>Échec de l’authentification : {{ error }}</p>
        <RouterLink to="/login" class="mt-4 text-indigo-600 hover:underline block">Retour à la connexion</RouterLink>
      </div>
      <div v-else>
        <i class="pi pi-spin pi-spinner text-4xl text-indigo-600 mb-4 block"></i>
        <p class="text-gray-600">Connexion en cours...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const error = ref<string | null>(null)

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search)
  const oauthError = urlParams.get('error')
  const token = urlParams.get('token')

  if (oauthError) {
    error.value = oauthError === 'oauth_login_failed'
      ? "L’authentification Google a échoué. Veuillez réessayer et confirmer les autorisations Google."
      : "L’authentification Google a échoué."
    return
  }

  if (!token) {
    error.value = 'Aucun jeton reçu.'
    return
  }

  authStore.setToken(token)

  try {
    const { data } = await axios.get(
      `${import.meta.env.VITE_API_URL}/auth/profile`,
      { headers: { Authorization: 'Bearer ' + token } },
    )
    authStore.setUser(data)
    router.push({ name: 'my-day' })
  } catch {
    error.value = 'Impossible de récupérer le profil.'
    authStore.logout()
  }
})
</script>
