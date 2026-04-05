'use client';

import { useState, useTransition } from 'react';
import type { Category, Product } from '@/lib/types';
import { formatNZD } from '@/lib/types';
import {
  createCategory, updateCategory, deleteCategory,
  createProduct,  updateProduct,  deleteProduct,
} from './actions';

// ─── Shared UI ────────────────────────────────────────────────

function ErrorMsg({ message }: { message: string }) {
  return <p className="text-sm text-red-600 mt-1">{message}</p>;
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Category form (add / edit) ────────────────────────────

interface CategoryFormProps {
  category?: Category;
  onDone: () => void;
}

function CategoryForm({ category, onDone }: CategoryFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = category
        ? await updateCategory(category.id, fd)
        : await createCategory(fd);
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          name="name"
          defaultValue={category?.name}
          required
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Sort order</label>
        <input
          name="sort_order"
          type="number"
          defaultValue={category?.sort_order ?? 0}
          className="mt-1 block w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      {category && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="active"
            value="true"
            id="cat-active"
            defaultChecked={category.active}
          />
          <label htmlFor="cat-active" className="text-sm text-gray-700">Active</label>
          {/* Hidden field so unchecked checkbox still submits false */}
          <input type="hidden" name="active" value="false" />
        </div>
      )}
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Product form (add / edit) ────────────────────────────

interface ProductFormProps {
  product?: Product;
  categories: Category[];
  defaultCategoryId?: string;
  onDone: () => void;
}

function ProductForm({ product, categories, defaultCategoryId, onDone }: ProductFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = product
        ? await updateProduct(product.id, fd)
        : await createProduct(fd);
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  const defaultPrice = product
    ? (product.price_cents / 100).toFixed(2)
    : '';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            defaultValue={product?.name}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <select
            name="category_id"
            defaultValue={product?.category_id ?? defaultCategoryId}
            required
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Price (NZD)</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultPrice}
              required
              className="block w-full border border-gray-300 rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            name="description"
            defaultValue={product?.description ?? ''}
            rows={2}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Sort order</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={product?.sort_order ?? 0}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        {product && (
          <div className="flex items-end pb-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="available"
                value="true"
                id="prod-available"
                defaultChecked={product.available}
              />
              <label htmlFor="prod-available" className="text-sm text-gray-700">Available</label>
              <input type="hidden" name="available" value="false" />
            </div>
          </div>
        )}
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Delete button ────────────────────────────────────────

function DeleteButton({ action, label }: { action: () => Promise<{ error: string | null }>; label: string }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="text-xs text-red-500 hover:text-red-700"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-gray-600">Sure?</span>
      <button
        onClick={() => { startTransition(async () => { await action(); }); }}
        disabled={pending}
        className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
      >
        {pending ? '…' : 'Yes'}
      </button>
      <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">
        No
      </button>
    </span>
  );
}

// ─── Main menu client component ───────────────────────────

interface MenuClientProps {
  categories: Category[];
  products: Product[];
}

export function MenuClient({ categories, products }: MenuClientProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  );
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const visibleProducts = products.filter(p => p.category_id === selectedCategoryId);

  return (
    <div className="flex gap-6 h-full">
      {/* ── Categories sidebar ── */}
      <div className="w-56 flex-shrink-0">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Categories</h2>
            <button
              onClick={() => { setAddingCategory(true); setEditingCategoryId(null); }}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              + Add
            </button>
          </div>

          {addingCategory && (
            <div className="p-4 border-b border-gray-100">
              <CategoryForm onDone={() => setAddingCategory(false)} />
            </div>
          )}

          <ul className="py-1">
            {categories.map(cat => (
              <li key={cat.id}>
                {editingCategoryId === cat.id ? (
                  <div className="px-4 py-2 border-b border-gray-100">
                    <CategoryForm
                      category={cat}
                      onDone={() => setEditingCategoryId(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedCategoryId(cat.id); setAddingProduct(false); setEditingProductId(null); }}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 ${
                      cat.id === selectedCategoryId ? 'bg-gray-50 font-medium' : ''
                    }`}
                  >
                    <span className="text-sm text-gray-800">{cat.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingCategoryId(cat.id); }}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Edit
                      </button>
                    </div>
                  </button>
                )}
              </li>
            ))}
            {categories.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">No categories yet</li>
            )}
          </ul>
        </div>

        {selectedCategory && editingCategoryId !== selectedCategory.id && (
          <div className="mt-2 flex gap-2 px-1">
            <button
              onClick={() => setEditingCategoryId(selectedCategory.id)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Edit category
            </button>
            <DeleteButton
              action={() => deleteCategory(selectedCategory.id)}
              label="delete category"
            />
          </div>
        )}
      </div>

      {/* ── Products panel ── */}
      <div className="flex-1">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {selectedCategory ? `${selectedCategory.name} — Products` : 'Products'}
            </h2>
            {selectedCategory && (
              <button
                onClick={() => { setAddingProduct(true); setEditingProductId(null); }}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                + Add product
              </button>
            )}
          </div>

          {addingProduct && selectedCategoryId && (
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">New product</h3>
              <ProductForm
                categories={categories}
                defaultCategoryId={selectedCategoryId}
                onDone={() => setAddingProduct(false)}
              />
            </div>
          )}

          <ul className="divide-y divide-gray-100">
            {visibleProducts.map(product => (
              <li key={product.id} className="px-4 py-3">
                {editingProductId === product.id ? (
                  <div className="py-1">
                    <ProductForm
                      product={product}
                      categories={categories}
                      onDone={() => setEditingProductId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{product.name}</span>
                        <Badge active={product.available} />
                      </div>
                      {product.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{product.description}</p>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-3 flex-shrink-0">
                      <span className="font-medium text-gray-900 text-sm">
                        {formatNZD(product.price_cents)}
                      </span>
                      <button
                        onClick={() => setEditingProductId(product.id)}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Edit
                      </button>
                      <DeleteButton
                        action={() => deleteProduct(product.id)}
                        label="delete product"
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
            {visibleProducts.length === 0 && !addingProduct && (
              <li className="px-4 py-8 text-center text-sm text-gray-400">
                {selectedCategory
                  ? 'No products in this category yet.'
                  : 'Select a category to manage its products.'}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
