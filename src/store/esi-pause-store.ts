import { create } from 'zustand'

interface ESIPauseStore {
  isPaused: boolean
  toggle: () => Promise<void>
  sync: () => Promise<void>
}

export const useESIPauseStore = create<ESIPauseStore>((set, get) => ({
  isPaused: false,

  toggle: async () => {
    if (!window.electronAPI) return
    const current = get().isPaused
    if (current) {
      await window.electronAPI.esi.resume()
    } else {
      await window.electronAPI.esi.pause()
    }
    set({ isPaused: !current })
  },

  sync: async () => {
    if (!window.electronAPI) return
    const paused = await window.electronAPI.esi.isPaused()
    set({ isPaused: paused })
  },
}))
