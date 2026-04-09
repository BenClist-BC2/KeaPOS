'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Dashboard',  href: '/dashboard',           icon: '⊞' },
  { name: 'Menu',       href: '/dashboard/menu',       icon: '🍽️' },
  { name: 'Stock',      href: '/dashboard/stock',      icon: '📦' },
  { name: 'Locations',  href: '/dashboard/locations',  icon: '📍' },
  { name: 'Terminals',  href: '/dashboard/terminals',  icon: '🖥️' },
  { name: 'Staff',      href: '/dashboard/staff',      icon: '👥' },
  { name: 'Reports',    href: '/dashboard/reports',    icon: '📊' },
  { name: 'Settings',   href: '/dashboard/settings',   icon: '⚙️' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5">
      {navigation.map((item) => {
        const active = item.href === '/dashboard'
          ? pathname === '/dashboard'
          : pathname.startsWith(item.href);

        return (
          <li key={item.name}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
