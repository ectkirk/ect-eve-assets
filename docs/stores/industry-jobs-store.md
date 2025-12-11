# Industry Jobs Store

Manages manufacturing, research, and other industry jobs for characters and corporations.

## Overview

| Property | Value |
|----------|-------|
| **File** | `src/store/industry-jobs-store.ts` |
| **Endpoint File** | `src/api/endpoints/industry.ts` |
| **IndexedDB** | `ecteveassets-industry-jobs` |
| **Update Cooldown** | 5 minutes |
| **Owner Types** | Character, Corporation |

## ESI Endpoints

| Endpoint | Method | Paginated | Scope |
|----------|--------|-----------|-------|
| `/characters/{character_id}/industry/jobs` | GET | No | `esi-industry.read_character_jobs.v1` |
| `/corporations/{corporation_id}/industry/jobs` | GET | Yes | `esi-industry.read_corporation_jobs.v1` |

## Data Types

### ESIIndustryJob (from ESI)

```typescript
interface ESIIndustryJob {
  job_id: number
  installer_id: number          // Character who started the job
  facility_id: number           // Station/structure ID
  activity_id: number           // 1=Manufacturing, 3=TE, 4=ME, 5=Copying, etc.
  blueprint_id: number          // Item ID of the blueprint
  blueprint_type_id: number     // Type ID of the blueprint
  blueprint_location_id: number
  output_location_id: number
  runs: number                  // Number of runs
  duration: number              // Job duration in seconds
  start_date: string            // ISO date
  end_date: string              // ISO date
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted'
  cost?: number                 // Installation cost
  licensed_runs?: number        // For copying jobs
  probability?: number          // For invention jobs
  product_type_id?: number      // Output type ID (for manufacturing/invention)
  successful_runs?: number      // For invention jobs
  completed_date?: string       // When job was delivered
  completed_character_id?: number
  pause_date?: string
  station_id?: number
}
```

### Activity IDs

| ID | Activity |
|----|----------|
| 1 | Manufacturing |
| 3 | Time Efficiency Research |
| 4 | Material Efficiency Research |
| 5 | Copying |
| 7 | Reverse Engineering |
| 8 | Invention |
| 9 | Reactions |

### OwnerJobs (internal)

```typescript
interface OwnerJobs {
  owner: Owner
  jobs: ESIIndustryJob[]
}
```

## Data Flow

### Update (`update()`)

```
1. Check cooldown (5 minutes)
2. Get all owners (characters + corporations)
3. For each owner:
   a. If corporation: getCorporationIndustryJobs() (paginated)
   b. If character: getCharacterIndustryJobs() (single fetch)
4. Save to IndexedDB
```

### Character vs Corporation

| Owner Type | Endpoint | Pagination |
|------------|----------|------------|
| Character | `/characters/{id}/industry/jobs` | No (`fetch()`) |
| Corporation | `/corporations/{id}/industry/jobs` | Yes (`fetchWithPagination()`) |

Corporation jobs typically have more entries (all corp members' jobs), hence pagination support.

## Storage

### IndexedDB Schema

**Database:** `ecteveassets-industry-jobs` (version 1)

| Object Store | Key Path | Contents |
|--------------|----------|----------|
| `jobs` | `ownerKey` | `{ ownerKey, owner, jobs[] }` |
| `meta` | `key` | `lastUpdated` |

## Integration with Asset Store

The asset store uses industry job `product_type_id` to fetch prices:

```typescript
// From asset-store.ts:317-325
const industryJobs = useIndustryJobsStore.getState().jobsByOwner
for (const { jobs } of industryJobs) {
  for (const job of jobs) {
    if (job.product_type_id) {
      typeIds.add(job.product_type_id)
    }
  }
}
```

This ensures prices are available for items being manufactured.

## ESI Spec Verification

### GET /characters/{character_id}/industry/jobs

| Field | Our Schema | Notes |
|-------|------------|-------|
| `job_id` | number | ✓ |
| `installer_id` | number | ✓ |
| `facility_id` | number | ✓ |
| `activity_id` | number | ✓ |
| `blueprint_id` | number | ✓ |
| `blueprint_type_id` | number | ✓ |
| `blueprint_location_id` | number | ✓ |
| `output_location_id` | number | ✓ |
| `runs` | number | ✓ |
| `duration` | number | ✓ |
| `start_date` | string | ✓ |
| `end_date` | string | ✓ |
| `status` | enum | ✓ |
| `cost` | number (optional) | ✓ |
| `licensed_runs` | number (optional) | ✓ |
| `probability` | number (optional) | ✓ |
| `product_type_id` | number (optional) | ✓ |
| `successful_runs` | number (optional) | ✓ |
| `completed_date` | string (optional) | ✓ |
| `completed_character_id` | number (optional) | ✓ |
| `pause_date` | string (optional) | ✓ |
| `station_id` | number (optional) | ✓ |

## Code References

| Location | Purpose |
|----------|---------|
| `src/store/industry-jobs-store.ts:184-259` | `update()` - main update flow |
| `src/store/industry-jobs-store.ts:215-218` | Character vs corp routing |
| `src/api/endpoints/industry.ts:8-27` | `getCharacterIndustryJobs()` |
| `src/api/endpoints/industry.ts:29-38` | `getCorporationIndustryJobs()` |

## Potential Issues

None identified. Implementation correctly handles:
- Character jobs (single fetch)
- Corporation jobs (paginated)
- Both owner types
