'use client';

import Link from 'next/link';

const TABS = [
  { key: 'receive',     label: 'Receive Stock' },
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'suppliers',   label: 'Suppliers' },
] as const;

export type StockTab = typeof TABS[number]['key'];

export function StockTabs({ activeTab }: { activeTab: StockTab }) {
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      {TABS.map(tab => (
        <Link
          key={tab.key}
          href={`/dashboard/stock?tab=${tab.key}`}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === tab.key
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
