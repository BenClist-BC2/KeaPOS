import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes the auth session via HTTP cookies.
 *
 * Falls back to placeholder values when env vars are not set so the app
 * remains browsable during local development without a Supabase project.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL    ?? PLACEHOLDER_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? PLACEHOLDER_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — cookies can only be set
            // in middleware or Route Handlers. Safe to ignore here.
          }
        },
      },
    }
  );
}
