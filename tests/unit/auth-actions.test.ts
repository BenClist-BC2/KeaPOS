import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockSignIn, mockSignOut } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockSignIn:   vi.fn(),
  mockSignOut:  vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithPassword: mockSignIn,
      signOut: mockSignOut,
    },
  }),
}));

import { signIn, signOut } from '@/lib/auth/actions';

describe('signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error when email is missing', async () => {
    const formData = new FormData();
    formData.set('password', 'secret');
    const result = await signIn(null, formData);
    expect(result).toBe('Email and password are required.');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns an error when password is missing', async () => {
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    const result = await signIn(null, formData);
    expect(result).toBe('Email and password are required.');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns the Supabase error message on failed sign-in', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'wrong');
    const result = await signIn(null, formData);
    expect(result).toBe('Invalid login credentials');
  });

  it('calls redirect on successful sign-in', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    mockRedirect.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT'); });

    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'correct');

    await expect(signIn(null, formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
  });

  it('respects custom redirectTo value', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    mockRedirect.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT'); });

    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'correct');
    formData.set('redirectTo', '/terminal');

    await expect(signIn(null, formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/terminal');
  });

  it('calls signInWithPassword with correct credentials', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    mockRedirect.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT'); });

    const formData = new FormData();
    formData.set('email', 'staff@aroha.co.nz');
    formData.set('password', 'mypassword');

    await expect(signIn(null, formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'staff@aroha.co.nz',
      password: 'mypassword',
    });
  });
});

describe('signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls supabase signOut', async () => {
    mockSignOut.mockResolvedValueOnce({});
    mockRedirect.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT'); });

    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('redirects to /login after sign out', async () => {
    mockSignOut.mockResolvedValueOnce({});
    mockRedirect.mockImplementationOnce(() => { throw new Error('NEXT_REDIRECT'); });

    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
