import { create } from 'zustand'

interface SelectedItem {
  id: number
  name: string
  security?: number
}

interface ResearchInputs {
  blueprint: SelectedItem | null
  system: SelectedItem | null
  facility: number
  metallurgyLevel: number
  researchLevel: number
  advancedIndustryLevel: number
  meRig: number
  teRig: number
  meImplant: number
  teImplant: number
  securityStatus: 'h' | 'l' | 'n'
  facilityTax: number
  fwBonus: boolean
}

interface CopyingInputs {
  blueprint: SelectedItem | null
  system: SelectedItem | null
  facility: number
  scienceLevel: number
  advancedIndustryLevel: number
  copyRig: number
  copyImplant: number
  securityStatus: 'h' | 'l' | 'n'
  facilityTax: number
  fwBonus: boolean
  runsPerCopy: number
}

interface ToolsState {
  research: ResearchInputs
  researchResult: BlueprintResearchResult | null
  copying: CopyingInputs
  copyingResult: BlueprintResearchResult | null
  setResearch: (partial: Partial<ResearchInputs>) => void
  setResearchResult: (result: BlueprintResearchResult | null) => void
  setCopying: (partial: Partial<CopyingInputs>) => void
  setCopyingResult: (result: BlueprintResearchResult | null) => void
}

const DEFAULT_RESEARCH: ResearchInputs = {
  blueprint: null,
  system: null,
  facility: 0,
  metallurgyLevel: 5,
  researchLevel: 5,
  advancedIndustryLevel: 5,
  meRig: 0,
  teRig: 0,
  meImplant: 1.0,
  teImplant: 1.0,
  securityStatus: 'h',
  facilityTax: 0,
  fwBonus: false,
}

const DEFAULT_COPYING: CopyingInputs = {
  blueprint: null,
  system: null,
  facility: 0,
  scienceLevel: 5,
  advancedIndustryLevel: 5,
  copyRig: 0,
  copyImplant: 1.0,
  securityStatus: 'h',
  facilityTax: 0,
  fwBonus: false,
  runsPerCopy: 1,
}

export const useToolsStore = create<ToolsState>((set) => ({
  research: DEFAULT_RESEARCH,
  researchResult: null,
  copying: DEFAULT_COPYING,
  copyingResult: null,

  setResearch: (partial) =>
    set((state) => ({ research: { ...state.research, ...partial } })),

  setResearchResult: (result) => set({ researchResult: result }),

  setCopying: (partial) =>
    set((state) => ({ copying: { ...state.copying, ...partial } })),

  setCopyingResult: (result) => set({ copyingResult: result }),
}))
