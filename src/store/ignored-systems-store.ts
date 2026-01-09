import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface IgnoredSystemsState {
  ignoredSystems: Set<number>
  avoidIncursions: boolean
  avoidInsurgencies: boolean
  addIgnored: (systemId: number) => void
  removeIgnored: (systemId: number) => void
  isIgnored: (systemId: number) => boolean
  clearAll: () => void
  setAvoidIncursions: (avoid: boolean) => void
  setAvoidInsurgencies: (avoid: boolean) => void
}

export const useIgnoredSystemsStore = create<IgnoredSystemsState>()(
  persist(
    (set, get) => ({
      ignoredSystems: new Set(),
      avoidIncursions: false,
      avoidInsurgencies: false,

      addIgnored: (systemId) => {
        set((state) => ({
          ignoredSystems: new Set([...state.ignoredSystems, systemId]),
        }))
      },

      removeIgnored: (systemId) => {
        set((state) => {
          const next = new Set(state.ignoredSystems)
          next.delete(systemId)
          return { ignoredSystems: next }
        })
      },

      isIgnored: (systemId) => {
        return get().ignoredSystems.has(systemId)
      },

      clearAll: () => {
        set({ ignoredSystems: new Set() })
      },

      setAvoidIncursions: (avoid) => {
        set({ avoidIncursions: avoid })
      },

      setAvoidInsurgencies: (avoid) => {
        set({ avoidInsurgencies: avoid })
      },
    }),
    {
      name: 'ignored-systems',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const parsed = JSON.parse(str)
          return {
            ...parsed,
            state: {
              ...parsed.state,
              ignoredSystems: new Set(parsed.state.ignoredSystems || []),
            },
          }
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              ignoredSystems: [...value.state.ignoredSystems],
            },
          }
          localStorage.setItem(name, JSON.stringify(serialized))
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
