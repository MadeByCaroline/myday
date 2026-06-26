<template>
  <div class="min-h-screen bg-white text-gray-900">
    <!-- Navigation -->
    <nav class="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div class="flex items-center gap-2">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <i class="pi pi-calendar text-white text-sm"></i>
          </div>
          <span class="text-lg font-bold text-gray-900">MyDay</span>
        </div>
        <RouterLink
          to="/login"
          class="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Se connecter
        </RouterLink>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white px-4 py-20 sm:py-28">
      <div class="mx-auto max-w-4xl text-center">
        <span
          class="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-700"
        >
          🎁 Offre de pré-lancement exclusive
        </span>

        <h1 class="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
          La productivité augmentée par l'IA.<br />
          <span class="text-indigo-600">Reprenez le contrôle de votre temps.</span>
        </h1>

        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
          Gérez vos tâches, vos emails et votre calendrier en un seul endroit. Laissez notre IA organiser votre
          journée.
        </p>

        <!-- Whitelist Form -->
        <form class="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:flex-row" @submit.prevent="submitWhitelist">
          <input
            v-model="heroEmail"
            type="email"
            placeholder="Votre adresse email"
            required
            class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            :disabled="heroSubmitted"
            :class="heroSubmitted ? 'cursor-not-allowed bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'"
            class="inline-flex shrink-0 items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white transition"
          >
            Rejoindre la Whitelist
          </button>
        </form>

        <p v-if="heroSubmitted" class="mt-3 text-sm font-medium text-emerald-600">
          ✅ Vous êtes sur la liste ! On vous contacte très bientôt.
        </p>
        <p v-else class="mt-3 text-sm text-gray-500">
          🎁 Les 100 premiers inscrits ont 1 chance sur 5 de remporter 2 mois gratuits.
        </p>
      </div>

      <!-- Decorative blobs -->
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -top-32 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-100 opacity-30 blur-3xl"
      ></div>
    </section>

    <!-- Features Section -->
    <section class="bg-white px-4 py-20">
      <div class="mx-auto max-w-6xl">
        <h2 class="text-center text-3xl font-bold text-gray-900 sm:text-4xl">
          Tout ce dont vous avez besoin, en un seul outil.
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-center text-gray-500">
          MyDay réunit les meilleurs outils de productivité et les amplifie grâce à l'intelligence artificielle.
        </p>

        <div class="mt-14 grid gap-8 sm:grid-cols-3">
          <!-- Feature 1 -->
          <div class="rounded-2xl border border-indigo-100 bg-indigo-50 p-8 text-center">
            <div
              class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white"
            >
              🧠
            </div>
            <h3 class="text-lg font-bold text-gray-900">IA Omnisciente</h3>
            <p class="mt-2 text-sm leading-relaxed text-gray-600">
              Résume vos emails et rédige des brouillons intelligents directement depuis votre boîte de réception.
            </p>
          </div>

          <!-- Feature 2 -->
          <div class="rounded-2xl border border-violet-100 bg-violet-50 p-8 text-center">
            <div
              class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-2xl text-white"
            >
              ⏱️
            </div>
            <h3 class="text-lg font-bold text-gray-900">Time Tracking &amp; Kanban</h3>
            <p class="mt-2 text-sm leading-relaxed text-gray-600">
              Glissez, déposez, et chronométrez vos tâches avec un tableau Kanban intuitif et un suivi du temps intégré.
            </p>
          </div>

          <!-- Feature 3 -->
          <div class="rounded-2xl border border-sky-100 bg-sky-50 p-8 text-center">
            <div
              class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-2xl text-white"
            >
              📅
            </div>
            <h3 class="text-lg font-bold text-gray-900">Auto-Planification</h3>
            <p class="mt-2 text-sm leading-relaxed text-gray-600">
              L'IA place vos tâches directement dans les trous de votre calendrier pour une journée toujours optimisée.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Bottom CTA Section -->
    <section class="bg-gradient-to-b from-white to-indigo-50 px-4 py-20">
      <div class="mx-auto max-w-3xl text-center">
        <h2 class="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Prêt à changer votre façon de travailler ?
        </h2>
        <p class="mx-auto mt-4 max-w-xl text-lg text-gray-600">
          Rejoignez dès maintenant la whitelist et soyez parmi les premiers à découvrir MyDay.
        </p>

        <!-- Re-use whitelist form -->
        <form class="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:flex-row" @submit.prevent="submitBottomWhitelist">
          <input
            v-model="bottomEmail"
            type="email"
            placeholder="Votre adresse email"
            required
            class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            :disabled="bottomSubmitted"
            :class="bottomSubmitted ? 'cursor-not-allowed bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'"
            class="inline-flex shrink-0 items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white transition"
          >
            Rejoindre la Whitelist
          </button>
        </form>

        <p v-if="bottomSubmitted" class="mt-3 text-sm font-medium text-emerald-600">
          ✅ Vous êtes sur la liste ! On vous contacte très bientôt.
        </p>
        <p v-else class="mt-3 text-sm text-gray-500">
          🎁 Les 100 premiers inscrits ont 1 chance sur 5 de remporter 2 mois gratuits.
        </p>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-gray-100 bg-white px-4 py-8 text-center text-sm text-gray-400">
      © {{ new Date().getFullYear() }} MyDay. Tous droits réservés.
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const WHITELIST_STORAGE_KEY = 'myday_landing_whitelist_email'

const heroEmail = ref('')
const heroSubmitted = ref(false)

const bottomEmail = ref('')
const bottomSubmitted = ref(false)

function handleWhitelistSubmit(emailRef: typeof heroEmail, submittedRef: typeof heroSubmitted) {
  const normalizedEmail = emailRef.value.trim().toLowerCase()
  if (!normalizedEmail) return
  window.localStorage.setItem(WHITELIST_STORAGE_KEY, normalizedEmail)
  submittedRef.value = true
  emailRef.value = ''
}

function submitWhitelist() {
  handleWhitelistSubmit(heroEmail, heroSubmitted)
}

function submitBottomWhitelist() {
  handleWhitelistSubmit(bottomEmail, bottomSubmitted)
}

onMounted(() => {
  const alreadySubmitted = !!window.localStorage.getItem(WHITELIST_STORAGE_KEY)
  if (alreadySubmitted) {
    heroSubmitted.value = true
    bottomSubmitted.value = true
  }
})
</script>
