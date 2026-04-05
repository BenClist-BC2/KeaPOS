import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { verifyPIN } from '@/app/(pos)/terminal/pin-actions';

describe('verifyPIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when terminal not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await verifyPIN('1234');
    expect(result.error).toBe('Terminal not authenticated');
    expect(result.staff_id).toBeNull();
  });

  it('returns error when authenticated user is not a terminal', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
    });

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValueOnce({
      data: { company_id: 'comp-1', location_id: 'loc-1', role: 'owner' },
    });

    mockFrom.mockReturnValueOnce({
      select: mockSelect,
    });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockEq.mockReturnValueOnce({ single: mockSingle });

    const result = await verifyPIN('1234');
    expect(result.error).toBe('Not a terminal device');
  });

  it('returns error when no staff with PINs found', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'terminal-1' } },
    });

    // Terminal profile query
    const mockSelect1 = vi.fn().mockReturnThis();
    const mockEq1 = vi.fn().mockReturnThis();
    const mockSingle1 = vi.fn().mockResolvedValueOnce({
      data: { company_id: 'comp-1', location_id: 'loc-1', role: 'terminal' },
    });

    mockFrom.mockReturnValueOnce({
      select: mockSelect1,
    });
    mockSelect1.mockReturnValueOnce({ eq: mockEq1 });
    mockEq1.mockReturnValueOnce({ single: mockSingle1 });

    // Staff query
    const mockSelect2 = vi.fn().mockReturnThis();
    const mockEq2 = vi.fn().mockReturnThis();
    const mockEq3 = vi.fn().mockReturnThis();
    const mockIn = vi.fn().mockReturnThis();
    const mockNot = vi.fn().mockResolvedValueOnce({ data: [] });

    mockFrom.mockReturnValueOnce({
      select: mockSelect2,
    });
    mockSelect2.mockReturnValueOnce({ eq: mockEq2 });
    mockEq2.mockReturnValueOnce({ eq: mockEq3 });
    mockEq3.mockReturnValueOnce({ in: mockIn });
    mockIn.mockReturnValueOnce({ not: mockNot });

    const result = await verifyPIN('1234');
    expect(result.error).toBe('No staff with PINs found');
  });

  it('returns error when PIN does not match any staff', async () => {
    const hash = await bcrypt.hash('5678', 10);

    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'terminal-1' } },
    });

    // Terminal profile
    const mockSelect1 = vi.fn().mockReturnThis();
    const mockEq1 = vi.fn().mockReturnThis();
    const mockSingle1 = vi.fn().mockResolvedValueOnce({
      data: { company_id: 'comp-1', location_id: 'loc-1', role: 'terminal' },
    });

    mockFrom.mockReturnValueOnce({
      select: mockSelect1,
    });
    mockSelect1.mockReturnValueOnce({ eq: mockEq1 });
    mockEq1.mockReturnValueOnce({ single: mockSingle1 });

    // Staff query with wrong hash
    const mockSelect2 = vi.fn().mockReturnThis();
    const mockEq2 = vi.fn().mockReturnThis();
    const mockEq3 = vi.fn().mockReturnThis();
    const mockIn = vi.fn().mockReturnThis();
    const mockNot = vi.fn().mockResolvedValueOnce({
      data: [
        { id: 'staff-1', full_name: 'Jane Doe', role: 'staff', pin_hash: hash },
      ],
    });

    mockFrom.mockReturnValueOnce({
      select: mockSelect2,
    });
    mockSelect2.mockReturnValueOnce({ eq: mockEq2 });
    mockEq2.mockReturnValueOnce({ eq: mockEq3 });
    mockEq3.mockReturnValueOnce({ in: mockIn });
    mockIn.mockReturnValueOnce({ not: mockNot });

    const result = await verifyPIN('1234'); // Wrong PIN
    expect(result.error).toBe('Invalid PIN');
    expect(result.staff_id).toBeNull();
  });

  it('returns staff info when PIN matches', async () => {
    const correctPIN = '1234';
    const hash = await bcrypt.hash(correctPIN, 10);

    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'terminal-1' } },
    });

    // Terminal profile
    const mockSelect1 = vi.fn().mockReturnThis();
    const mockEq1 = vi.fn().mockReturnThis();
    const mockSingle1 = vi.fn().mockResolvedValueOnce({
      data: { company_id: 'comp-1', location_id: 'loc-1', role: 'terminal' },
    });

    mockFrom.mockReturnValueOnce({
      select: mockSelect1,
    });
    mockSelect1.mockReturnValueOnce({ eq: mockEq1 });
    mockEq1.mockReturnValueOnce({ single: mockSingle1 });

    // Staff query
    const mockSelect2 = vi.fn().mockReturnThis();
    const mockEq2 = vi.fn().mockReturnThis();
    const mockEq3 = vi.fn().mockReturnThis();
    const mockIn = vi.fn().mockReturnThis();
    const mockNot = vi.fn().mockResolvedValueOnce({
      data: [
        { id: 'staff-1', full_name: 'Jane Doe', role: 'manager', pin_hash: hash },
      ],
    });

    mockFrom.mockReturnValueOnce({
      select: mockSelect2,
    });
    mockSelect2.mockReturnValueOnce({ eq: mockEq2 });
    mockEq2.mockReturnValueOnce({ eq: mockEq3 });
    mockEq3.mockReturnValueOnce({ in: mockIn });
    mockIn.mockReturnValueOnce({ not: mockNot });

    const result = await verifyPIN(correctPIN);
    expect(result.error).toBeNull();
    expect(result.staff_id).toBe('staff-1');
    expect(result.full_name).toBe('Jane Doe');
    expect(result.role).toBe('manager');
  });
});
