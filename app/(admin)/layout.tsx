import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/auth/actions';
import { NavLinks } from './nav-links';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 min-h-screen bg-white border-r border-gray-200 flex flex-col shadow-sm">
          {/* Brand */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">K</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900">KeaPOS</h1>
                <p className="text-xs text-gray-400">Admin Portal</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4">
            <NavLinks />
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100">
            <Link
              href="/terminal"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Open POS Terminal
            </Link>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400 truncate max-w-[140px]">{user?.email}</span>
              <form action={signOut}>
                <button type="submit" className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}
