import { createClient } from '@/lib/supabase/server';
import type { Category, Product, Ingredient, RecipeLine, ModifierGroup, Modifier, ProductModifierOption } from '@/lib/types';
import { MenuTabs } from './menu-tabs';
import type { MenuTab } from './menu-tabs';
import { MenuClient } from './menu-client';
import { ModifiersClient } from './modifiers-client';

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'menu' } = await searchParams;
  const activeTab = tab as MenuTab;

  const supabase = await createClient();

  let content: React.ReactNode;

  if (activeTab === 'modifiers') {
    const [{ data: modifierGroups }, { data: modifiers }] = await Promise.all([
      supabase.from('modifier_groups').select('*').order('name'),
      supabase.from('modifiers').select('*').order('sort_order').order('name'),
    ]);

    content = (
      <ModifiersClient
        modifierGroups={(modifierGroups as ModifierGroup[]) ?? []}
        modifiers={(modifiers as Modifier[]) ?? []}
      />
    );

  } else {
    const [
      { data: categories },
      { data: products },
      { data: ingredients },
      { data: recipeLines },
      { data: modifierGroups },
      { data: modifiers },
      { data: productModifierGroupRows },
      { data: productModifierOptionRows },
      { data: company },
    ] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('products').select('*').order('sort_order').order('name'),
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('recipe_lines').select('*').order('sort_order'),
      supabase.from('modifier_groups').select('*').order('name'),
      supabase.from('modifiers').select('*').order('sort_order'),
      supabase.from('product_modifier_groups').select('product_id, modifier_group_id'),
      supabase.from('product_modifier_options').select('*'),
      supabase.from('companies').select('default_gst_rate').single(),
    ]);

    const recipeLinesByProductId = ((recipeLines as RecipeLine[]) ?? []).reduce(
      (acc, line) => {
        if (!acc[line.product_id]) acc[line.product_id] = [];
        acc[line.product_id].push(line);
        return acc;
      },
      {} as Record<string, RecipeLine[]>
    );

    // Build productId → Set<modifierGroupId> for the product form assignment UI
    const productModifierGroups = (
      (productModifierGroupRows as { product_id: string; modifier_group_id: string }[]) ?? []
    ).reduce(
      (acc, row) => {
        if (!acc[row.product_id]) acc[row.product_id] = new Set<string>();
        acc[row.product_id].add(row.modifier_group_id);
        return acc;
      },
      {} as Record<string, Set<string>>
    );

    content = (
      <MenuClient
        categories={(categories as Category[]) ?? []}
        products={(products as Product[]) ?? []}
        ingredients={(ingredients as Ingredient[]) ?? []}
        recipeLinesByProductId={recipeLinesByProductId}
        modifierGroups={(modifierGroups as ModifierGroup[]) ?? []}
        allModifiers={(modifiers as Modifier[]) ?? []}
        productModifierGroups={productModifierGroups}
        productModifierOptions={(productModifierOptionRows as ProductModifierOption[]) ?? []}
        gstRate={company?.default_gst_rate ?? 15}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
        <p className="text-gray-600 text-sm mt-1">
          Manage categories, products, and ingredients shared across all locations.
        </p>
      </div>

      <MenuTabs activeTab={activeTab} />

      {content}
    </div>
  );
}
