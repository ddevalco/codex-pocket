import { describe, test, expect } from 'bun:test';
import { validateNormalizedEvent, createNormalizedEvent } from '../normalized-event';

describe('validateNormalizedEvent - payload validation', () => {
  test('accepts plain object payload', () => {
    const event = createNormalizedEvent({
      eventId: 'evt-123',
      sessionId: 'sess-123',
      provider: 'test',
      category: 'metadata',
      payload: { result: 'success', data: [1, 2, 3] }
    });
    const errors = validateNormalizedEvent(event);
    expect(errors).toEqual([]);
  });
  
  test('rejects array payload', () => {
    const event = {
      ...createNormalizedEvent({
        eventId: 'evt-123',
        sessionId: 'sess-123',
        provider: 'test',
        category: 'metadata'
      }),
      payload: ['invalid', 'array']
    };
    const errors = validateNormalizedEvent(event);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('payload must be a plain object'))).toBe(true);
  });
  
  test('rejects null payload', () => {
    const event = {
      ...createNormalizedEvent({
        eventId: 'evt-123',
        sessionId: 'sess-123',
        provider: 'test',
        category: 'metadata'
      }),
      payload: null
    };
    const errors = validateNormalizedEvent(event);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('payload must be a plain object'))).toBe(true);
  });
  
  test('rejects primitive payload', () => {
    const event = {
      ...createNormalizedEvent({
        eventId: 'evt-123',
        sessionId: 'sess-123',
        provider: 'test',
        category: 'metadata'
      }),
      payload: 42
    };
    const errors = validateNormalizedEvent(event);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('payload must be a plain object'))).toBe(true);
  });
  
  test('allows undefined payload', () => {
    const event = createNormalizedEvent({
      eventId: 'evt-123',
      sessionId: 'sess-123',
      provider: 'test',
      category: 'metadata'
      // payload undefined
    });
    const errors = validateNormalizedEvent(event);
    expect(errors).toEqual([]);
  });
  
  test('rejects payload with custom prototype', () => {
    class CustomClass {
      result = 'success';
    }
    const event = {
      ...createNormalizedEvent({
        eventId: 'evt-123',
        sessionId: 'sess-123',
        provider: 'test',
        category: 'metadata'
      }),
      payload: new CustomClass()
    };
    const errors = validateNormalizedEvent(event);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('payload must be a plain object'))).toBe(true);
  });
});
