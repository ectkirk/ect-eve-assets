import { describe, it, expect } from 'vitest'
import {
  TreeMode,
  CategoryIds,
  LocationFlagNumbers,
  LocationFlagToNumber,
  HANGAR_FLAGS,
  SHIP_CONTENT_FLAGS,
  STRUCTURE_CONTENT_FLAGS,
  DELIVERY_FLAGS,
  ASSET_SAFETY_FLAGS,
  OFFICE_TYPE_ID,
  DIVISION_FLAG_NAMES,
  OFFICE_DIVISION_FLAGS,
} from './tree-types'

describe('TreeMode', () => {
  it('has all expected modes', () => {
    expect(TreeMode.ITEM_HANGAR).toBe('ITEM_HANGAR')
    expect(TreeMode.SHIP_HANGAR).toBe('SHIP_HANGAR')
    expect(TreeMode.DELIVERIES).toBe('DELIVERIES')
    expect(TreeMode.ASSET_SAFETY).toBe('ASSET_SAFETY')
    expect(TreeMode.MARKET_ORDERS).toBe('MARKET_ORDERS')
    expect(TreeMode.INDUSTRY_JOBS).toBe('INDUSTRY_JOBS')
    expect(TreeMode.CLONES).toBe('CLONES')
    expect(TreeMode.OFFICE).toBe('OFFICE')
    expect(TreeMode.STRUCTURES).toBe('STRUCTURES')
    expect(TreeMode.CONTRACTS).toBe('CONTRACTS')
  })
})

describe('CategoryIds', () => {
  it('has correct EVE category IDs', () => {
    expect(CategoryIds.SHIP).toBe(6)
    expect(CategoryIds.MODULE).toBe(7)
    expect(CategoryIds.CHARGE).toBe(8)
    expect(CategoryIds.BLUEPRINT).toBe(9)
    expect(CategoryIds.SKILL).toBe(16)
    expect(CategoryIds.DRONE).toBe(18)
    expect(CategoryIds.IMPLANT).toBe(20)
    expect(CategoryIds.STRUCTURE).toBe(65)
    expect(CategoryIds.STRUCTURE_MODULE).toBe(66)
    expect(CategoryIds.SKIN).toBe(91)
  })
})

describe('LocationFlagNumbers', () => {
  it('has correct flag numbers', () => {
    expect(LocationFlagNumbers.Hangar).toBe(4)
    expect(LocationFlagNumbers.Cargo).toBe(5)
    expect(LocationFlagNumbers.Deliveries).toBe(173)
    expect(LocationFlagNumbers.CorpDeliveries).toBe(62)
    expect(LocationFlagNumbers.AssetSafety).toBe(36)
    expect(LocationFlagNumbers.CloneBay).toBe(89)
    expect(LocationFlagNumbers.ShipHangar).toBe(90)
    expect(LocationFlagNumbers.FleetHangar).toBe(155)
    expect(LocationFlagNumbers.FighterBay).toBe(158)
    expect(LocationFlagNumbers.StructureFuel).toBe(164)
  })

  it('has matching CorpSAG flags (116-122)', () => {
    expect(LocationFlagNumbers.CorpSAG1).toBe(116)
    expect(LocationFlagNumbers.CorpSAG2).toBe(117)
    expect(LocationFlagNumbers.CorpSAG3).toBe(118)
    expect(LocationFlagNumbers.CorpSAG4).toBe(119)
    expect(LocationFlagNumbers.CorpSAG5).toBe(120)
    expect(LocationFlagNumbers.CorpSAG6).toBe(121)
    expect(LocationFlagNumbers.CorpSAG7).toBe(122)
  })
})

describe('LocationFlagToNumber', () => {
  it('maps string flags to numeric values', () => {
    expect(LocationFlagToNumber['Hangar']).toBe(4)
    expect(LocationFlagToNumber['Cargo']).toBe(5)
    expect(LocationFlagToNumber['Deliveries']).toBe(173)
    expect(LocationFlagToNumber['AssetSafety']).toBe(36)
  })

  it('has consistent values where keys overlap with LocationFlagNumbers', () => {
    for (const [key, value] of Object.entries(LocationFlagToNumber)) {
      const flagNumber = LocationFlagNumbers[key as keyof typeof LocationFlagNumbers]
      if (flagNumber !== undefined) {
        expect(value).toBe(flagNumber)
      }
    }
  })
})

describe('HANGAR_FLAGS', () => {
  it('includes Hangar and corp SAG divisions', () => {
    expect(HANGAR_FLAGS.has('Hangar')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG1')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG2')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG3')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG4')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG5')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG6')).toBe(true)
    expect(HANGAR_FLAGS.has('CorpSAG7')).toBe(true)
  })

  it('excludes non-hangar flags', () => {
    expect(HANGAR_FLAGS.has('Cargo')).toBe(false)
    expect(HANGAR_FLAGS.has('Deliveries')).toBe(false)
    expect(HANGAR_FLAGS.has('AssetSafety')).toBe(false)
  })
})

describe('SHIP_CONTENT_FLAGS', () => {
  it('includes ship cargo bays', () => {
    expect(SHIP_CONTENT_FLAGS.has('Cargo')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('DroneBay')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('ShipHangar')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('FleetHangar')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('FighterBay')).toBe(true)
  })

  it('includes module slots', () => {
    expect(SHIP_CONTENT_FLAGS.has('LoSlot0')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('MedSlot0')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('HiSlot0')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('RigSlot0')).toBe(true)
  })

  it('includes specialized holds', () => {
    expect(SHIP_CONTENT_FLAGS.has('SpecializedOreHold')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('SpecializedFuelBay')).toBe(true)
    expect(SHIP_CONTENT_FLAGS.has('SpecializedAmmoHold')).toBe(true)
  })

  it('excludes hangar flags', () => {
    expect(SHIP_CONTENT_FLAGS.has('Hangar')).toBe(false)
    expect(SHIP_CONTENT_FLAGS.has('CorpSAG1')).toBe(false)
  })
})

describe('STRUCTURE_CONTENT_FLAGS', () => {
  it('includes structure service slots', () => {
    expect(STRUCTURE_CONTENT_FLAGS.has('StructureFuel')).toBe(true)
    expect(STRUCTURE_CONTENT_FLAGS.has('StructureServiceSlot0')).toBe(true)
    expect(STRUCTURE_CONTENT_FLAGS.has('StructureServiceSlot7')).toBe(true)
    expect(STRUCTURE_CONTENT_FLAGS.has('StructureDeedBay')).toBe(true)
  })

  it('includes fighter tubes', () => {
    expect(STRUCTURE_CONTENT_FLAGS.has('FighterBay')).toBe(true)
    expect(STRUCTURE_CONTENT_FLAGS.has('FighterTube0')).toBe(true)
    expect(STRUCTURE_CONTENT_FLAGS.has('FighterTube4')).toBe(true)
  })
})

describe('DELIVERY_FLAGS', () => {
  it('includes both delivery flags', () => {
    expect(DELIVERY_FLAGS.has('Deliveries')).toBe(true)
    expect(DELIVERY_FLAGS.has('CorpDeliveries')).toBe(true)
  })

  it('has exactly 2 flags', () => {
    expect(DELIVERY_FLAGS.size).toBe(2)
  })
})

describe('ASSET_SAFETY_FLAGS', () => {
  it('includes AssetSafety flag', () => {
    expect(ASSET_SAFETY_FLAGS.has('AssetSafety')).toBe(true)
  })

  it('has exactly 1 flag', () => {
    expect(ASSET_SAFETY_FLAGS.size).toBe(1)
  })
})

describe('OFFICE_TYPE_ID', () => {
  it('is typeID 27', () => {
    expect(OFFICE_TYPE_ID).toBe(27)
  })
})

describe('DIVISION_FLAG_NAMES', () => {
  it('maps division flags to display names', () => {
    expect(DIVISION_FLAG_NAMES['CorpSAG1']).toBe('1st Division')
    expect(DIVISION_FLAG_NAMES['CorpSAG2']).toBe('2nd Division')
    expect(DIVISION_FLAG_NAMES['CorpSAG3']).toBe('3rd Division')
    expect(DIVISION_FLAG_NAMES['CorpSAG4']).toBe('4th Division')
    expect(DIVISION_FLAG_NAMES['CorpSAG5']).toBe('5th Division')
    expect(DIVISION_FLAG_NAMES['CorpSAG6']).toBe('6th Division')
    expect(DIVISION_FLAG_NAMES['CorpSAG7']).toBe('7th Division')
    expect(DIVISION_FLAG_NAMES['OfficeFolder']).toBe('Office Folder')
    expect(DIVISION_FLAG_NAMES['OfficeImpound']).toBe('Impounded')
  })
})

describe('OFFICE_DIVISION_FLAGS', () => {
  it('includes all corp SAG divisions', () => {
    for (let i = 1; i <= 7; i++) {
      expect(OFFICE_DIVISION_FLAGS.has(`CorpSAG${i}`)).toBe(true)
    }
  })

  it('includes special office flags', () => {
    expect(OFFICE_DIVISION_FLAGS.has('OfficeFolder')).toBe(true)
    expect(OFFICE_DIVISION_FLAGS.has('OfficeImpound')).toBe(true)
  })

  it('has exactly 9 flags', () => {
    expect(OFFICE_DIVISION_FLAGS.size).toBe(9)
  })
})
