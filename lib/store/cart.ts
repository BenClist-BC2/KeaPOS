import { create } from 'zustand';
import type { Product } from '@/lib/types';

export interface CartLine {
  product_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  notes: string;
}

interface CartState {
  lines: CartLine[];
  tableId: string | null;
  customerName: string;

  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, delta: number) => void;
  setNotes: (productId: string, notes: string) => void;
  setTable: (tableId: string | null) => void;
  setCustomerName: (name: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  tableId: null,
  customerName: '',

  addItem: (product) =>
    set((state) => {
      const existing = state.lines.find(l => l.product_id === product.id);
      if (existing) {
        return {
          lines: state.lines.map(l =>
            l.product_id === product.id
              ? { ...l, quantity: l.quantity + 1 }
              : l
          ),
        };
      }
      return {
        lines: [
          ...state.lines,
          {
            product_id: product.id,
            name: product.name,
            price_cents: product.price_cents,
            quantity: 1,
            notes: '',
          },
        ],
      };
    }),

  removeItem: (productId) =>
    set((state) => ({
      lines: state.lines.filter(l => l.product_id !== productId),
    })),

  updateQuantity: (productId, delta) =>
    set((state) => {
      const lines = state.lines
        .map(l =>
          l.product_id === productId
            ? { ...l, quantity: l.quantity + delta }
            : l
        )
        .filter(l => l.quantity > 0);
      return { lines };
    }),

  setNotes: (productId, notes) =>
    set((state) => ({
      lines: state.lines.map(l =>
        l.product_id === productId ? { ...l, notes } : l
      ),
    })),

  setTable: (tableId) => set({ tableId }),
  setCustomerName: (customerName) => set({ customerName }),

  clear: () => set({ lines: [], tableId: null, customerName: '' }),
}));

// ─── Derived totals ──────────────────────────────────────────

/** NZ GST rate */
export const GST_RATE = 0.15;

export function cartTotals(lines: CartLine[]) {
  const subtotal_cents = lines.reduce(
    (sum, l) => sum + l.price_cents * l.quantity,
    0
  );
  // NZ prices are GST-inclusive; GST content = total × (15/115)
  const gst_cents = Math.round(subtotal_cents * (GST_RATE / (1 + GST_RATE)));
  return { subtotal_cents, gst_cents, total_cents: subtotal_cents };
}
