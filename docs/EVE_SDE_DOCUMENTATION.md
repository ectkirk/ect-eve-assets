# EVE Online Static Data Export (SDE) - Official Documentation

## Overview

The **Static Data Export (SDE)** contains static game data that only changes with game updates. This is the authoritative source for EVE Online game data.

**Official Source**: https://developers.eveonline.com/static-data/

**Current Usage in jEveAssets**:
- jEveAssets now uses the official CCP SDE directly
- SDE module integrated into main codebase (`net.nikr.eve.jeveasset.io.sde`)
- Runtime auto-update checking on startup

---

## Data Formats

The SDE is available in two formats:

### JSON Lines (.jsonl)
- JSON keys must be strings
- When dataset contains integer keys, converted to list format:
  - `_key`: The actual key value
  - `_value`: The value (when not an object)

### YAML
- Supports integer keys natively (no special encoding)
- **Warning**: Large YAML files can be memory-intensive and slow
- For large datasets (mapMoons, etc.), prefer JSON Lines

---

## Download URLs

### Latest Version (Redirects)
| Format | URL |
|--------|-----|
| JSON Lines | `https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip` |
| YAML | `https://developers.eveonline.com/static-data/eve-online-static-data-latest-yaml.zip` |

### Specific Build Version
```
https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-<build-number>-<variant>.zip
```
Where `<variant>` is `jsonl` or `yaml`.

---

## Automation

For automated/programmatic access:

### 1. Get Latest Build Number
```
GET https://developers.eveonline.com/static-data/tranquility/latest.jsonl
```
The build number is in the record with key `sde`.

### 2. Download Specific Build
```
https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-<build-number>-jsonl.zip
https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-<build-number>-yaml.zip
```

### 3. Get Changes Since Last Build
```
https://developers.eveonline.com/static-data/tranquility/changes/<build-number>.jsonl
```
The record with key `_meta` contains `lastBuildNumber` (previous SDE version).

### HTTP Caching
- All resources support `ETag` and `Last-Modified` headers
- Resources only update when they actually change
- Non-static files cached for 5 minutes

---

## Schema

### Schema Documentation
Community-provided schemas available in the community resources section of the developer portal.

### Schema Changes
Documented at:
```
https://developers.eveonline.com/static-data/tranquility/schema-changelog.yaml
```

---

## Key Data Types (Glossary)

### Core Types

| Type | Description | SDE File | ESI Endpoint |
|------|-------------|----------|--------------|
| **Type** | Game objects (items, ships, modules) | `types.yaml` | `/universe/types/` |
| **Group** | Collection of related Types | `groups.yaml` | `/universe/groups/` |
| **Category** | Collection of related Groups (Ship, Module, etc.) | `categories.yaml` | `/universe/categories/` |
| **MetaGroup** | Tech-tier (T1/T2/T3/Faction) | `metaGroups.yaml` | N/A |
| **MarketGroup** | Market tab structure | `marketGroups.yaml` | `/markets/groups/` |
| **Attribute** | Type properties (HP, velocity, stats) | `dogmaAttributes.yaml` | `/dogma/attributes/` |
| **Effect** | Game logic/interactions | `dogmaEffects.yaml` | `/dogma/effects/` |
| **Icon** | Icon images | `icons.yaml` | N/A |
| **Graphic** | 3D model data | `graphics.yaml` | `/universe/graphics/` |

### Important Distinction
- **Type**: A class/definition (e.g., "Badger" ship type ID 648)
- **Item**: An individual instance of a type (e.g., your specific assembled Badger ship)

### Dogma
Collective term for Attributes, Effects, and the game logic around them.

---

## ID Ranges

### Entity ID Ranges

| From | To | Description |
|------|-----|-------------|
| 0 | 499,999 | Various (often reused) |
| 500,000 | 599,999 | Factions |
| 1,000,000 | 1,999,999 | NPC corporations |
| 3,000,000 | 3,999,999 | NPC characters (agents, CEOs) |
| 9,000,000 | 9,999,999 | Universes |
| 10,000,000 | 19,999,999 | Regions |
| 20,000,000 | 29,999,999 | Constellations |
| 30,000,000 | 39,999,999 | Solar systems |
| 40,000,000 | 49,999,999 | Celestials (suns, planets, moons) |
| 50,000,000 | 59,999,999 | Stargates |
| 60,000,000 | 69,999,999 | Stations |
| 70,000,000 | 79,999,999 | Asteroids |
| 90,000,000 | 97,999,999 | Characters (2010-11-03 to 2016-05-30) |
| 98,000,000 | 98,999,999 | Corporations (after 2010-11-03) |
| 99,000,000 | 99,999,999 | Alliances (after 2010-11-03) |
| 100,000,000 | 2,099,999,999 | Legacy characters/corps/alliances |
| 2,100,000,000+ | - | Modern characters |
| 1,000,000,000,000+ | - | Spawned items |

### Region ID Ranges

| From | To | Description |
|------|-----|-------------|
| 10,000,000 | 10,999,999 | New Eden (known space) |
| 11,000,000 | 11,999,999 | Wormhole regions |
| 12,000,000 | 12,999,999 | Abyssal regions |
| 14,000,000 | 14,999,999 | Void regions |
| 19,000,000 | 19,999,999 | Hidden regions |

### Solar System ID Ranges

| From | To | Description |
|------|-----|-------------|
| 30,000,000 | 30,999,999 | New Eden (known space) |
| 31,000,000 | 31,999,999 | Wormhole systems |
| 32,000,000 | 32,999,999 | Abyssal systems |
| 34,000,000 | 34,999,999 | Void systems |
| 36,000,000 | 36,999,999 | Hidden systems |

### Station ID Ranges

| From | To | Description |
|------|-----|-------------|
| 60,000,000 | 60,999,999 | NPC stations |
| 61,000,000 | 63,999,999 | Outposts |
| 66,000,000 | 67,999,999 | Station folders (corp offices) |
| 68,000,000 | 68,999,999 | Station folders (NPC) |
| 69,000,000 | 69,999,999 | Station folders (outposts) |

---

## Celestial Names

Celestial names are **not stored** in SDE (except rare exceptions). They're derived from:

| Celestial | Name Format |
|-----------|-------------|
| Stars | `<solarSystemName>` |
| Planets | `<orbitName> <celestialIndex>` (Roman numerals) |
| Moons | `<orbitName> - Moon <orbitIndex>` |
| Asteroid Belts | `<orbitName> - Asteroid Belt <orbitIndex>` |
| Stations (useOperationName=true) | `<orbitName> - <corporationName> <operationName>` |
| Stations (useOperationName=false) | `<orbitName> - <corporationName>` |
| Stargates | `Stargate (<destinationSolarSystemName>)` |

**Lookups required:**
- Stars: `solarSystemID` → `mapSolarSystems.name`
- Stations: `ownerID` → `npcCorporations.name`, `operationID` → `stationOperations`
- Stargates: `destination.solarSystemID` → `mapSolarSystems.name`

---

## Useful Formulae

### Skillpoints per Level

SP needed = `250 × rank × (√32)^(level-1)`

| Rank | L1 | L2 | L3 | L4 | L5 |
|------|-----|------|--------|---------|-----------|
| 1 | 250 | 1,414 | 8,000 | 45,254 | 256,000 |
| 2 | 500 | 2,828 | 16,000 | 90,509 | 512,000 |
| 5 | 1,250 | 7,071 | 40,000 | 226,274 | 1,280,000 |

### Skillpoints per Minute
```
SP/min = primaryAttribute + (secondaryAttribute / 2)
```

### Target Lock Time (seconds)
```
lockTime = 40000 / (scanResolution × asinh(signatureRadius)²)
```

### Alignment Time (seconds)
```
alignTime = -ln(0.25) × inertiaModifier × mass / 1,000,000
```

---

## Map Data

### Coordinate Systems

**Two coordinate systems:**

1. **Universe coordinates** (regions, constellations, systems)
   - Origin: Center of New Eden cluster (near Zarzakh)
   - Scale: 1.0 = 1 meter

2. **Solar system coordinates** (planets, moons, celestials)
   - Origin: The star (position [0, 0, 0])
   - Scale: 1.0 = 1 meter

### Universe Axes (Left-Handed)
- +X = East/Right, -X = West/Left
- +Y = Up, -Y = Down
- +Z = North/Forward, -Z = South/Backward

### Solar System Axes (Right-Handed)
- +X = West/Left, -X = East/Right
- +Y = Up, -Y = Down
- +Z = North/Forward, -Z = South/Backward

### Combining Coordinates
To get planet position in universe coordinates:
```
x = x_system - x_planet
y = y_system + y_planet
z = z_system + z_planet
```

**Note**: Use 64-bit doubles for precision (32-bit floats insufficient).

### Jump Drive Range
Systems are in jump range if:
```
distance = sqrt((x1-x2)² + (y1-y2)² + (z1-z2)²)
distance ≤ jumpRange × 9,460,000,000,000,000
```
**Important**: 1 lightyear = 9.46 × 10^15 meters (EVE's definition)

---

## Fitting Formats

### EFT (EVE Fitting Tool)
Human-readable format used for copy/paste in-game.

```
[Heron Navy Issue, Deepflow Rift Dredger]
Inertial Stabilizers II
Inertial Stabilizers II /offline

Scan Pinpointing Array II
...
```

### Ship DNA
Compact single-line format for chat links.
```
72904:4250;2:4258;1:11577;1:...::
```

### XML Fitting
File-based export/import format.
```xml
<fittings>
    <fitting name="Name">
        <shipType value="Ship Name"/>
        <hardware slot="low slot 0" type="Module Name"/>
        ...
    </fitting>
</fittings>
```

---

## Planetary Industry Extraction

Extraction values use decay and noise factors:

```python
def calculate_extractor_values(duration, cycle_time, quantity_per_cycle):
    decay_factor = 0.012  # Dogma attribute 1683
    noise_factor = 0.8    # Dogma attribute 1687

    num_iterations = duration // cycle_time
    bar_width = cycle_time / 900.0
    values = []

    for i in range(num_iterations):
        t = (i + 0.5) * bar_width
        decay_value = quantity_per_cycle / (1 + t * decay_factor)
        phase_shift = quantity_per_cycle ** 0.7

        sin_a = cos(phase_shift + t * (1/12))
        sin_b = cos(phase_shift / 2 + t * 0.2)
        sin_c = cos(t * 0.5)

        sin_stuff = max((sin_a + sin_b + sin_c) / 3, 0)
        bar_height = decay_value * (1 + noise_factor * sin_stuff)
        values.append(int(bar_width * bar_height))

    return values
```

---

## Route Calculation

### Using ESI (Simple)
```
POST https://esi.evetech.net/route/{origin}/{destination}
{
    "preference": "Shorter|Safer|LessSecure",
    "security_penalty": 50
}
```

### Custom Implementation
Use Dijkstra or A* with cost functions:

**Shorter**: `cost = 1.0`

**Safer**:
```python
penalty_cost = exp(0.15 * security_penalty)
if security <= 0.0: return 2 * penalty_cost
elif security < 0.45: return penalty_cost
else: return 0.90
```

**Less-Secure**:
```python
penalty_cost = exp(0.15 * security_penalty)
if security <= 0.0: return 2 * penalty_cost
elif security < 0.45: return 0.90
else: return penalty_cost
```

---

## jEveAssets SDE Integration

### SDE Module (Implemented)

jEveAssets now has a built-in SDE module (`net.nikr.eve.jeveasset.io.sde`) that:

1. **Downloads official SDE** from CCP's servers
2. **Parses JSONL format** using Gson (faster than YAML)
3. **Generates XML data files** for runtime use
4. **Auto-updates at runtime** (async check on startup)

### Data Generated from SDE

| Output File | SDE Sources | Contents |
|-------------|-------------|----------|
| `items.xml` | `types.jsonl`, `groups.jsonl`, `categories.jsonl`, `blueprints.jsonl`, `typeMaterials.jsonl` | Types, blueprints, materials |
| `locations.xml` | `mapRegions.jsonl`, `mapConstellations.jsonl`, `mapSolarSystems.jsonl`, `npcStations.jsonl` | Regions, systems, stations |
| `jumps.xml` | `mapStargates.jsonl` | Stargate connections |
| `flags.xml` | `RawConverter.LocationFlag` enum | Item location flags |
| `agents.xml` | `npcCharacters.jsonl` | NPC agents |
| `npccorporation.xml` | `npcCorporations.jsonl`, `factions.jsonl` | NPC corps |

### Usage

```bash
# Build-time: regenerate bundled data files
mvn compile exec:java@update-sde -Pjdk21

# Runtime: automatic check on startup (async, non-blocking)
# Downloads to ~/.jeveassets/sde-cache/ if newer version available
```

### Advantages
- Authoritative source (no third-party dependency)
- Automatic updates without app releases
- Build number tracking for version management
- All item data always available (no "unknown item" fallback needed)

---

## Resources

| Resource | URL |
|----------|-----|
| Developer Portal | https://developers.eveonline.com/ |
| Static Data Page | https://developers.eveonline.com/static-data/ |
| Schema Changelog | https://developers.eveonline.com/static-data/tranquility/schema-changelog.yaml |
| Latest Build Info | https://developers.eveonline.com/static-data/tranquility/latest.jsonl |
| ESI API | https://esi.evetech.net |
