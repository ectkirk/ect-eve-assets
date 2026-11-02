import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, TableHeader, TableHead, TableRow } from './table'
import { MIN_COLUMN_WIDTH } from './column-resize-handle'

function renderTable(onHeaderClick = vi.fn()) {
  render(
    <Table resizeKey="test">
      <TableHeader>
        <TableRow>
          <TableHead columnId="name" onClick={onHeaderClick}>
            Name
          </TableHead>
          <TableHead columnId="price">Price</TableHead>
          <TableHead>Static</TableHead>
        </TableRow>
      </TableHeader>
    </Table>,
  )
  return onHeaderClick
}

function header(name: string): HTMLElement {
  return screen.getByRole('columnheader', { name: new RegExp(name) })
}

function handleOf(name: string): HTMLElement {
  const handle = header(name).querySelector<HTMLElement>('[role="separator"]')
  if (!handle) throw new Error(`no resize handle for ${name}`)
  return handle
}

function storedWidths(): Record<string, number> {
  return JSON.parse(
    localStorage.getItem('column-widths:test') ?? '{}',
  ) as Record<string, number>
}

describe('Table column resizing', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds a resize handle only to headers with a column id', () => {
    renderTable()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    expect(header('Static').querySelector('[role="separator"]')).toBeNull()
  })

  it('does not add handles to tables without a resize key', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead columnId="name">Name</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    )
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('resizes with the keyboard, persists, and switches to fixed layout', () => {
    renderTable()
    fireEvent.keyDown(handleOf('Name'), { key: 'ArrowRight' })

    expect(storedWidths()['name']).toBeGreaterThan(0)
    expect(header('Name').style.width).toBe(`${storedWidths()['name']}px`)
    expect(screen.getByRole('table').style.tableLayout).toBe('fixed')
  })

  it('never shrinks a column below the minimum width', () => {
    localStorage.setItem(
      'column-widths:test',
      JSON.stringify({ name: MIN_COLUMN_WIDTH + 5 }),
    )
    renderTable()
    fireEvent.keyDown(handleOf('Name'), { key: 'ArrowLeft' })
    fireEvent.keyDown(handleOf('Name'), { key: 'ArrowLeft' })
    expect(storedWidths()['name']).toBe(MIN_COLUMN_WIDTH)
  })

  it('restores stored widths on mount', () => {
    localStorage.setItem(
      'column-widths:test',
      JSON.stringify({ name: 222, price: 88 }),
    )
    renderTable()
    expect(header('Name').style.width).toBe('222px')
    expect(header('Price').style.width).toBe('88px')
  })

  it('double-click resets the table to its default layout', () => {
    localStorage.setItem('column-widths:test', JSON.stringify({ name: 222 }))
    renderTable()
    fireEvent.doubleClick(handleOf('Name'))
    expect(localStorage.getItem('column-widths:test')).toBeNull()
    expect(header('Name').style.width).toBe('')
    expect(screen.getByRole('table').style.tableLayout).toBe('')
  })

  it('does not trigger the header click (sort) when using the handle', () => {
    const onHeaderClick = renderTable()
    fireEvent.click(handleOf('Name'))
    fireEvent.doubleClick(handleOf('Name'))
    expect(onHeaderClick).not.toHaveBeenCalled()
  })
})
