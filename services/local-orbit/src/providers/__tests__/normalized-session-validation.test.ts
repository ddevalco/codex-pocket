import { describe, test, expect } from 'bun:test';
import { validateNormalizedSession, createNormalizedSession } from '../normalized-session';

describe('validateNormalizedSession - metadata validation', () => {
  test('accepts plain object metadata', () => {
    const session = createNormalizedSession({
      sessionId: 'test-123',
      provider: 'test',
      metadata: { foo: 'bar', count: 42 }
    });
    const errors = validateNormalizedSession(session);
    expect(errors).toEqual([]);
  });
  
  test('rejects array metadata', () => {
    const session = {
      ...createNormalizedSession({ sessionId: 'test-123', provider: 'test' }),
      metadata: ['invalid', 'array']
    };
    const errors = validateNormalizedSession(session);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('metadata must be a plain object'))).toBe(true);
  });
  
  test('rejects null metadata', () => {
    const session = {
      ...createNormalizedSession({ sessionId: 'test-123', provider: 'test' }),
      metadata: null
    };
    const errors = validateNormalizedSession(session);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('metadata must be a plain object'))).toBe(true);
  });
  
  test('rejects primitive metadata', () => {
    const session = {
      ...createNormalizedSession({ sessionId: 'test-123', provider: 'test' }),
      metadata: 'string-metadata'
    };
    const errors = validateNormalizedSession(session);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('metadata must be a plain object'))).toBe(true);
  });
  
  test('allows undefined metadata', () => {
    const session = createNormalizedSession({
      sessionId: 'test-123',
      provider: 'test'
      // metadata undefined
    });
    const errors = validateNormalizedSession(session);
    expect(errors).toEqual([]);
  });
  
  test('rejects metadata with custom prototype', () => {
    class CustomClass {
      foo = 'bar';
    }
    const session = {
      ...createNormalizedSession({ sessionId: 'test-123', provider: 'test' }),
      metadata: new CustomClass()
    };
    const errors = validateNormalizedSession(session);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('metadata must be a plain object'))).toBe(true);
  });
});
