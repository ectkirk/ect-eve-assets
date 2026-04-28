import { describe, expect, it } from 'vitest'
import {
  isJsonRecord,
  parseBooleanRecord,
  parseJsonRecord,
  parseJsonString,
} from './persisted-json'

describe('persisted-json', () => {
  it('parses object JSON into records', () => {
    expect(parseJsonRecord('{"a":true,"b":1}')).toEqual({ a: true, b: 1 })
  })

  it('returns an empty record for non-object JSON', () => {
    expect(parseJsonRecord('"value"')).toEqual({})
    expect(parseJsonRecord('[["a",true]]')).toEqual({})
  })

  it('keeps only boolean values in boolean records', () => {
    expect(
      parseBooleanRecord('{"visible":true,"label":"bad","hidden":false}'),
    ).toEqual({
      hidden: false,
      visible: true,
    })
  })

  it('parses only JSON strings', () => {
    expect(parseJsonString('"name"')).toBe('name')
    expect(parseJsonString('123')).toBeNull()
  })

  it('detects plain JSON records', () => {
    expect(isJsonRecord({ ok: true })).toBe(true)
    expect(isJsonRecord(null)).toBe(false)
    expect(isJsonRecord([])).toBe(false)
  })
})
