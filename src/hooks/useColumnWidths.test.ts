import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useColumnWidths } from './useColumnWidths'

describe('useColumnWidths', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useColumnWidths('orders'))
    expect(result.current.widths).toEqual({})
  })

  it('loads stored widths and ignores invalid entries', () => {
    localStorage.setItem(
      'column-widths:orders',
      JSON.stringify({ item: 250, bad: 'wide', zero: 0 }),
    )
    const { result } = renderHook(() => useColumnWidths('orders'))
    expect(result.current.widths).toEqual({ item: 250 })
  })

  it('persists widths per table key', () => {
    const { result } = renderHook(() => useColumnWidths('orders'))
    act(() => {
      result.current.setWidths({ item: 300, price: 90 })
    })
    expect(result.current.widths).toEqual({ item: 300, price: 90 })
    expect(
      JSON.parse(localStorage.getItem('column-widths:orders') ?? '{}'),
    ).toEqual({ item: 300, price: 90 })
    expect(localStorage.getItem('column-widths:contracts')).toBeNull()
  })

  it('reset clears state and storage', () => {
    localStorage.setItem('column-widths:orders', JSON.stringify({ item: 250 }))
    const { result } = renderHook(() => useColumnWidths('orders'))
    act(() => {
      result.current.resetWidths()
    })
    expect(result.current.widths).toEqual({})
    expect(localStorage.getItem('column-widths:orders')).toBeNull()
  })
})
