import { describe, it, expect, vi } from 'vitest'
import { cn, formatNumber, formatFullNumber, formatVolume } from './utils'

vi.mock('@/store/settings-store', () => ({
  getLanguage: vi.fn(() => 'en'),
}))

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const condition = false
    expect(cn('base', condition && 'excluded', 'included')).toBe(
      'base included'
    )
  })

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('merges Tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles objects', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('handles complex combinations', () => {
    expect(cn('base', ['arr1', 'arr2'], { obj: true }, undefined, 'end')).toBe(
      'base arr1 arr2 obj end'
    )
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })

  it('returns empty string for all falsy inputs', () => {
    expect(cn(false, null, undefined, '')).toBe('')
  })
})

describe('formatNumber', () => {
  it('formats trillions', () => {
    expect(formatNumber(1_500_000_000_000)).toBe('1.50T')
    expect(formatNumber(2_000_000_000_000)).toBe('2.00T')
  })

  it('formats billions', () => {
    expect(formatNumber(1_500_000_000)).toBe('1.50B')
    expect(formatNumber(999_000_000)).toBe('999.00M')
  })

  it('formats millions', () => {
    expect(formatNumber(1_500_000)).toBe('1.50M')
    expect(formatNumber(999_000)).toBe('999.00K')
  })

  it('formats thousands', () => {
    expect(formatNumber(1_500)).toBe('1.50K')
    expect(formatNumber(999)).toBe('999')
  })

  it('formats small numbers with locale', () => {
    expect(formatNumber(500)).toBe('500')
    expect(formatNumber(0)).toBe('0')
  })

  it('handles negative numbers', () => {
    expect(formatNumber(-1_500_000_000)).toBe('-1.50B')
    expect(formatNumber(-1_500_000)).toBe('-1.50M')
    expect(formatNumber(-1_500)).toBe('-1.50K')
    expect(formatNumber(-500)).toBe('-500')
  })
})

describe('formatFullNumber', () => {
  it('formats with thousand separators', () => {
    expect(formatFullNumber(1234567)).toBe('1,234,567')
    expect(formatFullNumber(1000)).toBe('1,000')
  })

  it('respects decimal parameter', () => {
    expect(formatFullNumber(1234.567, 2)).toBe('1,234.57')
    expect(formatFullNumber(1234.5, 0)).toBe('1,235')
  })
})

describe('formatVolume', () => {
  it('formats without suffix by default', () => {
    expect(formatVolume(1234.56)).toBe('1,234.56')
  })

  it('adds suffix when requested', () => {
    expect(formatVolume(1234.56, { suffix: true })).toBe('1,234.56 m³')
  })

  it('respects decimal parameter', () => {
    expect(formatVolume(1234.56, { decimals: 0 })).toBe('1,235')
  })
})
