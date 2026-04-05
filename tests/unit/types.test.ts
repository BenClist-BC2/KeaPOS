import { describe, it, expect } from 'vitest';
import { formatNZD, parseCents } from '@/lib/types';

describe('formatNZD', () => {
  it('formats a typical price in cents', () => {
    expect(formatNZD(1850)).toContain('18.50');
  });

  it('formats zero cents', () => {
    expect(formatNZD(0)).toContain('0.00');
  });

  it('formats whole dollar amounts', () => {
    expect(formatNZD(1000)).toContain('10.00');
  });

  it('formats a single cent', () => {
    expect(formatNZD(1)).toContain('0.01');
  });

  it('includes a currency symbol or code', () => {
    const result = formatNZD(500);
    expect(result).toMatch(/\$|NZD/);
  });
});

describe('parseCents', () => {
  it('converts a decimal dollar string to cents', () => {
    expect(parseCents('18.50')).toBe(1850);
  });

  it('converts a whole dollar string', () => {
    expect(parseCents('10')).toBe(1000);
  });

  it('converts zero', () => {
    expect(parseCents('0')).toBe(0);
  });

  it('rounds correctly', () => {
    expect(parseCents('0.005')).toBe(1);
    expect(parseCents('0.004')).toBe(0);
  });

  it('handles large values', () => {
    expect(parseCents('100.00')).toBe(10000);
  });
});
