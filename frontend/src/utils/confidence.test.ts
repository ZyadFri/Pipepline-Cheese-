import { describe, it, expect } from 'vitest'
import { confidenceStyle, confidenceOpacity } from './confidence'

describe('confidenceStyle', () => {
  it('returns null for missing values', () => {
    expect(confidenceStyle(undefined)).toBeNull()
    expect(confidenceStyle(null)).toBeNull()
  })

  it('picks a stronger band for higher confidence', () => {
    expect(confidenceStyle(0.95)?.label).toBe('Very confident')
    expect(confidenceStyle(0.75)?.label).toBe('Confident')
    expect(confidenceStyle(0.6)?.label).toBe('Likely')
    expect(confidenceStyle(0.45)?.label).toBe('Uncertain')
    expect(confidenceStyle(0.1)?.label).toBe('Low confidence')
  })

  it('clamps out-of-range values instead of throwing', () => {
    expect(confidenceStyle(1.5)?.label).toBe('Very confident')
    expect(confidenceStyle(-0.5)?.label).toBe('Low confidence')
  })
})

describe('confidenceOpacity', () => {
  it('increases monotonically with confidence', () => {
    expect(confidenceOpacity(0)).toBeLessThan(confidenceOpacity(0.5))
    expect(confidenceOpacity(0.5)).toBeLessThan(confidenceOpacity(1))
  })

  it('defaults to fully opaque for missing values', () => {
    expect(confidenceOpacity(undefined)).toBe(1)
  })
})
