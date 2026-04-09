import { createClient } from '@/lib/supabase/server';
import type { Supplier, Ingredient, StockReceipt, StockReceiptLine } from '@/lib/types';
import { StockTabs } from './stock-tabs';
import type { StockTab } from './stock-tabs';
import { SuppliersClient } from './suppliers-client';
import { ReceiveStockClient } from './receive-stock-client';
import { IngredientsClient } from './ingredients-client';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'receive' } = await searchParams;
  const activeTab = tab as StockTab;

  const supabase = await createClient();

  let content: React.ReactNode;

  if (activeTab === 'ingredients') {
    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');

    content = <IngredientsClient ingredients={(ingredients as Ingredient[]) ?? []} />;

  } else if (activeTab === 'suppliers') {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    content = <SuppliersClient suppliers={(suppliers as Supplier[]) ?? []} />;

  } else {
    // Receive Stock tab — fetch everything needed
    const [
      { data: suppliers },
      { data: ingredients },
      { data: receipts },
    ] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('ingredients').select('*').order('name'),
      supabase
        .from('stock_receipts')
        .select('*, stock_receipt_lines(*, ingredients(name))')
        .order('receipt_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // Flatten the nested join into the shape ReceiveStockClient expects
    type RawReceipt = StockReceipt & {
      stock_receipt_lines: (StockReceiptLine & { ingredients: { name: string } | null })[];
    };

    const enrichedReceipts = ((receipts as RawReceipt[]) ?? []).map(r => {
      const supplierName = (suppliers as Supplier[])?.find(s => s.id === r.supplier_id)?.name ?? null;
      return {
        ...r,
        supplier_name: supplierName,
        lines: r.stock_receipt_lines.map(line => ({
          ...line,
          ingredient_name: line.ingredients?.name ?? '(deleted)',
        })),
      };
    });

    content = (
      <ReceiveStockClient
        suppliers={(suppliers as Supplier[]) ?? []}
        ingredients={(ingredients as Ingredient[]) ?? []}
        receipts={enrichedReceipts}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stock</h1>
        <p className="text-gray-600 text-sm mt-1">
          Manage suppliers and record stock deliveries to keep ingredient costs up to date.
        </p>
      </div>

      <StockTabs activeTab={activeTab} />

      {content}
    </div>
  );
}
