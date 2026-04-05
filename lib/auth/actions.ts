'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign in with email and password.
 * Returns an error message string on failure, or redirects on success.
 */
export async function signIn(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  const email    = formData.get('email')    as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string || '/dashboard';

  if (!email || !password) {
    return 'Email and password are required.';
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return error.message;
  }

  redirect(redirectTo);
}

/**
 * Sign out the current user and redirect to login.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
