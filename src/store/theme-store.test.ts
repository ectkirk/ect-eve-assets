import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore, initTheme, THEME_OPTIONS } from './theme-store'

describe('theme-store', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'dark' })
    document.documentElement.className = ''
  })

  describe('THEME_OPTIONS', () => {
    it('has 4 theme options', () => {
      expect(THEME_OPTIONS).toHaveLength(4)
    })

    it('includes all expected themes', () => {
      const values = THEME_OPTIONS.map((o) => o.value)
      expect(values).toContain('dark')
      expect(values).toContain('light')
      expect(values).toContain('dark-colorblind')
      expect(values).toContain('light-colorblind')
    })
  })

  describe('setTheme', () => {
    it('updates theme in store', () => {
      useThemeStore.getState().setTheme('light')
      expect(useThemeStore.getState().theme).toBe('light')
    })

    it('applies dark class for dark theme', () => {
      useThemeStore.getState().setTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('colorblind')).toBe(false)
    })

    it('removes dark class for light theme', () => {
      document.documentElement.classList.add('dark')
      useThemeStore.getState().setTheme('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.classList.contains('colorblind')).toBe(false)
    })

    it('applies both dark and colorblind classes for dark-colorblind', () => {
      useThemeStore.getState().setTheme('dark-colorblind')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('colorblind')).toBe(true)
    })

    it('applies only colorblind class for light-colorblind', () => {
      useThemeStore.getState().setTheme('light-colorblind')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.classList.contains('colorblind')).toBe(true)
    })
  })

  describe('initTheme', () => {
    it('applies current theme from store to document', () => {
      useThemeStore.setState({ theme: 'dark-colorblind' })
      document.documentElement.className = ''
      initTheme()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('colorblind')).toBe(true)
    })
  })
})
