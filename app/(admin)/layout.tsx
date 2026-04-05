import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/auth/actions';

const navigation = [
  { name: 'Dashboard',  href: '/dashboard' },
  { name: 'Menu',       href: '/dashboard/menu' },
  { name: 'Locations',  href: '/dashboard/locations' },
  { name: 'Terminals',  href: '/dashboard/terminals' },
  { name: 'Staff',      href: '/dashboard/staff' },
  { name: 'Reports',    href: '/dashboard/reports' },
  { name: 'Settings',   href: '/dashboard/settings' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900">KeaPOS</h1>
            <p className="text-sm text-gray-500">Admin Portal</p>
          </div>

          <nav className="px-4 flex-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block px-4 py-2 mb-1 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-200 space-y-2">
            <Link
              href="/terminal"
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2 text-center text-white bg-gray-900 rounded-lg hover:bg-gray-700 text-sm font-medium"
            >
              Open POS Terminal
            </Link>

            {/* Signed-in user + sign out */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500 truncate max-w-[140px]">
                {user?.email}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-xs text-gray-500 hover:text-gray-900 underline"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
