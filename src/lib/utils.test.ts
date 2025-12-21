import { describe, it, expect } from 'vitest'
import { cn, formatNumber, formatISK } from './utils'

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

describe('formatISK', () => {
  it('appends ISK suffix', () => {
    expect(formatISK(1_500_000_000)).toBe('1.50B ISK')
    expect(formatISK(1_500_000)).toBe('1.50M ISK')
    expect(formatISK(1_500)).toBe('1.50K ISK')
    expect(formatISK(500)).toBe('500 ISK')
  })

  it('handles negative values', () => {
    expect(formatISK(-1_500_000)).toBe('-1.50M ISK')
  })
})
