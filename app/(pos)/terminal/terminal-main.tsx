'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Category, Product } from '@/lib/types';
import { formatNZD } from '@/lib/types';
import { useCart, cartTotals } from '@/lib/store/cart';
import { useActiveStaff } from '@/lib/store/active-staff';
import { PaymentModal, ReceiptModal } from './payment-modal';
import type { PlaceOrderResult } from './actions';

// ─── Product grid ────────────────────────────────────────────

function ProductButton({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      disabled={!product.available}
      className={`flex flex-col items-start justify-between bg-white border rounded-xl p-3 text-left transition-all active:scale-95 ${
        product.available
          ? 'border-gray-200 hover:border-gray-400 hover:shadow-sm cursor-pointer'
          : 'border-gray-100 opacity-40 cursor-not-allowed'
      }`}
    >
      <p className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{product.name}</p>
      {product.description && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{product.description}</p>
      )}
      <p className="text-sm font-semibold text-gray-900 mt-2">{formatNZD(product.price_cents)}</p>
    </button>
  );
}

// ─── Order panel ─────────────────────────────────────────────

function OrderPanel({
  onCharge,
}: {
  onCharge: () => void;
}) {
  const { lines, updateQuantity, removeItem, clear } = useCart();
  const { subtotal_cents, gst_cents, total_cents } = cartTotals(lines);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Current Order</h2>
        {lines.length > 0 && (
          <button
            onClick={clear}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Line items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {lines.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">
            Tap items to add them to the order
          </p>
        )}
        {lines.map(line => (
          <div key={line.product_id} className="flex items-center gap-2">
            {/* Qty controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateQuantity(line.product_id, -1)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm hover:bg-gray-200 active:scale-90"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-medium text-gray-900">
                {line.quantity}
              </span>
              <button
                onClick={() => updateQuantity(line.product_id, 1)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm hover:bg-gray-200 active:scale-90"
              >
                +
              </button>
            </div>

            {/* Name + price */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 truncate">{line.name}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-medium text-gray-900">
                {formatNZD(line.price_cents * line.quantity)}
              </p>
            </div>
            <button
              onClick={() => removeItem(line.product_id)}
              className="text-gray-300 hover:text-red-500 text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Totals + charge button */}
      {lines.length > 0 && (
        <div className="border-t border-gray-200 p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>{formatNZD(subtotal_cents)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>GST included</span>
            <span>{formatNZD(gst_cents)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-lg pt-1 border-t border-gray-200">
            <span>Total</span>
            <span>{formatNZD(total_cents)}</span>
          </div>
          <button
            onClick={onCharge}
            className="w-full py-4 mt-1 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 active:scale-95 transition-all"
          >
            Charge {formatNZD(total_cents)}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main terminal ────────────────────────────────────────────

export function TerminalMain() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<PlaceOrderResult | null>(null);

  const { lines, tableId, customerName, clear } = useCart();
  const { staff_id, full_name, clearStaff } = useActiveStaff();

  // Fetch menu data on mount
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('categories').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('products').select('*').eq('available', true).order('sort_order').order('name'),
    ]).then(([{ data: cats }, { data: prods }]) => {
      setCategories((cats as Category[]) ?? []);
      setProducts((prods as Product[]) ?? []);
      setActiveCategoryId((cats?.[0] as Category)?.id ?? '');
      setLoading(false);
    });
  }, []);

  const visibleProducts = products.filter(
    p => p.category_id === activeCategoryId && p.available
  );
  const addItem = useCart(state => state.addItem);

  function handlePaymentSuccess(result: PlaceOrderResult) {
    setShowPayment(false);
    setReceipt(result);
  }

  function handleReceiptDone() {
    clear();
    setReceipt(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading menu...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── Left: menu browser ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <span className="font-bold text-gray-900 text-lg">KeaPOS</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{full_name}</span>
            <button
              onClick={clearStaff}
              className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1 rounded-lg hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="bg-white border-b border-gray-200 px-4 overflow-x-auto">
          <div className="flex gap-1 py-2 min-w-max">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  cat.id === activeCategoryId
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {categories.length === 0 && (
            <div className="text-center mt-16 text-gray-400">
              <p className="text-lg font-medium">No menu configured</p>
              <p className="text-sm mt-1">Go to Admin → Menu to add categories and products.</p>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {visibleProducts.map(product => (
              <ProductButton
                key={product.id}
                product={product}
                onAdd={() => addItem(product)}
              />
            ))}
            {visibleProducts.length === 0 && categories.length > 0 && (
              <div className="col-span-full text-center text-gray-400 text-sm mt-8">
                No available products in this category.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: order panel ── */}
      <div className="w-72 xl:w-80 bg-white border-l border-gray-200 flex-shrink-0">
        <OrderPanel onCharge={() => setShowPayment(true)} />
      </div>

      {/* ── Payment modal ── */}
      {showPayment && staff_id && (
        <PaymentModal
          lines={lines}
          tableId={tableId}
          customerName={customerName}
          staffId={staff_id}
          onSuccess={handlePaymentSuccess}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* ── Receipt / success modal ── */}
      {receipt && receipt.order_number && (
        <ReceiptModal
          orderNumber={receipt.order_number}
          total_cents={cartTotals(lines).total_cents}
          change_cents={receipt.change_cents}
          onDone={handleReceiptDone}
        />
      )}
    </div>
  );
}
