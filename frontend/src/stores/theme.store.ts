import axios from 'axios'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './auth'

export const THEMES = ['light', 'dark', 'zen'] as const

export type ThemeName = (typeof THEMES)[number]

const THEME_STORAGE_KEY = 'myday_theme'

function normalizeTheme(theme?: string | null): ThemeName {
  return THEMES.includes(theme as ThemeName) ? (theme as ThemeName) : 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const authStore = useAuthStore()
  const currentTheme = ref<ThemeName>('light')
  const hasHydratedFromServer = ref(false)

  function applyTheme(themeName: ThemeName) {
    document.documentElement.setAttribute('data-theme', themeName)
  }

  function initializeTheme() {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const theme = normalizeTheme(savedTheme ?? systemTheme)

    currentTheme.value = theme
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }

  async function setTheme(themeName: string, syncWithBackend = true) {
    const normalizedTheme = normalizeTheme(themeName)

    currentTheme.value = normalizedTheme
    applyTheme(normalizedTheme)
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme)

    if (!syncWithBackend) {
      return
    }

    if (!authStore.token) {
      return
    }

    await axios.put(
      `${import.meta.env.VITE_API_URL}/settings`,
      { theme: normalizedTheme },
      { headers: { Authorization: 'Bearer ' + authStore.token } },
    )
  }

  async function hydrateThemeFromSettings() {
    if (!authStore.token || hasHydratedFromServer.value) {
      return
    }

    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/settings`, {
      headers: { Authorization: 'Bearer ' + authStore.token },
    })

    if (typeof data.theme === 'string') {
      await setTheme(data.theme, false)
    }

    hasHydratedFromServer.value = true
  }

  watch(
    () => authStore.token,
    (token) => {
      if (!token) {
        hasHydratedFromServer.value = false
        return
      }

      void hydrateThemeFromSettings()
    },
    { immediate: true },
  )

  return { currentTheme, initializeTheme, setTheme, hydrateThemeFromSettings }
})
