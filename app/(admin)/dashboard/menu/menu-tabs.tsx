'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const TABS = [
  { key: 'menu',      label: 'Products & Categories', description: 'Manage your menu items' },
  { key: 'modifiers', label: 'Modifiers',              description: 'Add-ons and options' },
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
      <nav className="-mb-px flex gap-1">
        {TABS.map(({ key, label }) => {
          const active = key === activeTab;
          return (
            <Link
              key={key}
              href={href(key)}
              className={`px-5 pb-4 pt-1 text-base font-medium border-b-2 transition-colors rounded-t ${
                active
                  ? 'border-indigo-600 text-indigo-700'
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
