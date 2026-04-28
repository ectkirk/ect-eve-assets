# React Compiler TanStack Migration

## Goal

Remove React Compiler lint warnings caused by TanStack hooks while preserving the current table and virtualized-list behavior.

The current warnings are from:

- `@tanstack/react-virtual`: fixed-height virtual rows across assets, trees, order lists, and reference panels.
- `@tanstack/react-table`: sorting, column visibility, sizing, and cell rendering in the assets table.

## Phase 1: Replace React Virtual

Status: complete.

Goal: remove `@tanstack/react-virtual` from application code and dependencies.

Approach:

- Add a small local fixed-height virtualizer hook.
- Keep the current rendering model: total scroll height, visible row indexes, and start/end spacers.
- Preserve existing overscan values and row heights per surface.
- Validate scrolling, row selection, context menus, and empty states.

Impacted surfaces:

- `src/components/tree/TreeTable.tsx`
- `src/features/assets/AssetsTab.tsx`
- `src/features/market-orders/OrdersTable.tsx`
- `src/features/tools/reference/CategoryGroupTree.tsx`
- `src/features/tools/regional-market/MarketGroupTree.tsx`
- `src/features/tools/regional-market/OrderDetailPanel.tsx`
- `src/features/tools/regional-market/TypeListPanel.tsx`

Considerations:

- Current usage assumes fixed row heights. If any surface later needs dynamic row heights, the local hook should not be stretched into a general-purpose virtualizer without a design pass.
- Scroll containers must have stable heights. Incorrect container sizing will affect visible row calculation.
- Keyboard selection and copy behavior depend on rendered row order, not all rows being mounted.
- Context menus and double-click handlers must continue to receive the original row data by virtual index.

Outcome:

- Added `src/hooks/use-fixed-virtual-rows.ts` for fixed-height virtualization.
- Replaced all application `useVirtualizer` call sites.
- Removed `@tanstack/react-virtual` from dependencies and Vite manual chunks.
- Reduced React Compiler lint output to the remaining `@tanstack/react-table` warning in `AssetsTab`.

## Phase 2: Replace React Table

Status: in progress.

Goal: remove `@tanstack/react-table` from the assets table.

Approach:

- Convert asset column definitions to local column metadata.
- Implement local sorting and visible-column filtering.
- Preserve persisted column visibility and the tab column dropdown.
- Preserve cell renderers, column sizing, and header sorting behavior.

Impacted surfaces:

- `src/features/assets/AssetsTab.tsx`
- `src/features/assets/columns.tsx`
- `src/features/assets/types.ts`

Considerations:

- The assets table is a primary workflow and should be tested more carefully than the virtualizer swap.
- Existing column definitions use TanStack types and render helpers, so this phase touches both data behavior and rendering structure.
- Sorting must match current behavior, especially for numeric totals, text names, and hidden columns.

## Phase 3: Remove Dependencies

Goal: remove unused TanStack packages after code migration.

Steps:

- Remove `@tanstack/react-virtual` after Phase 1.
- Remove `@tanstack/react-table` after Phase 2.
- Run `npm install` or `npm uninstall` to update `package-lock.json`.
- Run typecheck, lint, unit tests, and targeted manual UI checks.

## Validation

Minimum checks:

```bash
npm run typecheck
npm run lint
npm test
```

Manual checks:

- Large asset table scrolls smoothly and preserves selection/context menus.
- Asset tree expands, collapses, scrolls, and copy/select behavior still works.
- Market orders and regional market panels scroll correctly.
- Reference category/group tree scrolls and selection stays aligned.
