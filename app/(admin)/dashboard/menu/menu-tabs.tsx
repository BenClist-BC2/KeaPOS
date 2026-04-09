'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const TABS = [
  { key: 'menu',      label: 'Menu' },
  { key: 'modifiers', label: 'Modifiers' },
] as const;

export type MenuTab = typeof TABS[number]['key'];

export function MenuTabs({ activeTab }: { activeTab: MenuTab }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(tab: MenuTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex gap-6">
        {TABS.map(({ key, label }) => {
          const active = key === activeTab;
          return (
            <Link
              key={key}
              href={href(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
