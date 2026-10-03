import { describe, expect, it } from 'vitest'
import { comboItemLabel, filterComboItems, type ComboItem } from '$lib/combobox'

const items: ComboItem[] = [
  { value: 'idioteque-dark', label: 'Idioteque Dark' },
  { value: 'idioteque-night', label: 'Idioteque Night' },
  { value: null, label: 'Predeterminada' },
]

describe('filterComboItems', () => {
  it('returns every item when the query is empty', () => {
    expect(filterComboItems(items, '  ')).toEqual(items)
  })

  it('matches a case-insensitive substring of the label', () => {
    expect(filterComboItems(items, 'night')).toEqual([
      { value: 'idioteque-night', label: 'Idioteque Night' },
    ])
    expect(filterComboItems(items, 'PREDE')).toEqual([{ value: null, label: 'Predeterminada' }])
    expect(filterComboItems(items, 'zzz')).toEqual([])
  })
})

describe('comboItemLabel', () => {
  it('uses the matching item label', () => {
    expect(comboItemLabel(items, 'idioteque-night')).toBe('Idioteque Night')
    expect(comboItemLabel(items, null)).toBe('Predeterminada')
  })

  it('falls back to the raw value when the item is missing', () => {
    expect(comboItemLabel(items, 'MesloLGS NF')).toBe('MesloLGS NF')
  })
})
