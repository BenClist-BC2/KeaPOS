import { describe, it, expect } from 'vitest';
import * as proxyModule from '@/proxy';

describe('proxy.ts — Next.js 16 export contract', () => {
  it('exports a function named "proxy" (required by Next.js 16)', () => {
    expect(typeof proxyModule.proxy).toBe('function');
  });

  it('does not export a function named "middleware" (deprecated in Next.js 16)', () => {
    expect((proxyModule as Record<string, unknown>).middleware).toBeUndefined();
  });

  it('exports a config object with a matcher array', () => {
    expect(proxyModule.config).toBeDefined();
    expect(Array.isArray(proxyModule.config.matcher)).toBe(true);
    expect(proxyModule.config.matcher.length).toBeGreaterThan(0);
  });
});
