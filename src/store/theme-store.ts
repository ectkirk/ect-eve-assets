import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light' | 'dark-colorblind' | 'light-colorblind'

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'dark-colorblind', label: 'Dark (Colorblind)' },
  { value: 'light-colorblind', label: 'Light (Colorblind)' },
]

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function applyThemeToDocument(theme: Theme): void {
  const root = document.documentElement
  const isDark = theme === 'dark' || theme === 'dark-colorblind'
  const isColorblind =
    theme === 'dark-colorblind' || theme === 'light-colorblind'

  root.classList.toggle('dark', isDark)
  root.classList.toggle('colorblind', isColorblind)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        applyThemeToDocument(theme)
        set({ theme })
      },
    }),
    {
      name: 'theme',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyThemeToDocument(state.theme)
        }
      },
    }
  )
)

export function initTheme(): void {
  const { theme } = useThemeStore.getState()
  applyThemeToDocument(theme)
}
