# ref.edencom.net API Documentation

Base URL: `https://ref.edencom.net/api/v1`

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
        "highestBuy": 314100,
        "lowestSell": 339300
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
| marketPrice | object | Current market prices |
| marketPrice.adjusted | string | CCP adjusted price |
| marketPrice.average | string | Average price |
| marketPrice.highestBuy | number | Highest buy order |
| marketPrice.lowestSell | number | Lowest sell order |
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
