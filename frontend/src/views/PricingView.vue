<template>
  <div class="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white py-12 px-4">
    <div class="mx-auto max-w-6xl space-y-8">
      <section v-if="!authStore.isAdmin" class="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm sm:p-8">
        <p class="text-lg font-semibold text-gray-900 sm:text-xl">
          🎁 Offre de pré-lancement : Rejoignez la Whitelist ! Les 100 premiers inscrits ont 1 chance sur 5 de
          remporter 2 mois d'abonnement gratuit.
        </p>

        <form class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center" @submit.prevent="submitWhitelist">
          <input
            type="email"
            placeholder="Votre email"
            v-model="email"
            class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:max-w-sm"
            required
          />
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
            :disabled="giveawaySubmitted"
            :class="giveawaySubmitted ? 'cursor-not-allowed bg-indigo-300 hover:bg-indigo-300' : ''"
          >
            Tenter ma chance
          </button>
        </form>

        <p class="mt-3 text-sm text-gray-600">
          🔒 Empreinte de carte bancaire requise pour validation. 0€ débité aujourd'hui. Annulation en un clic.
        </p>
        <p v-if="giveawaySubmitted" class="mt-2 text-sm font-medium text-emerald-700">
          Merci ! Votre demande de whitelist a bien été enregistrée.
        </p>
      </section>

      <section v-if="!authStore.isAdmin" class="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h2 class="text-xl font-bold text-gray-900">Choisissez votre formule</h2>
          <div class="inline-flex items-center gap-3 rounded-full bg-gray-100 p-1">
            <span :class="isAnnual ? 'text-gray-500' : 'text-gray-900'" class="px-3 text-sm font-medium">Mensuel</span>
            <button
              type="button"
              role="switch"
              :aria-checked="isAnnual"
              class="relative h-7 w-12 rounded-full transition"
              :class="isAnnual ? 'bg-indigo-600' : 'bg-gray-300'"
              @click="isAnnual = !isAnnual"
            >
              <span
                class="absolute top-1 h-5 w-5 rounded-full bg-white transition-transform"
                :class="isAnnual ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
            <span :class="isAnnual ? 'text-gray-900' : 'text-gray-500'" class="px-2 text-sm font-medium">Annuel</span>
            <span class="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Économisez 30%</span>
          </div>
        </div>
      </section>

      <section v-if="!authStore.isAdmin" class="grid gap-6 lg:grid-cols-2">
        <article
          class="rounded-3xl border bg-white p-6 shadow-sm transition"
          :class="!isAnnual ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-200'"
        >
          <p class="text-sm font-semibold uppercase tracking-wide text-indigo-600">Forfait Mensuel</p>
          <p class="mt-4 text-4xl font-bold text-gray-900">
            {{ MONTHLY_PRICE }}€ <span class="text-lg font-medium text-gray-500">/ mois</span>
          </p>
          <p class="mt-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
            Essai gratuit de 7 jours
          </p>

          <button
            type="button"
            class="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingPlan !== null"
            @click="startSubscription('monthly')"
          >
            <span v-if="loadingPlan === 'monthly'" class="inline-flex items-center gap-2">
              <i class="pi pi-spin pi-spinner" />
              Redirection…
            </span>
            <span v-else>Démarrer mon essai gratuit (CB requise)</span>
          </button>
          <p class="mt-3 text-xs leading-relaxed text-gray-600">
            Aucun débit aujourd'hui. Vous serez prélevé de {{ MONTHLY_PRICE }}€/mois après 7 jours sauf annulation
            préalable depuis votre profil.
          </p>
        </article>

        <article
          class="relative rounded-3xl border bg-white p-6 shadow-sm transition"
          :class="isAnnual ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200'"
        >
          <span class="absolute -top-3 left-6 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
            Recommandé
          </span>
          <p class="text-sm font-semibold uppercase tracking-wide text-indigo-600">Forfait Annuel</p>
          <div class="mt-4 flex items-end gap-3">
            <span class="text-lg text-gray-400 line-through">{{ ANNUAL_REGULAR_PRICE }}€</span>
            <p class="text-4xl font-bold text-gray-900">
              {{ annualDisplayedPrice }}
            </p>
          </div>
          <p v-if="isAnnual" class="mt-1 text-sm text-gray-500">Facturé {{ ANNUAL_PRICE }}€ / an</p>
          <p v-else class="mt-1 text-sm text-gray-500">{{ ANNUAL_PRICE }}€ / an</p>
          <p class="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            Le choix des pros - Économisez 105€
          </p>

          <button
            type="button"
            class="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loadingPlan !== null"
            @click="startSubscription('annual')"
          >
            <span v-if="loadingPlan === 'annual'" class="inline-flex items-center gap-2">
              <i class="pi pi-spin pi-spinner" />
              Redirection…
            </span>
            <span v-else>S'abonner à l'année</span>
          </button>
          <p class="mt-3 text-xs leading-relaxed text-gray-600">
            Prélèvement unique de {{ ANNUAL_PRICE }}€ aujourd'hui. Renouvellement automatique chaque année. Annulation
            possible à tout moment.
          </p>
        </article>
      </section>

      <section v-else class="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-emerald-800 shadow-sm sm:p-8">
        <h2 class="text-xl font-bold">Accès administrateur actif</h2>
        <p class="mt-2 text-sm">
          Votre compte administrateur a un accès complet à toutes les fonctionnalités premium.
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()
const MONTHLY_PRICE = 29
const ANNUAL_PRICE = 243
const ANNUAL_REGULAR_PRICE = 348
const WHITELIST_STORAGE_KEY = 'myday_pricing_whitelist_email'

const isAnnual = ref(false)
const email = ref('')
const giveawaySubmitted = ref(false)
const loadingPlan = ref<'monthly' | 'annual' | null>(null)

const annualDisplayedPrice = computed(() => (isAnnual.value ? '20,25€ / mois' : `${ANNUAL_PRICE}€ / an`))

function submitWhitelist() {
  if (giveawaySubmitted.value) {
    return
  }

  const normalizedEmail = email.value.trim().toLowerCase()
  if (!normalizedEmail) {
    return
  }

  window.localStorage.setItem(WHITELIST_STORAGE_KEY, normalizedEmail)
  giveawaySubmitted.value = true
  email.value = ''
}

async function startSubscription(plan: 'monthly' | 'annual') {
  if (!authStore.isAuthenticated) {
    router.push({ name: 'login', query: { plan } })
    return
  }

  loadingPlan.value = plan
  try {
    const { data } = await axios.post<{ url: string }>(
      `${import.meta.env.VITE_API_URL}/payments/checkout`,
      { planType: plan },
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
    if (!data.url) {
      throw new Error('No checkout URL returned')
    }
    window.location.href = data.url
  } catch (err: unknown) {
    const detail =
      axios.isAxiosError(err) && typeof err.response?.data?.message === 'string'
        ? err.response.data.message
        : 'Impossible d\'initier le paiement. Veuillez réessayer.'
    toast.add({ severity: 'error', summary: 'Erreur', detail, life: 5000 })
    loadingPlan.value = null
  }
}
</script>
