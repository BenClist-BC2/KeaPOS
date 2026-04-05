import { createClient } from '@/lib/supabase/server';
import { TerminalClient } from './terminal-client';
import type { Category, Product } from '@/lib/types';

export default async function POSTerminal() {
  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('products')
      .select('*')
      .eq('available', true)
      .order('sort_order')
      .order('name'),
  ]);

  return (
    <TerminalClient
      categories={(categories as Category[]) ?? []}
      products={(products as Product[]) ?? []}
    />
  );
}
