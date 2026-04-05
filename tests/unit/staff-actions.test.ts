import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRevalidatePath,
  mockGetUser,
  mockFrom,
  mockInviteUserByEmail,
  mockAdminCreateUser,
  mockAdminDeleteUser,
  mockAdminFrom,
  mockLogAudit,
  mockCreateDiff,
  mockBcryptHash,
} = vi.hoisted(() => ({
  mockRevalidatePath:    vi.fn(),
  mockGetUser:           vi.fn(),
  mockFrom:              vi.fn(),
  mockInviteUserByEmail: vi.fn(),
  mockAdminCreateUser:   vi.fn(),
  mockAdminDeleteUser:   vi.fn(),
  mockAdminFrom:         vi.fn(),
  mockLogAudit:          vi.fn().mockResolvedValue(undefined),
  mockCreateDiff:        vi.fn().mockReturnValue({ old_values: {}, new_values: {} }),
  mockBcryptHash:        vi.fn().mockResolvedValue('hashed-1234'),
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
        inviteUserByEmail: mockInviteUserByEmail,
        createUser:        mockAdminCreateUser,
        deleteUser:        mockAdminDeleteUser,
      },
    },
    from: mockAdminFrom,
  }),
}));

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit, createDiff: mockCreateDiff }));

vi.mock('bcryptjs', () => ({ default: { hash: mockBcryptHash } }));

import { inviteStaff, updateStaffRole, deleteStaff } from '@/app/(admin)/dashboard/staff/actions';

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

// ─── inviteStaff ─────────────────────────────────────────────

describe('inviteStaff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await inviteStaff(new FormData())).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when caller is not owner or manager', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1', role: 'staff' }, error: null }));
    const fd = new FormData();
    fd.set('full_name', 'Bob');
    fd.set('pin', '1234');
    fd.set('role', 'staff');
    expect(await inviteStaff(fd)).toEqual({ error: 'Only owners and managers can invite staff' });
  });

  it('returns error when full_name is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    const fd = new FormData();
    fd.set('pin', '1234');
    fd.set('role', 'staff');
    expect(await inviteStaff(fd)).toEqual({ error: 'Full name is required' });
  });

  it('returns error when PIN is too short', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    const fd = new FormData();
    fd.set('full_name', 'Bob');
    fd.set('pin', '12');
    fd.set('role', 'staff');
    expect(await inviteStaff(fd)).toEqual({ error: 'PIN must be at least 4 digits' });
  });

  it('creates a PIN-only staff member when no email is provided', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockAdminCreateUser.mockResolvedValueOnce({ data: { user: { id: 'new-user-1' } }, error: null });
    mockAdminFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });

    const fd = new FormData();
    fd.set('full_name', 'Bob');
    fd.set('pin', '1234');
    fd.set('role', 'staff');

    const result = await inviteStaff(fd);
    expect(result).toEqual({ error: null });
    expect(mockBcryptHash).toHaveBeenCalledWith('1234', 10);
    expect(mockAdminCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email_confirm: true })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.created', new_values: expect.objectContaining({ has_email: false }) })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/staff');
  });

  it('invites a manager by email when email is provided', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockInviteUserByEmail.mockResolvedValueOnce({ data: { user: { id: 'new-user-2' } }, error: null });
    mockAdminFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });

    const fd = new FormData();
    fd.set('full_name', 'Alice Manager');
    fd.set('email', 'alice@example.com');
    fd.set('pin', '5678');
    fd.set('role', 'manager');

    const result = await inviteStaff(fd);
    expect(result).toEqual({ error: null });
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('alice@example.com');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.created', new_values: expect.objectContaining({ has_email: true }) })
    );
  });

  it('returns error when auth user creation fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockAdminCreateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Email already in use' } });

    const fd = new FormData();
    fd.set('full_name', 'Bob');
    fd.set('pin', '1234');
    fd.set('role', 'staff');

    expect(await inviteStaff(fd)).toEqual({ error: 'Email already in use' });
  });
});

// ─── updateStaffRole ─────────────────────────────────────────

describe('updateStaffRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await updateStaffRole('staff-1', new FormData())).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when admin profile not found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: null, error: null }));
    expect(await updateStaffRole('staff-1', new FormData())).toEqual({ error: 'Profile not found' });
  });

  it('returns error when DB update fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1' }, error: null }));
    // old profile
    mockFrom.mockReturnValueOnce(makeSelect({ data: { role: 'staff', location_id: null, active: true, full_name: 'Bob' }, error: null }));
    // update
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'update failed' } }),
      }),
    });
    const fd = new FormData();
    fd.set('role', 'manager');
    fd.set('active', 'true');
    expect(await updateStaffRole('staff-1', fd)).toEqual({ error: 'update failed' });
  });

  it('updates staff role and logs audit on success', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1' }, error: null }));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { role: 'staff', location_id: null, active: true, full_name: 'Bob' }, error: null }));
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockCreateDiff.mockReturnValueOnce({ old_values: { role: 'staff' }, new_values: { role: 'manager' } });

    const fd = new FormData();
    fd.set('role', 'manager');
    fd.set('active', 'true');

    const result = await updateStaffRole('staff-1', fd);
    expect(result).toEqual({ error: null });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.modified', entity_id: 'staff-1' })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/staff');
  });

  it('does not log audit when nothing changed', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1' }, error: null }));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { role: 'staff', location_id: null, active: true, full_name: 'Bob' }, error: null }));
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    // createDiff returns empty new_values → no audit
    mockCreateDiff.mockReturnValueOnce({ old_values: {}, new_values: {} });

    const fd = new FormData();
    fd.set('role', 'staff');
    fd.set('active', 'true');

    await updateStaffRole('staff-1', fd);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

// ─── deleteStaff ─────────────────────────────────────────────

describe('deleteStaff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await deleteStaff('staff-1')).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when caller is not owner or manager', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect({ data: { company_id: 'comp-1', role: 'staff' }, error: null }));
    expect(await deleteStaff('staff-1')).toEqual({ error: 'Only owners and managers can delete staff' });
  });

  it('returns error when staff member is not found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: null, error: null }));
    expect(await deleteStaff('staff-1')).toEqual({ error: 'Staff member not found' });
  });

  it('returns error when staff member belongs to a different company', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'staff-1', company_id: 'other-comp', full_name: 'Bob' }, error: null }));
    expect(await deleteStaff('staff-1')).toEqual({ error: 'Unauthorized' });
  });

  it('blocks deletion when staff has transaction history', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'staff-1', company_id: 'comp-1', full_name: 'Bob' }, error: null }));
    mockFrom.mockReturnValueOnce(makeCount(5));

    const result = await deleteStaff('staff-1');
    expect(result.error).toContain('5 transaction(s)');
    expect(result.error).toContain('deactivate');
  });

  it('deletes staff with no transactions and logs audit', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(OWNER_PROFILE));
    mockFrom.mockReturnValueOnce(makeSelect({ data: { id: 'staff-1', company_id: 'comp-1', full_name: 'Bob' }, error: null }));
    mockFrom.mockReturnValueOnce(makeCount(0));
    // delete profile
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mockAdminDeleteUser.mockResolvedValueOnce({});

    const result = await deleteStaff('staff-1');
    expect(result).toEqual({ error: null });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.deleted', entity_id: 'staff-1' })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/staff');
  });
});
