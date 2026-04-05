import { createClient } from '@/lib/supabase/server';
import { MenuClient } from './menu-client';
import type { Category, Product } from '@/lib/types';

export default async function MenuPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .order('sort_order')
      .order('name'),
    supabase
      .from('products')
      .select('*')
      .order('sort_order')
      .order('name'),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
        <p className="text-gray-600 text-sm mt-1">
          Manage categories and products shared across all locations.
        </p>
      </div>

      <MenuClient
        categories={(categories as Category[]) ?? []}
        products={(products as Product[]) ?? []}
      />
    </div>
  );
}
