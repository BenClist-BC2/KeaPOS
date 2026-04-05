import { describe, it, expect, beforeEach } from 'vitest';
import { useCart, cartTotals, GST_RATE } from '@/lib/store/cart';
import type { Product } from '@/lib/types';

// Reset Zustand store before each test
beforeEach(() => {
  useCart.setState({ lines: [], tableId: null, customerName: '' });
});

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-1',
  company_id: 'comp-1',
  category_id: 'cat-1',
  name: 'Flat White',
  description: null,
  price_cents: 600,
  available: true,
  image_url: null,
  sort_order: 1,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('useCart — addItem', () => {
  it('adds a new line when product not in cart', () => {
    const product = makeProduct();
    useCart.getState().addItem(product);
    const { lines } = useCart.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].product_id).toBe('prod-1');
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].price_cents).toBe(600);
  });

  it('increments quantity when same product added again', () => {
    const product = makeProduct();
    useCart.getState().addItem(product);
    useCart.getState().addItem(product);
    const { lines } = useCart.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it('adds separate lines for different products', () => {
    useCart.getState().addItem(makeProduct({ id: 'prod-1', name: 'Flat White' }));
    useCart.getState().addItem(makeProduct({ id: 'prod-2', name: 'Long Black' }));
    expect(useCart.getState().lines).toHaveLength(2);
  });
});

describe('useCart — removeItem', () => {
  it('removes a line by product id', () => {
    useCart.getState().addItem(makeProduct());
    useCart.getState().removeItem('prod-1');
    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('does nothing if product not in cart', () => {
    useCart.getState().addItem(makeProduct());
    useCart.getState().removeItem('nonexistent');
    expect(useCart.getState().lines).toHaveLength(1);
  });
});

describe('useCart — updateQuantity', () => {
  it('increments quantity', () => {
    useCart.getState().addItem(makeProduct());
    useCart.getState().updateQuantity('prod-1', 2);
    expect(useCart.getState().lines[0].quantity).toBe(3);
  });

  it('decrements quantity', () => {
    useCart.getState().addItem(makeProduct());
    useCart.getState().addItem(makeProduct()); // qty = 2
    useCart.getState().updateQuantity('prod-1', -1);
    expect(useCart.getState().lines[0].quantity).toBe(1);
  });

  it('removes line when quantity reaches zero', () => {
    useCart.getState().addItem(makeProduct());
    useCart.getState().updateQuantity('prod-1', -1);
    expect(useCart.getState().lines).toHaveLength(0);
  });
});

describe('useCart — clear', () => {
  it('empties the cart and resets metadata', () => {
    useCart.getState().addItem(makeProduct());
    useCart.getState().setTable('table-1');
    useCart.getState().setCustomerName('Alice');
    useCart.getState().clear();
    const state = useCart.getState();
    expect(state.lines).toHaveLength(0);
    expect(state.tableId).toBeNull();
    expect(state.customerName).toBe('');
  });
});

describe('useCart — setTable / setCustomerName', () => {
  it('sets and updates table id', () => {
    useCart.getState().setTable('table-5');
    expect(useCart.getState().tableId).toBe('table-5');
    useCart.getState().setTable(null);
    expect(useCart.getState().tableId).toBeNull();
  });

  it('sets customer name', () => {
    useCart.getState().setCustomerName('Ben');
    expect(useCart.getState().customerName).toBe('Ben');
  });
});

describe('cartTotals', () => {
  it('returns zeros for empty cart', () => {
    const totals = cartTotals([]);
    expect(totals.subtotal_cents).toBe(0);
    expect(totals.gst_cents).toBe(0);
    expect(totals.total_cents).toBe(0);
  });

  it('calculates subtotal correctly', () => {
    const lines = [
      { product_id: 'a', name: 'A', price_cents: 1000, quantity: 2, notes: '' },
      { product_id: 'b', name: 'B', price_cents: 500,  quantity: 1, notes: '' },
    ];
    const { subtotal_cents, total_cents } = cartTotals(lines);
    expect(subtotal_cents).toBe(2500);
    expect(total_cents).toBe(2500);
  });

  it('calculates GST as 15/115 of total (NZ inclusive)', () => {
    // $10.00 total → GST = 10 * (0.15/1.15) ≈ $1.304... → 130 cents rounded
    const lines = [
      { product_id: 'a', name: 'A', price_cents: 1000, quantity: 1, notes: '' },
    ];
    const { gst_cents } = cartTotals(lines);
    const expected = Math.round(1000 * (GST_RATE / (1 + GST_RATE)));
    expect(gst_cents).toBe(expected);
  });

  it('total equals subtotal (prices are GST-inclusive)', () => {
    const lines = [
      { product_id: 'a', name: 'A', price_cents: 1850, quantity: 1, notes: '' },
    ];
    const { subtotal_cents, total_cents } = cartTotals(lines);
    expect(total_cents).toBe(subtotal_cents);
  });
});
