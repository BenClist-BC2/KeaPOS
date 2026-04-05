import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRevalidatePath, mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { createLocation, updateLocation } from '@/app/(admin)/dashboard/locations/actions';

const ADMIN_USER = { id: 'admin-1' };
const ADMIN_PROFILE = { data: { company_id: 'comp-1' }, error: null };

function makeSelect(result: object) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeInsert(result: object) {
  return { insert: vi.fn().mockResolvedValue(result) };
}

function makeUpdate(result: object) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  };
}

// ─── createLocation ──────────────────────────────────────────

describe('createLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const fd = new FormData();
    fd.set('name', 'Auckland CBD');
    expect(await createLocation(fd)).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when location name is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const fd = new FormData();
    expect(await createLocation(fd)).toEqual({ error: 'Location name is required' });
  });

  it('returns error when DB insert fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    mockFrom.mockReturnValueOnce(makeInsert({ error: { message: 'duplicate name' } }));
    const fd = new FormData();
    fd.set('name', 'Auckland CBD');
    expect(await createLocation(fd)).toEqual({ error: 'duplicate name' });
  });

  it('creates location and revalidates path on success', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const mockInsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ insert: mockInsertFn });

    const fd = new FormData();
    fd.set('name', 'Auckland CBD');
    fd.set('address', '123 Queen St');
    fd.set('timezone', 'Pacific/Auckland');

    const result = await createLocation(fd);
    expect(result).toEqual({ error: null });
    expect(mockInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'comp-1',
        name: 'Auckland CBD',
        address: '123 Queen St',
        timezone: 'Pacific/Auckland',
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/locations');
  });

  it('defaults timezone to Pacific/Auckland when not provided', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const mockInsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ insert: mockInsertFn });

    const fd = new FormData();
    fd.set('name', 'Queenstown');

    await createLocation(fd);
    expect(mockInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'Pacific/Auckland' })
    );
  });
});

// ─── updateLocation ──────────────────────────────────────────

describe('updateLocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when location name is missing', async () => {
    expect(await updateLocation('loc-1', new FormData())).toEqual({ error: 'Location name is required' });
  });

  it('returns error when DB update fails', async () => {
    mockFrom.mockReturnValueOnce(makeUpdate({ error: { message: 'constraint violation' } }));
    const fd = new FormData();
    fd.set('name', 'Renamed Location');
    expect(await updateLocation('loc-1', fd)).toEqual({ error: 'constraint violation' });
  });

  it('updates location and revalidates path on success', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdateFn = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ update: mockUpdateFn });

    const fd = new FormData();
    fd.set('name', 'Updated Name');
    fd.set('active', 'true');

    const result = await updateLocation('loc-1', fd);
    expect(result).toEqual({ error: null });
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Name', active: true })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/locations');
  });
});
