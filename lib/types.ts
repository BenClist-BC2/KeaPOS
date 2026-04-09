/**
 * Domain types for KeaPOS — derived from supabase/migrations/*.sql.
 * For full generated Supabase types run: npm run db:types
 *
 * Monetary convention:
 *   All *_cents fields are stored ex-GST.
 *   Use lib/gst.ts helpers to convert for display.
 */

import type { Unit } from './units';

export type { Unit };

export type UserRole       = 'owner' | 'manager' | 'staff';
export type TableStatus    = 'available' | 'occupied' | 'reserved' | 'unavailable';
export type OrderStatus    = 'open' | 'closed' | 'cancelled' | 'refunded';
export type OrderType      = 'dine-in' | 'takeaway' | 'delivery';
export type PaymentStatus  = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type PaymentMethod  = 'cash' | 'eftpos' | 'credit' | 'voucher' | 'complimentary';
export type ItemStatus     = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type ProductType    = 'purchased' | 'recipe' | 'combo';
export type PromotionType  = 'percentage_off' | 'fixed_off' | 'bogo' | 'happy_hour';
export type PromotionScope = 'product' | 'category' | 'all';
export type ComboPricingType = 'fixed' | 'discount_percentage' | 'discount_fixed';

// ─── Core entities ────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  nzbn: string | null;
  gst_number: string | null;
  /** GST rate as integer percentage (e.g. 15). Configurable in Settings. */
  default_gst_rate: number;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  location_id: string | null;
  role: UserRole;
  full_name: string;
  pin_hash: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Menu ─────────────────────────────────────────────────────

export interface Category {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string | null;
  /** Sell price in NZD cents, stored ex-GST. Use lib/gst.ts to display inc-GST. */
  price_cents: number;
  /** GST rate percentage for this product (e.g. 15). Snapshotted on order lines at sale time. */
  gst_rate: number;
  product_type: ProductType;
  available: boolean;
  image_url: string | null;
  sort_order: number;
  /** Purchased products: links to the ingredient for cost/stock tracking. */
  ingredient_id: string | null;
  /** Recipe products: quantity produced by one run (e.g. 3). */
  yield_quantity: number | null;
  /** Recipe products: unit of the yield (e.g. 'L'). */
  yield_unit: Unit | null;
  created_at: string;
  updated_at: string;
}

// ─── Ingredients & stock ──────────────────────────────────────

export interface Ingredient {
  id: string;
  company_id: string;
  name: string;
  /** Base unit — all cost_cents values are per this unit. */
  unit: Unit;
  /** Ex-GST cost per base unit. Updated on each stock receipt save. */
  cost_cents: number;
  out_of_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockReceipt {
  id: string;
  company_id: string;
  supplier_id: string | null;
  created_by: string | null;
  receipt_date: string;
  invoice_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface StockReceiptLine {
  id: string;
  receipt_id: string;
  ingredient_id: string;
  quantity: number;
  /** Unit on the supplier invoice (may differ from ingredient.unit). */
  unit: Unit;
  /** Ex-GST cost per invoice unit (not per base unit). */
  unit_cost_cents: number;
  created_at: string;
}

// ─── Recipes ──────────────────────────────────────────────────

export interface RecipeLine {
  id: string;
  product_id: string;
  /** Set when this line is an ingredient. Mutually exclusive with component_product_id. */
  ingredient_id: string | null;
  /** Set when this line is a nested recipe product. Mutually exclusive with ingredient_id. */
  component_product_id: string | null;
  quantity: number;
  unit: Unit;
  sort_order: number;
}

// ─── Combos ───────────────────────────────────────────────────

export interface ComboItem {
  id: string;
  combo_product_id: string;
  item_product_id: string;
  quantity: number;
  sort_order: number;
}

export interface ComboConfig {
  product_id: string;
  pricing_type: ComboPricingType;
  /** Used when pricing_type = 'discount_percentage'. */
  discount_percentage: number | null;
  /** Ex-GST fixed discount. Used when pricing_type = 'discount_fixed'. */
  discount_cents: number | null;
}

// ─── Modifiers ────────────────────────────────────────────────

export interface ModifierGroup {
  id: string;
  company_id: string;
  name: string;
  required: boolean;
  min_selections: number;
  max_selections: number;
  created_at: string;
}

export interface Modifier {
  id: string;
  modifier_group_id: string;
  company_id: string;
  name: string;
  sort_order: number;
}

export interface ProductModifierOption {
  id: string;
  product_id: string;
  modifier_id: string;
  /** Ex-GST price adjustment in cents. Negative for discount/removal. */
  price_adjustment_cents: number;
  /** When false this option is hidden on this product at the terminal. */
  enabled: boolean;
}

// ─── Cost history ─────────────────────────────────────────────

export interface ProductCostSnapshot {
  id: string;
  company_id: string;
  product_id: string;
  cost_cents: number;
  reason: string;
  triggered_by: string | null;
  created_at: string;
}

// ─── Promotions ───────────────────────────────────────────────

export interface Promotion {
  id: string;
  company_id: string;
  name: string;
  type: PromotionType;
  scope: PromotionScope;
  product_id: string | null;
  category_id: string | null;
  discount_percentage: number | null;
  /** Ex-GST fixed discount cents for fixed_off type. */
  discount_cents: number | null;
  valid_from: string | null;
  valid_to: string | null;
  start_time: string | null;
  end_time: string | null;
  /** [0..6] Sun–Sat. Null means every day. */
  days_of_week: number[] | null;
  /** Ex-GST minimum order spend. */
  min_spend_cents: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Tables, Orders, Payments ─────────────────────────────────

export interface RestaurantTable {
  id: string;
  location_id: string;
  company_id: string;
  number: string;
  capacity: number;
  area: string | null;
  status: TableStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  location_id: string;
  company_id: string;
  table_id: string | null;
  staff_id: string | null;
  terminal_id: string | null;
  order_number: number;
  status: OrderStatus;
  order_type: OrderType;
  payment_status: PaymentStatus;
  customer_name: string | null;
  notes: string | null;
  /** Ex-GST total of all items. */
  subtotal_cents: number;
  /** GST component = subtotal_cents × (gst_rate / 100). */
  gst_cents: number;
  /** Inc-GST total = subtotal_cents + gst_cents. */
  total_cents: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  /** Ex-GST unit price snapshot at time of order. */
  unit_price_cents: number;
  /** Ex-GST unit cost snapshot at time of order (null if cost was unknown). */
  unit_cost_cents: number | null;
  /** GST rate percentage at time of order. */
  gst_rate: number;
  notes: string | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_id: string | null;
  name: string;
  /** Ex-GST price adjustment snapshot. */
  price_adjustment_cents: number;
  /** GST rate percentage at time of order. */
  gst_rate: number;
}

// ─── Formatting helpers ───────────────────────────────────────

/** Formats an integer cent value as NZD string (e.g. 1000 → "$10.00"). */
export function formatNZD(cents: number): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(cents / 100);
}

/** Parses a dollar string to integer cents (e.g. "10.00" → 1000). */
export function parseCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}
