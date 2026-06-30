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

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
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
