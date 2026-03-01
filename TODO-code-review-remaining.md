# Remaining Medium-Severity Code Review Issues

24 medium-severity issues existed from the 4-agent deep code review.
All critical (0) and high (9) issues were resolved previously. 10 of 34 medium issues were resolved previously.

## Status: 22 of 24 remaining issues resolved this session

### Resolved Issues

| ID | Issue | File | Resolution |
|----|-------|------|------------|
| S-M4 | pendingItemFetches/pendingBidFetches never cleared on error | `contracts-store.ts` | Wrapped in try/finally with clearPendingFetches helper |
| E-M1 | Race condition in inflight request deduplication | `esi/index.ts` | Store promise synchronously before any awaits |
| S-M7 | Shared mutable context in parallel Promise.all | `regional-market-update.ts` | Fetch-then-apply pattern: parallel fetch, sequential mutation |
| S-M3 | onAfterOwnerUpdate receives stale state | `create-owner-store.ts` | Re-read state via get() after await |
| S-M2 | startJitaRefreshTimer never restarts after clearJita | `price-store.ts` | Call startJitaRefreshTimer() at end of clearJita() |
| S-M5 | Missing initialized check in ansiblex-store init() | `ansiblex-store.ts` | Added if (get().initialized) return guard |
| S-M8 | removeStaleItems mutates input Map in-place | `create-visibility-store.ts` | Returns new Map + staleIds instead of mutating |
| A-M1 | referenceDataPromise cleared in .finally() | `ref-data-loader.ts` | Clear on success only; delayed clear on rejection |
| A-M2 | Universe data marked loaded on failure | `ref-universe-loader.ts` | Sub-loaders return boolean; logs partial failure warning |
| A-M3 | Empty chunk pushed when typeIds is empty | `ref-market.ts` | Confirmed: existing guard handles this; chunk is intentional for firstChunk logic |
| A-M4 | Math.max(...slotMap.keys(), -1) fragile | `fitting-utils.ts` | Explicit empty check: slotMap.size === 0 ? -1 : Math.max(...) |
| A-M6 | Synthetic item_id overflow risk | `asset-resolver.ts` | Reduced multiplier from 1_000_000 to 1_000; documented safe range |
| A-M7 | triggerResolution setTimeout never cleared | `data-resolver.ts` | Exported cleanupResolutionTimer() function |
| A-M8 | incursions.ts no Zod validation | `incursions.ts` | Added ESIIncursionSchema with full Zod validation |
| A-M9/10 | getCharacterPublic trailing slash + no Zod | `corporation.ts` | Removed trailing slash; added ESICharacterPublicSchema |
| E-M3 | characterTokens in memory indefinitely | `main.ts` | Clear on suspend/lock-screen + 30min idle timeout |
| E-M5 | refGetPaginated unused channel parameter | `ref-api.ts` | Documented: intentionally used only for error context |
| E-M6 | Cached headers shared mutable refs | `ref-api.ts` | Object.freeze() + Readonly types |
| R-M2 | FittingDialog inside scroll container | `TreeTable.tsx` | Moved outside scroll container as sibling |
| R-M3 | getCopyData missing useCallback deps | `TreeTable.tsx` | Confirmed: all refs are module-level; empty [] is correct |
| R-M7 | WindowControls missing focus trap | `WindowControls.tsx` | Added useFocusTrap hook + ARIA menu roles |
| R-M8 | StructuresTab 5 boolean+data state pairs | `StructuresTab.tsx` | Consolidated into DialogState discriminated union |

### Deferred Issues (1)

#### R-M9: StarMap component ~870 lines
- **File:** `src/features/tools/map/StarMap.tsx`
- **Problem:** Enormous component, hard to reason about re-render triggers.
- **Status:** Confirmed but deferred — requires dedicated refactoring session.
- **Recommended extraction:**
  1. `useMapRoute` — route state, pathfinder graph, ignored systems (~80 lines)
  2. `useMapInteraction` — canvas mouse handlers, context menu, highlighted system/region (~130 lines)
  3. `useMapData` — systems/regions/stargates filtering, coordinateData, spatialIndex (~80 lines)
  4. `useCanvasRenderer` — the large rendering useEffect (~150 lines)
