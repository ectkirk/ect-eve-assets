# edencom.net API Documentation

Base URL: `https://edencom.net/api/v1`

OpenAPI Spec: `https://edencom.net/api/v1/openapi.json`

## Endpoints

### POST /types

Bulk fetch type information including market prices, reprocessing materials, and blueprint data.

**URL**: `POST /types?market={market}`

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| market | string | No | jita | Market to use for prices. Options: `jita`, `the_forge` |

**Request Body**:
```json
{
  "ids": [587, 34, 35]
}
```

**Response**:
```json
{
  "items": {
    "587": {
      "id": 587,
      "name": "Rifter",
      "groupId": 25,
      "groupName": "Frigate",
      "categoryId": 6,
      "categoryName": "Ship",
      "volume": 27289,
      "packagedVolume": 2500,
      "basePrice": 400000,
      "marketPrice": {
        "adjusted": "403383.05833136983",
        "average": "339354.09",
        "system": {
          "highestBuy": 310000,
          "lowestSell": 335000
        },
        "region": {
          "highestBuy": 314100,
          "lowestSell": 339300
        }
      },
      "reprocessingMaterials": [
        {"typeId": 34, "typeName": "Tritanium", "quantity": 13333},
        {"typeId": 35, "typeName": "Pyerite", "quantity": 3333},
        {"typeId": 36, "typeName": "Mexallon", "quantity": 1333}
      ],
      "blueprint": {
        "id": 691,
        "name": "Rifter Blueprint",
        "materials": [
          {"typeId": 34, "typeName": "Tritanium", "quantity": 32000},
          {"typeId": 35, "typeName": "Pyerite", "quantity": 6000},
          {"typeId": 36, "typeName": "Mexallon", "quantity": 2500},
          {"typeId": 37, "typeName": "Isogen", "quantity": 500}
        ]
      }
    }
  }
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| id | number | Type ID |
| name | string | Type name |
| groupId | number | Group ID |
| groupName | string | Group name |
| categoryId | number | Category ID |
| categoryName | string | Category name |
| volume | number | Assembled volume (m³) |
| packagedVolume | number | Packaged volume (m³) |
| basePrice | number | Base price from SDE |
| marketPrice | object | Current market prices (hierarchical) |
| marketPrice.adjusted | string | CCP adjusted price |
| marketPrice.average | string | Average price |
| marketPrice.station | object | Station-level prices (when station_id provided) |
| marketPrice.system | object | System-level prices |
| marketPrice.region | object | Region-level prices |
| marketPrice.*.highestBuy | number | Highest buy order at that level |
| marketPrice.*.lowestSell | number | Lowest sell order at that level |
| reprocessingMaterials | array | Materials from reprocessing |
| blueprint | object | Blueprint info if item is manufactured |

---

### POST /universe

Bulk resolve universe entity IDs (regions, constellations, systems, stations) to names.

**URL**: `POST /universe`

**Request Body**:
```json
{
  "ids": [30000142, 60003760]
}
```

**Response**:
```json
{
  "items": {
    "30000142": {
      "type": "system",
      "name": "Jita"
    },
    "60003760": {
      "type": "station",
      "name": "Jita IV - Moon 4 - Caldari Navy Assembly Plant"
    }
  }
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| type | string | Entity type: `region`, `constellation`, `system`, `station` |
| name | string | Entity name |

---

### GET /blueprint-research

Calculate blueprint ME/TE research times and costs with all modifiers applied (facility, skills, implants, rigs, security status).

**URL**: `GET /blueprint-research?blueprint_id={id}&system_id={id}&...`

**Required Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| blueprint_id | integer | Blueprint type ID |
| system_id | integer | Solar system ID for cost index lookup |

**Optional Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| facility | integer | 0 | 0=Station, 1=Raitaru, 2=Azbel, 3=Sotiyo, 4=Other |
| metallurgy_level | integer | 0 | Metallurgy skill level (ME research) |
| research_level | integer | 0 | Research skill level (TE research) |
| science_level | integer | 0 | Science skill level (copying) |
| advanced_industry_level | integer | 0 | Advanced Industry skill level |
| me_implant | number | 1 | ME research implant modifier (e.g., 0.97 for 3% bonus) |
| te_implant | number | 1 | TE research implant modifier |
| copy_implant | number | 1 | Copying implant modifier |
| me_rig | integer | 0 | ME research rig (0=None, 1=T1, 2=T2) |
| te_rig | integer | 0 | TE research rig (0=None, 1=T1, 2=T2) |
| copy_rig | integer | 0 | Copying rig (0=None, 1=T1, 2=T2) |
| security_status | string | h | System security for rig bonus (h=highsec, l=lowsec, n=nullsec) |
| facility_tax | number | - | Custom facility tax rate (0-1) |
| faction_warfare_bonus | boolean | false | Apply FW bonus (-50% system cost index) |
| runs_per_copy | integer | 1 | Number of runs per blueprint copy |

**Response**:
```json
{
  "blueprint": { "id": 691, "name": "Rifter Blueprint" },
  "systemId": 30000142,
  "facility": "Station",
  "costIndices": {
    "researching_material_efficiency": 0.0234,
    "researching_time_efficiency": 0.0189,
    "copying": 0.0156
  },
  "modifiers": {
    "facility": "Station",
    "skills": { "metallurgy": 5, "research": 5, "science": 5, "advancedIndustry": 5 },
    "implants": { "me": 1, "te": 1, "copy": 1 },
    "rigs": { "me": "None", "te": "None", "copy": "None" },
    "securityStatus": "h",
    "factionWarfareBonus": false
  },
  "meResearch": [
    {
      "level": 1,
      "duration": 105,
      "durationFormatted": "1m 45s",
      "cost": 12500,
      "cumulativeDuration": 105,
      "cumulativeDurationFormatted": "1m 45s",
      "cumulativeCost": 12500
    }
  ],
  "teResearch": [...],
  "copying": {
    "baseTime": 300,
    "runsPerCopy": 1,
    "duration": 225,
    "durationFormatted": "3m 45s",
    "installationCost": 5000,
    "materials": [],
    "materialsCost": 0,
    "totalCost": 5000,
    "maxRuns": 10,
    "copiesIn30Days": 50
  }
}
```

---

### GET /manufacturing-cost

Calculate manufacturing costs including materials, job fees, and time with all modifiers applied (ME/TE, facility, skills, rigs, security status).

**URL**: `GET /manufacturing-cost?product_id={id}&system_id={id}&...` or `GET /manufacturing-cost?blueprint_id={id}&system_id={id}&...`

**Required Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| product_id OR blueprint_id | integer | Product type ID or blueprint type ID (mutually exclusive) |
| system_id | integer | Solar system ID for cost index lookup |

**Optional Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| me | integer | 0 | Material Efficiency level (0-10) |
| te | integer | 0 | Time Efficiency level (0, 2, 4, ... 20) |
| runs | integer | 1 | Number of manufacturing runs |
| facility | integer | 0 | 0=Station, 1=Raitaru, 2=Azbel, 3=Sotiyo, 4=Other |
| facility_type_id | integer | - | Structure type ID (overrides facility) |
| me_rig | integer | 0 | Material Efficiency rig (0=None, 1=T1, 2=T2) |
| te_rig | integer | 0 | Time Efficiency rig (0=None, 1=T1, 2=T2) |
| rig_type_id | integer | - | Structure rig type ID from database |
| rig_type_ids | string | - | Comma-separated list of structure rig type IDs |
| security_status | string | - | System security for rig bonus (h, l, n) |
| facility_tax | number | - | Custom facility tax rate (0-1) |
| use_buy_orders | boolean | false | Use buy order prices for materials |
| alpha_clone | boolean | false | Apply alpha clone tax (+0.25%) |
| system_cost_bonus | number | 0 | FW cost bonus (-0.5 to 0) |
| industry | integer | 5 | Industry skill level |
| advanced_industry | integer | 5 | Advanced Industry skill level |

**Response**:
```json
{
  "productId": 587,
  "blueprintId": 691,
  "runs": 10,
  "me": 10,
  "te": 20,
  "units": 10,
  "unitsPerRun": 1,
  "time": "PT2H30M",
  "timePerRun": "PT15M",
  "timePerUnit": "PT15M",
  "materials": {
    "34": {
      "type_id": 34,
      "type_name": "Tritanium",
      "quantity": 288000,
      "volume_per_unit": 0.01,
      "volume": 2880,
      "cost_per_unit": 5.5,
      "cost": 1584000
    }
  },
  "materialsVolume": 3500.5,
  "productVolume": 25000,
  "estimatedItemValue": 4000000,
  "systemCostIndex": 125000,
  "systemCostBonuses": -12500,
  "facilityTax": 5000,
  "sccSurcharge": 160000,
  "alphaCloneTax": 0,
  "totalJobCost": 277500,
  "totalMaterialCost": 2500000,
  "totalCost": 2777500,
  "totalCostPerRun": 277750,
  "totalCostPerUnit": 277750
}
```

---

### GET /blueprints

List all published blueprints with their product information. Ideal for autocomplete/search functionality.

**URL**: `GET /blueprints`

**Response**:
```json
[
  {
    "id": 691,
    "name": "Rifter Blueprint",
    "productId": 587,
    "productName": "Rifter"
  },
  {
    "id": 692,
    "name": "Rifter Fleet Issue Blueprint",
    "productId": 17703,
    "productName": "Rifter Fleet Issue"
  }
]
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| id | number | Blueprint type ID |
| name | string | Blueprint name |
| productId | number | Product type ID (manufactured item) |
| productName | string | Product name |

**Notes**:
- Returns ~4,150 blueprints
- Sorted alphabetically by name
- Use for autocomplete in manufacturing/research calculators
- For Manufacturing: search by `productName`, use `productId`
- For Research: search by `name`, use `id`

---

### GET /systems

List all empire solar systems for autocomplete/location selection.

**URL**: `GET /systems`

**Response**:
```json
[
  {
    "id": 30000142,
    "name": "Jita",
    "security": 0.9
  },
  {
    "id": 30002187,
    "name": "Amarr",
    "security": 1.0
  }
]
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| id | number | Solar system ID |
| name | string | System name (English) |
| security | number | Security status rounded to 1 decimal |

**Notes**:
- Returns ~5,430 systems (empire space only, excludes wormholes)
- Use for autocomplete in industry calculators
- Security values: 1.0 to -1.0 (highsec ≥0.5, lowsec 0.1-0.4, nullsec ≤0)

---

### POST /ships

Bulk lookup ship/structure slot counts for fitting display.

**URL**: `POST /ships`

**Request Body**:
```json
{
  "ids": [587, 24690]
}
```

**Response**:
```json
{
  "ships": {
    "587": {
      "id": 587,
      "name": "Rifter",
      "groupId": 25,
      "groupName": "Frigate",
      "slots": {
        "high": 4,
        "mid": 2,
        "low": 3,
        "rig": 3,
        "subsystem": 0,
        "launcher": 1,
        "turret": 3
      }
    }
  }
}
```

**Notes**:
- Accepts up to 500 IDs per request
- Only returns data for ships (category 6) and structures (category 65)

---

## Usage Notes

- Both endpoints accept up to 1000 IDs per request
- For larger datasets, batch requests in chunks of 1000
- The `/types` endpoint replaces multiple ESI calls:
  - `GET /universe/types/{type_id}/` - type info
  - `GET /markets/prices/` - market prices
  - No need for separate capital prices endpoint (included automatically)
- The `/universe` endpoint replaces:
  - `POST /universe/names/` - for NPC stations, systems, regions
  - Does NOT resolve player structures (use ESI with auth for those)

## Migration from ESI

| Old Source | New Source |
|------------|------------|
| ESI `/universe/types/{id}/` | ref `/types` |
| ESI `/universe/names/` | ref `/universe` |
| ESI `/markets/prices/` | ref `/types` (marketPrice field) |
| buyback.edencom.net capital prices | ref `/types` (included) |
| data.everef.net structures | Removed (use ESI auth for player structures) |
