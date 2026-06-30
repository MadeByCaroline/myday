import { createApp } from 'vue'
import { createPinia } from 'pinia'
import axios from 'axios'
import PrimeVue from 'primevue/config'
import ToastEventBus from 'primevue/toasteventbus'
import ToastService from 'primevue/toastservice'
import Aura from '@primevue/themes/aura'
import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme.store'
import './style.css'
import 'primeicons/primeicons.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '[data-theme="dark"]',
    },
  },
})
app.use(ToastService)

let oauthReconnectPromptOpen = false

function providerLabel(provider?: string) {
  if (provider === 'MICROSOFT') return 'Microsoft'
  if (provider === 'GOOGLE') return 'Google'
  return 'Google/Microsoft'
}

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const code = error.response?.data?.code
      if (status === 401 && code === 'OAUTH_SESSION_EXPIRED') {
        if (!oauthReconnectPromptOpen) {
          oauthReconnectPromptOpen = true
          const provider = providerLabel(error.response?.data?.provider)
          const shouldOpenIntegrations = window.confirm(
            `La connexion à votre compte ${provider} a expiré. Veuillez vous reconnecter.\n\nOuvrir la page des intégrations maintenant ?`,
          )
          oauthReconnectPromptOpen = false
          if (shouldOpenIntegrations) {
            void router.push({ name: 'integrations' })
          }
        }
      }
      if (!error.response || (typeof status === 'number' && status >= 500)) {
        ToastEventBus.emit('add', {
          severity: 'error',
          summary: 'Erreur réseau',
          detail: !error.response
            ? 'Le serveur est momentanément inaccessible. Réessayez dans un instant.'
            : 'Une erreur serveur a interrompu cette action. Réessayez dans un instant.',
          life: 4000,
        })
      }
    }

    return Promise.reject(error)
  },
)

const themeStore = useThemeStore(pinia)
themeStore.initializeTheme()

app.mount('#app')
