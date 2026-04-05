import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockGetUser        = vi.fn();
const mockOnAuthChange   = vi.fn();
const mockUnsubscribe    = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthChange,
    },
  })),
}));

import { useAuth } from '@/lib/auth/useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  it('starts in loading state with no user', () => {
    // Keep getUser pending so we stay in loading state
    mockGetUser.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('sets user and clears loading once getUser resolves', async () => {
    const fakeUser = { id: 'abc', email: 'user@example.com' };
    mockGetUser.mockResolvedValueOnce({ data: { user: fakeUser } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(fakeUser);
  });

  it('sets user to null when no session exists', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('updates user when auth state changes', async () => {
    const fakeUser = { id: 'xyz', email: 'staff@aroha.co.nz' };
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    let authChangeCallback: (event: string, session: any) => void = () => {};
    mockOnAuthChange.mockImplementation((cb: typeof authChangeCallback) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();

    act(() => {
      authChangeCallback('SIGNED_IN', { user: fakeUser });
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.loading).toBe(false);
  });

  it('clears user on sign out', async () => {
    const fakeUser = { id: 'abc', email: 'user@example.com' };
    mockGetUser.mockResolvedValueOnce({ data: { user: fakeUser } });

    let authChangeCallback: (event: string, session: any) => void = () => {};
    mockOnAuthChange.mockImplementation((cb: typeof authChangeCallback) => {
      authChangeCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).toEqual(fakeUser));

    act(() => {
      authChangeCallback('SIGNED_OUT', null);
    });

    expect(result.current.user).toBeNull();
  });

  it('unsubscribes on unmount', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const { unmount } = renderHook(() => useAuth());
    await waitFor(() => expect(mockOnAuthChange).toHaveBeenCalled());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
