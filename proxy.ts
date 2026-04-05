import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export async function middleware(request: NextRequest) {
  // If Supabase isn't configured yet (e.g. local dev without .env.local),
  // pass all requests through so the app is still browsable.
  if (!supabaseConfigured) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh session — must not call supabase.auth between createServerClient
  // and this line to avoid session bugs.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  // Redirect unauthenticated users to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && pathname === '/login') {
    const redirectTo = request.nextUrl.searchParams.get('redirectTo') ?? '/dashboard';
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico, manifest.json, sw.js, workbox-* (public assets)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|workbox-.*).*)',
  ],
};
