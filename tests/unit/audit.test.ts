import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ insert: mockInsert }),
  }),
}));

import { logAudit, getRequestContext, createDiff } from '@/lib/audit';

// ─── createDiff ───────────────────────────────────────────────

describe('createDiff', () => {
  it('returns empty objects when nothing changed', () => {
    const { old_values, new_values } = createDiff(
      { role: 'staff', active: true },
      { role: 'staff', active: true }
    );
    expect(old_values).toEqual({});
    expect(new_values).toEqual({});
  });

  it('captures a single changed field', () => {
    const { old_values, new_values } = createDiff(
      { role: 'staff', active: true },
      { role: 'manager', active: true }
    );
    expect(old_values).toEqual({ role: 'staff' });
    expect(new_values).toEqual({ role: 'manager' });
  });

  it('captures multiple changed fields', () => {
    const { old_values, new_values } = createDiff(
      { role: 'staff', active: true, location_id: null },
      { role: 'manager', active: false, location_id: 'loc-1' }
    );
    expect(old_values).toEqual({ role: 'staff', active: true, location_id: null });
    expect(new_values).toEqual({ role: 'manager', active: false, location_id: 'loc-1' });
  });

  it('handles null → value change', () => {
    const { old_values, new_values } = createDiff(
      { location_id: null },
      { location_id: 'loc-1' }
    );
    expect(old_values).toEqual({ location_id: null });
    expect(new_values).toEqual({ location_id: 'loc-1' });
  });

  it('ignores keys only present in old values', () => {
    // createDiff iterates newValues keys — extra old keys are not included
    const { new_values } = createDiff(
      { role: 'staff', extra: 'x' },
      { role: 'manager' }
    );
    expect(new_values).toEqual({ role: 'manager' });
    expect(new_values).not.toHaveProperty('extra');
  });
});

// ─── getRequestContext ────────────────────────────────────────

describe('getRequestContext', () => {
  it('returns nulls when no headers provided', () => {
    const result = getRequestContext();
    expect(result.ip_address).toBeNull();
    expect(result.user_agent).toBeNull();
  });

  it('extracts the first IP from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getRequestContext(headers).ip_address).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '9.9.9.9' });
    expect(getRequestContext(headers).ip_address).toBe('9.9.9.9');
  });

  it('extracts user-agent header', () => {
    const headers = new Headers({ 'user-agent': 'Mozilla/5.0' });
    expect(getRequestContext(headers).user_agent).toBe('Mozilla/5.0');
  });

  it('returns null ip when neither ip header is present', () => {
    const headers = new Headers({ 'user-agent': 'TestBot' });
    expect(getRequestContext(headers).ip_address).toBeNull();
  });
});

// ─── logAudit ────────────────────────────────────────────────

describe('logAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts an audit entry with the provided fields', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });

    await logAudit({
      company_id: 'comp-1',
      user_id: 'user-1',
      action: 'staff.created',
      entity_type: 'staff',
      entity_id: 'staff-1',
      new_values: { full_name: 'Alice' },
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'comp-1',
        user_id: 'user-1',
        action: 'staff.created',
        entity_type: 'staff',
        entity_id: 'staff-1',
      })
    );
  });

  it('does not throw when the insert returns an error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'DB error' } });
    await expect(
      logAudit({ company_id: 'comp-1', action: 'order.completed', entity_type: 'order' })
    ).resolves.not.toThrow();
  });

  it('does not throw when the client throws an exception', async () => {
    mockInsert.mockRejectedValueOnce(new Error('Network failure'));
    await expect(
      logAudit({ company_id: 'comp-1', action: 'order.completed', entity_type: 'order' })
    ).resolves.not.toThrow();
  });
});
