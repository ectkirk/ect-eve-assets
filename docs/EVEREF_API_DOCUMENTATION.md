# EVE Ref API Documentation

EVE Ref (everef.net) provides reference data APIs for EVE Online third-party development.

**Status**: APIs are in development and subject to change.

---

## API Endpoints

| API | Base URL | Purpose |
|-----|----------|---------|
| Industry Cost API | `https://api.everef.net` | Industry job cost calculations |
| Reference Data API | `https://ref-data.everef.net` | Static game data (types, blueprints, dogma, etc.) |

---

## 1. Industry Cost API

**Base URL**: `https://api.everef.net/v1`

### GET /industry/cost

Calculate industry job costs for manufacturing, invention, copying, and reactions.

#### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `product_id` | int | - | Type ID of desired product |
| `blueprint_id` | int | - | Blueprint type ID (alternative to product_id) |
| `me` | int | 0 | Material Efficiency (0-10) |
| `te` | int | 0 | Time Efficiency (0-20) |
| `runs` | int | 1 | Number of runs |
| `decryptor_id` | int | - | Decryptor type ID (invention only) |

#### Location Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `system_id` | int | Solar system ID (resolves security/cost indices) |
| `security` | string | Security class override |
| `structure_type_id` | int | Facility type ID (NPC station if omitted) |
| `rig_id` | int[] | Engineering rig type IDs (repeatable) |

#### Cost Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `facility_tax` | decimal | Facility tax rate |
| `system_cost_bonus` | decimal | System cost bonus modifier |
| `manufacturing_cost` | decimal | Manufacturing cost index override |
| `invention_cost` | decimal | Invention cost index override |
| `copying_cost` | decimal | Copying cost index override |
| `reaction_cost` | decimal | Reaction cost index override |
| `researching_me_cost` | decimal | ME research cost index override |
| `researching_te_cost` | decimal | TE research cost index override |
| `alpha` | bool | Alpha clone (applies 2% tax) |
| `material_prices` | enum | Price source (see below) |

**Material Price Sources**:
- `ESI_AVG` (default)
- `FUZZWORK_BUY`
- `FUZZWORK_SELL`
- `FUZZWORK_SPLIT`

#### Skill Parameters

All skills default to 5, range 0-5:

**Industry Skills**:
- `industry`, `advanced_industry`, `mass_production`, `advanced_mass_production`
- `reactions`, `mass_reactions`, `advanced_mass_reactions`

**Research Skills**:
- `research`, `metallurgy`, `science`
- `laboratory_operation`, `advanced_laboratory_operation`

**Engineering Skills**:
- `amarr_starship_engineering`, `caldari_starship_engineering`
- `gallente_starship_engineering`, `minmatar_starship_engineering`
- `electromagnetic_physics`, `electronic_engineering`, `graviton_physics`
- `high_energy_physics`, `hydromagnetic_physics`, `laser_physics`
- `mechanical_engineering`, `molecular_engineering`, `nuclear_physics`
- `plasma_physics`, `quantum_physics`, `rocket_science`

**Encryption Skills**:
- `amarr_encryption_methods`, `caldari_encryption_methods`
- `gallente_encryption_methods`, `minmatar_encryption_methods`
- `sleeper_encryption_methods`, `takmahl_encryption_methods`
- `talocan_encryption_methods`, `triglavian_encryption_methods`

**Construction Skills**:
- `advanced_small_ship_construction`, `advanced_medium_ship_construction`
- `advanced_large_ship_construction`, `advanced_industrial_ship_construction`

#### Example Request

```
GET https://api.everef.net/v1/industry/cost?product_id=22430&runs=8&me=4&te=4&structure_type_id=35827&facility_tax=0.02
```

#### Response Structure

```json
{
  "input": {
    "product_id": 22430,
    "runs": 8,
    "me": 4,
    "te": 4
  },
  "manufacturing": {
    "total_cost": 1234567.89,
    "total_job_cost": 12345.67,
    "total_material_cost": 1222222.22,
    "total_cost_per_run": 154320.99,
    "total_cost_per_unit": 154320.99,
    "time": 3600,
    "time_per_run": 450,
    "time_per_unit": 450,
    "materials": {
      "34": {
        "type_id": 34,
        "quantity": 1000,
        "cost": 5000.00,
        "cost_per_unit": 5.00,
        "volume": 10.0,
        "volume_per_unit": 0.01
      }
    },
    "materials_volume": 100.5,
    "blueprint_id": 22431,
    "me": 4,
    "te": 4,
    "system_cost_index": 0.0312,
    "system_cost_bonuses": [],
    "facility_tax": 0.02,
    "alpha_clone_tax": 0,
    "scc_surcharge": 0.015,
    "units": 8,
    "units_per_run": 1,
    "product_id": 22430,
    "product_volume": 10.0,
    "estimated_item_value": 100000.00
  },
  "copying": {
    "total_cost": 5000.00,
    "total_cost_per_run": 500.00,
    "runs": 10,
    "time": 1800,
    "time_per_run": 180
  },
  "invention": {
    "probability": 0.34,
    "expected_copies": 2.94,
    "expected_runs": 23.52,
    "expected_units": 23.52,
    "avg_cost_per_copy": 50000.00,
    "avg_cost_per_run": 6250.00,
    "avg_cost_per_unit": 6250.00,
    "avg_time_per_copy": 3600,
    "avg_time_per_run": 450,
    "avg_time_per_unit": 450,
    "runs_per_copy": 8,
    "units_per_run": 1
  },
  "reaction": {
    "total_cost": 500000.00,
    "total_job_cost": 25000.00,
    "total_material_cost": 475000.00,
    "time": 7200
  }
}
```

---

## 2. Reference Data API

**Base URL**: `https://ref-data.everef.net`

Combines data from SDE, ESI, and Hoboleaks into a unified format.

### Design Conventions

- Field names use `snake_case` (matching ESI)
- Names/descriptions use language maps: `{ "en": "English", "de": "German", "ja": "日本語" }`
- Collections return keyed objects (not arrays) for easier merging
- All endpoints support `If-None-Match` for conditional requests

### Blueprints

| Endpoint | Description |
|----------|-------------|
| `GET /blueprints` | List all blueprint type IDs (int64 array) |
| `GET /blueprints/{blueprint_type_id}` | Get blueprint details |

**Blueprint Schema**:
```json
{
  "blueprint_type_id": 691,
  "max_production_limit": 300,
  "activities": {
    "manufacturing": {
      "time": 6000,
      "materials": {
        "34": { "type_id": 34, "quantity": 32000 }
      },
      "products": {
        "587": { "type_id": 587, "quantity": 1, "probability": 1.0 }
      },
      "skills": {
        "3380": { "level": 1 }
      }
    },
    "copying": { "time": 4800 },
    "invention": {
      "time": 18000,
      "materials": { "20410": { "quantity": 1 } },
      "products": { "692": { "quantity": 1, "probability": 0.34 } },
      "skills": { "3408": { "level": 1 } }
    },
    "research_material": { "time": 2100 },
    "research_time": { "time": 2100 },
    "reaction": { "time": 3600, "materials": {}, "products": {} }
  }
}
```

### Categories

| Endpoint | Description |
|----------|-------------|
| `GET /categories` | List all category IDs (int32 array) |
| `GET /categories/{category_id}` | Get category details |
| `GET /categories/bundle` | Get all categories bundled |
| `GET /categories/{category_id}/bundle` | Get category with related types/groups |

**Category Schema**:
```json
{
  "category_id": 6,
  "name": { "en": "Ship", "de": "Schiff" },
  "icon_id": 21,
  "published": true,
  "group_ids": [25, 26, 27, 28]
}
```

### Dogma Attributes

| Endpoint | Description |
|----------|-------------|
| `GET /dogma_attributes` | List all attribute IDs (int32 array) |
| `GET /dogma_attributes/{attribute_id}` | Get attribute details |

**Dogma Attribute Schema**:
```json
{
  "attribute_id": 37,
  "name": "maxVelocity",
  "display_name": { "en": "Maximum Velocity" },
  "description": { "en": "Maximum speed of the ship" },
  "tooltip_title": { "en": "Max Velocity" },
  "tooltip_description": { "en": "The maximum speed..." },
  "default_value": 0,
  "high_is_good": true,
  "stackable": false,
  "published": true,
  "display_when_zero": false,
  "unit_id": 104,
  "category_id": 4,
  "icon_id": 1394,
  "data_type": 3,
  "min_attribute_id": null,
  "max_attribute_id": null,
  "charge_recharge_time_id": null
}
```

### Dogma Effects

| Endpoint | Description |
|----------|-------------|
| `GET /dogma_effects` | List all effect IDs (int32 array) |
| `GET /dogma_effects/{effect_id}` | Get effect details |

**Dogma Effect Schema**:
```json
{
  "effect_id": 16,
  "effect_name": "online",
  "name": "online",
  "display_name": { "en": "Online" },
  "description": { "en": "Puts module online" },
  "guid": "effect.online",
  "icon_id": 0,
  "effect_category": 4,
  "published": true,
  "is_offensive": false,
  "is_assistance": false,
  "is_warp_safe": true,
  "disallow_auto_repeat": false,
  "electronic_chance": false,
  "propulsion_chance": false,
  "range_chance": false,
  "distribution": 0,
  "duration_attribute_id": null,
  "range_attribute_id": null,
  "discharge_attribute_id": null,
  "falloff_attribute_id": null,
  "tracking_speed_attribute_id": null,
  "resistance_attribute_id": null,
  "modifiers": [
    {
      "domain": "shipID",
      "func": "ItemModifier",
      "modified_attribute_id": 37,
      "modifying_attribute_id": 20,
      "operator": 2,
      "effect_id": 16,
      "group_id": null,
      "skill_type_id": null
    }
  ]
}
```

### Groups

| Endpoint | Description |
|----------|-------------|
| `GET /groups` | List all group IDs (int32 array) |
| `GET /groups/{group_id}` | Get group details |
| `GET /groups/{group_id}/bundle` | Get group with related types |

**Group Schema**:
```json
{
  "group_id": 25,
  "name": { "en": "Frigate" },
  "category_id": 6,
  "icon_id": 21,
  "published": true,
  "anchorable": false,
  "anchored": false,
  "fittable_non_singleton": false,
  "use_base_price": false,
  "type_ids": [587, 582, 583, 584]
}
```

### Icons

| Endpoint | Description |
|----------|-------------|
| `GET /icons` | List all icon IDs (int32 array) |
| `GET /icons/{icon_id}` | Get icon file path |

**Icon Schema**:
```json
{
  "icon_id": 587,
  "icon_file": "res:/UI/Texture/Icons/587.png"
}
```

### Market Groups

| Endpoint | Description |
|----------|-------------|
| `GET /market_groups` | List all market group IDs (int32 array) |
| `GET /market_groups/{market_group_id}` | Get market group details |
| `GET /market_groups/{market_group_id}/bundle` | Get market group with children |
| `GET /market_groups/root` | Get root market group IDs |
| `GET /market_groups/root/bundle` | Get root groups bundled |

**Market Group Schema**:
```json
{
  "market_group_id": 64,
  "name": { "en": "Frigates" },
  "description": { "en": "Small, fast ships..." },
  "icon_id": 21,
  "has_types": true,
  "parent_group_id": 4,
  "type_ids": [587, 582],
  "child_market_group_ids": [1367, 1368]
}
```

### Meta Groups

| Endpoint | Description |
|----------|-------------|
| `GET /meta_groups` | List all meta group IDs (int32 array) |
| `GET /meta_groups/{meta_group_id}` | Get meta group details |

**Meta Group Schema**:
```json
{
  "meta_group_id": 1,
  "name": { "en": "Tech I" },
  "description": { "en": "Standard technology items" },
  "icon_id": 0,
  "icon_suffix": "",
  "color": { "r": 1.0, "g": 1.0, "b": 1.0 },
  "type_ids": [587, 582, 583]
}
```

**Meta Group IDs**:
| ID | Name |
|----|------|
| 1 | Tech I |
| 2 | Tech II |
| 3 | Storyline |
| 4 | Faction |
| 5 | Officer |
| 6 | Deadspace |
| 14 | Tech III |
| 15 | Abyssal |
| 17 | Premium |
| 19 | Limited Time |
| 52 | Structure Faction |
| 53 | Structure Tech II |
| 54 | Structure Tech I |

### Mutaplasmids

| Endpoint | Description |
|----------|-------------|
| `GET /mutaplasmids` | List all mutaplasmid type IDs (int32 array) |
| `GET /mutaplasmids/{mutaplasmid_type_id}` | Get mutaplasmid modification ranges |

**Mutaplasmid Schema**:
```json
{
  "type_id": 47732,
  "dogma_modifications": {
    "20": {
      "min": -0.20,
      "max": 0.20,
      "high_is_good": false
    },
    "30": {
      "min": -0.15,
      "max": 0.25,
      "high_is_good": true
    }
  },
  "type_mappings": {
    "1": {
      "applicable_type_ids": [5443, 5445],
      "resulting_type_id": 47745
    }
  }
}
```

### Regions

| Endpoint | Description |
|----------|-------------|
| `GET /regions` | List all region IDs (int32 array) |
| `GET /regions/{region_id}` | Get region details |

**Region Schema**:
```json
{
  "region_id": 10000002,
  "name": { "en": "The Forge" },
  "description": { "en": "The Forge is the industrial heartland..." },
  "name_id": 12345,
  "description_id": 12346,
  "position": {
    "x": -96536556906937070,
    "y": 67440271419366850,
    "z": -113784680271008610
  },
  "faction_id": 500001,
  "nebula_id": 10,
  "wormhole_class_id": null,
  "universe_id": "eve"
}
```

### Schematics (Planetary Industry)

| Endpoint | Description |
|----------|-------------|
| `GET /schematics` | List all schematic IDs (int64 array) |
| `GET /schematics/{schematic_id}` | Get PI schematic details |

**Schematic Schema**:
```json
{
  "schematic_id": 65,
  "name": { "en": "Coolant" },
  "cycle_time": 3600,
  "pin_type_ids": [2469, 2470, 2471],
  "materials": {
    "2389": { "type_id": 2389, "quantity": 40 },
    "2390": { "type_id": 2390, "quantity": 40 }
  },
  "products": {
    "9832": { "type_id": 9832, "quantity": 5 }
  }
}
```

### Skills

| Endpoint | Description |
|----------|-------------|
| `GET /skills` | List all skill type IDs (int32 array) |
| `GET /skills/{skill_type_id}` | Get skill training details |

**Skill Schema**:
```json
{
  "type_id": 3380,
  "primary_dogma_attribute_id": 165,
  "secondary_dogma_attribute_id": 166,
  "primary_character_attribute_id": "intelligence",
  "secondary_character_attribute_id": "memory",
  "training_time_multiplier": 1,
  "can_not_be_trained_on_trial": false,
  "required_skills": {
    "3386": 3,
    "3392": 2
  },
  "reprocessable_type_ids": []
}
```

### Types (Items)

| Endpoint | Description |
|----------|-------------|
| `GET /types` | List all type IDs (int32 array) |
| `GET /types/{type_id}` | Get comprehensive type data |
| `GET /types/{type_id}/bundle` | Get type with all related data |

**Type Schema** (comprehensive):
```json
{
  "type_id": 587,
  "name": { "en": "Rifter", "de": "Rifter" },
  "description": { "en": "The Rifter is a very powerful..." },
  "group_id": 25,
  "category_id": 6,
  "market_group_id": 64,
  "meta_group_id": 1,
  "icon_id": 587,
  "graphic_id": 46,
  "sound_id": 20080,
  "race_id": 2,
  "faction_id": null,
  "mass": 1067000,
  "volume": 27289,
  "packaged_volume": 2500,
  "capacity": 140,
  "radius": 35,
  "portion_size": 1,
  "base_price": 400000,
  "published": true,
  "is_blueprint": false,
  "is_skill": false,
  "is_mutaplasmid": false,
  "is_dynamic_item": false,
  "is_ore": false,
  "dogma_attributes": {
    "37": { "attribute_id": 37, "value": 355 },
    "48": { "attribute_id": 48, "value": 140 }
  },
  "dogma_effects": {
    "16": { "effect_id": 16, "is_default": false }
  },
  "type_materials": {
    "34": { "material_type_id": 34, "quantity": 13333 }
  },
  "required_skills": {
    "3327": 1
  },
  "masteries": {
    "0": [3327, 3428],
    "1": [3327, 3428, 3416]
  },
  "traits": {
    "icon_id": 587,
    "role_bonuses": {
      "1": {
        "bonus": 50,
        "bonus_text": { "en": "bonus to tracking..." },
        "importance": 1,
        "is_positive": true,
        "unit_id": 105
      }
    },
    "misc_bonuses": {},
    "types": {
      "3327": {
        "1": {
          "bonus": 5,
          "bonus_text": { "en": "bonus per level..." },
          "importance": 1,
          "is_positive": true,
          "unit_id": 105
        }
      }
    }
  },
  "produced_by_blueprints": {
    "691": {
      "blueprint_type_id": 691,
      "blueprint_activity": "manufacturing"
    }
  },
  "used_in_blueprints": {},
  "applicable_mutaplasmid_type_ids": [],
  "can_fit_types": [3170, 3172],
  "can_be_fitted_with_types": [519, 520],
  "type_variations": {
    "1": [587],
    "2": [11379],
    "4": [17703]
  },
  "ore_variations": {},
  "variation_parent_type_id": null,
  "engineering_rig_affected_category_ids": {},
  "engineering_rig_affected_group_ids": {},
  "engineering_rig_source_type_ids": {},
  "engineering_rig_global_activities": [],
  "randomized_type_materials": {},
  "harvested_by_pin_type_ids": [],
  "buildable_pin_type_ids": [],
  "installable_schematic_ids": [],
  "produced_by_schematic_ids": [],
  "used_by_schematic_ids": []
}
```

### Units

| Endpoint | Description |
|----------|-------------|
| `GET /units` | List all unit IDs (int32 array) |
| `GET /units/{unit_id}` | Get unit display info |

**Unit Schema**:
```json
{
  "unit_id": 104,
  "name": { "en": "Meters per Second" },
  "display_name": "m/s",
  "description": { "en": "Speed measurement" }
}
```

### Metadata

| Endpoint | Description |
|----------|-------------|
| `GET /meta` | Get API build info and source checksums |

**Meta Schema**:
```json
{
  "build_time": "2024-01-15T12:00:00Z",
  "sde": { "sha256": "abc123..." },
  "esi": { "sha256": "def456..." },
  "hoboleaks": { "sha256": "ghi789..." }
}
```

### Bundle Responses

Bundle endpoints return aggregated related data:

```json
{
  "blueprints": { "691": { /* Blueprint */ } },
  "types": { "587": { /* InventoryType */ }, "34": { /* ... */ } },
  "categories": { "6": { /* Category */ } },
  "groups": { "25": { /* Group */ } },
  "market_groups": { "64": { /* MarketGroup */ } },
  "meta_groups": { "1": { /* MetaGroup */ } },
  "dogma_attributes": { "37": { /* DogmaAttribute */ } },
  "dogma_effects": { "16": { /* DogmaEffect */ } },
  "icons": { "587": { /* Icon */ } },
  "skills": { "3327": { /* Skill */ } },
  "units": { "104": { /* Unit */ } }
}
```

---

## Error Responses

Both APIs return errors in this format:

```json
{
  "message": "Error description"
}
```

| Status | Description |
|--------|-------------|
| 400 | Bad request (invalid parameters) |
| 404 | Resource not found |
| 500 | Server error |

---

## Resources

- **Industry API Spec**: https://github.com/autonomouslogic/eve-ref/blob/main/spec/eve-ref-api.yaml
- **Reference Data Spec**: https://github.com/autonomouslogic/eve-ref/blob/main/spec/reference-data.yaml
- **Documentation**: https://docs.everef.net/
- **Discord**: https://everef.net/discord
- **Live Site**: https://everef.net
