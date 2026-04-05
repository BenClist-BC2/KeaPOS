import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRevalidatePath,
  mockGetUser,
  mockFrom,
  mockAdminCreateUser,
  mockAdminDeleteUser,
  mockAdminListUsers,
  mockAdminUpdateUserById,
  mockAdminFrom,
  mockLogAudit,
  mockCreateDiff,
} = vi.hoisted(() => ({
  mockRevalidatePath:      vi.fn(),
  mockGetUser:             vi.fn(),
  mockFrom:                vi.fn(),
  mockAdminCreateUser:     vi.fn(),
  mockAdminDeleteUser:     vi.fn(),
  mockAdminListUsers:      vi.fn(),
  mockAdminUpdateUserById: vi.fn(),
  mockAdminFrom:           vi.fn(),
  mockLogAudit:            vi.fn().mockResolvedValue(undefined),
  mockCreateDiff:          vi.fn().mockReturnValue({ old_values: {}, new_values: {} }),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      admin: {
        createUser:      mockAdminCreateUser,
        deleteUser:      mockAdminDeleteUser,
        listUsers:       mockAdminListUsers,
        updateUserById:  mockAdminUpdateUserById,
      },
    },
    from: mockAdminFrom,
  }),
}));

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit, createDiff: mockCreateDiff }));

import {
  createTerminal,
  updateTerminal,
  deleteTerminal,
  resetTerminalCredentials,
} from '@/app/(admin)/dashboard/terminals/actions';

const ADMIN_USER    = { id: 'admin-1' };
const OWNER_PROFILE = { data: { company_id: 'comp-1', role: 'owner' }, error: null };

function makeSelect(result: object) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeCount(count: number) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ count }),
    }),
  };
}

// ─── createTerminal ──────────────────────────────────────────

describe('createTerminal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await createTerminal(new FormData());
    expect(result).toEqual({ terminal_id: null, pairing_code: null, error: 'Not authenticated' });
  });

  it('returns error when caller is not owner or manager', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1', role: 'staff' }, error: null }));
    const fd = new FormData();
    fd.set('name', 'Register 1');
    fd.set('location_id', 'loc-1');
    expect(await createTerminal(fd)).toEqual({ terminal_id: null, pairing_code: null, error: 'Only owners and managers can create terminals' });
  });

  it('returns error when terminal name is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    const fd = new FormData();
    fd.set('location_id', 'loc-1');
    expect(await createTerminal(fd)).toMatchObject({ error: 'Terminal name is required' });
  });

  it('returns error when location_id is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    const fd = new FormData();
    fd.set('name', 'Register 1');
    expect(await createTerminal(fd)).toMatchObject({ error: 'Location is required' });
  });

  it('returns error when auth user creation fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockAdminCreateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Auth limit reached' } });

    const fd = new FormData();
    fd.set('name', 'Register 1');
    fd.set('location_id', 'loc-1');
    expect(await createTerminal(fd)).toMatchObject({ error: 'Auth limit reached' });
  });

  it('creates terminal and returns a pairing code on success', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockAdminCreateUser.mockResolvedValueOnce({ data: { user: { id: 'auth-user-1' } }, error: null });
    mockAdminFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) }); // profile
    mockAdminFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'term-uuid-1' }, error: null }),
        }),
      }),
    }); // terminal record

    const fd = new FormData();
    fd.set('name', 'Register 1');
    fd.set('location_id', 'loc-1');

    const result = await createTerminal(fd);
    expect(result.error).toBeNull();
    expect(result.terminal_id).toBe('term-uuid-1');
    expect(typeof result.pairing_code).toBe('string');
    // pairing code is base64 JSON containing terminal credentials
    const decoded = JSON.parse(atob(result.pairing_code!));
    expect(decoded).toHaveProperty('terminal_id');
    expect(decoded).toHaveProperty('email');
    expect(decoded).toHaveProperty('password');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'terminal.created' })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/terminals');
  });
});

// ─── updateTerminal ──────────────────────────────────────────

describe('updateTerminal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await updateTerminal('term-1', new FormData())).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when terminal name is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1' }, error: null }));
    expect(await updateTerminal('term-1', new FormData())).toEqual({ error: 'Terminal name is required' });
  });

  it('updates terminal and logs audit when values change', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1' }, error: null }));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { name: 'Old Name', active: true }, error: null }));
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mockCreateDiff.mockReturnValueOnce({ old_values: { name: 'Old Name' }, new_values: { name: 'Register 2' } });

    const fd = new FormData();
    fd.set('name', 'Register 2');
    fd.set('active', 'true');

    const result = await updateTerminal('term-1', fd);
    expect(result).toEqual({ error: null });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'terminal.modified', entity_id: 'term-1' })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/terminals');
  });

  it('does not log audit when nothing changed', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1' }, error: null }));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { name: 'Register 1', active: true }, error: null }));
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mockCreateDiff.mockReturnValueOnce({ old_values: {}, new_values: {} });

    const fd = new FormData();
    fd.set('name', 'Register 1');
    fd.set('active', 'true');

    await updateTerminal('term-1', fd);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

// ─── deleteTerminal ──────────────────────────────────────────

describe('deleteTerminal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await deleteTerminal('term-1')).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when terminal is not found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: null, error: null }));
    expect(await deleteTerminal('term-1')).toEqual({ error: 'Terminal not found' });
  });

  it('returns error when terminal belongs to a different company', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'term-1', company_id: 'other-comp', name: 'Reg 1' }, error: null }));
    expect(await deleteTerminal('term-1')).toEqual({ error: 'Unauthorized' });
  });

  it('blocks deletion when terminal has transaction history', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'term-1', company_id: 'comp-1', name: 'Register 1' }, error: null }));
    mockFrom.mockReturnValueOnce(makeCount(3));

    const result = await deleteTerminal('term-1');
    expect(result.error).toContain('3 transaction(s)');
    expect(result.error).toContain('deactivate');
  });

  it('deletes terminal with no transactions and logs audit', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'term-1', company_id: 'comp-1', name: 'Register 1' }, error: null }));
    mockFrom.mockReturnValueOnce(makeCount(0));
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mockAdminListUsers.mockResolvedValueOnce({ data: { users: [{ id: 'auth-user-1', email: `terminal-term-1@keapos.internal` }] } });
    mockAdminDeleteUser.mockResolvedValueOnce({});

    const result = await deleteTerminal('term-1');
    expect(result).toEqual({ error: null });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'terminal.deleted', entity_id: 'term-1' })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/terminals');
  });
});

// ─── resetTerminalCredentials ─────────────────────────────────

describe('resetTerminalCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await resetTerminalCredentials('term-1')).toMatchObject({ error: 'Not authenticated' });
  });

  it('returns error when terminal is not found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: null, error: null }));
    expect(await resetTerminalCredentials('term-1')).toMatchObject({ error: 'Terminal not found' });
  });

  it('returns error when terminal auth user is not found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'term-1', company_id: 'comp-1' }, error: null }));
    mockAdminListUsers.mockResolvedValueOnce({ data: { users: [] } });
    expect(await resetTerminalCredentials('term-1')).toMatchObject({ error: 'Terminal auth user not found' });
  });

  it('resets credentials and returns a new pairing code', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'term-1', company_id: 'comp-1' }, error: null }));
    mockAdminListUsers.mockResolvedValueOnce({
      data: { users: [{ id: 'auth-user-1', email: 'terminal-term-1@keapos.internal' }] },
    });
    mockAdminUpdateUserById.mockResolvedValueOnce({ error: null });

    const result = await resetTerminalCredentials('term-1');
    expect(result.error).toBeNull();
    expect(result.terminal_id).toBe('term-1');
    expect(typeof result.pairing_code).toBe('string');

    const decoded = JSON.parse(atob(result.pairing_code!));
    expect(decoded.terminal_id).toBe('term-1');
    expect(decoded.email).toBe('terminal-term-1@keapos.internal');
    expect(typeof decoded.password).toBe('string');
    expect(decoded.password.length).toBe(16);

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'terminal.credentials_reset', entity_id: 'term-1' })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/terminals');
  });
});
