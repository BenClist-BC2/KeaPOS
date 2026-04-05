/**
 * Domain types for KeaPOS — derived from supabase/migrations/001_initial_schema.sql.
 * For full generated Supabase types run: npm run db:types
 */

export type UserRole = 'owner' | 'manager' | 'staff';
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'unavailable';
export type OrderStatus = 'open' | 'closed' | 'cancelled' | 'refunded';
export type OrderType = 'dine-in' | 'takeaway' | 'delivery';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type PaymentMethod = 'cash' | 'eftpos' | 'credit' | 'voucher' | 'complimentary';
export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

export interface Company {
  id: string;
  name: string;
  nzbn: string | null;
  gst_number: string | null;
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
  /** Price in NZD cents (e.g. 1850 = $18.50) */
  price_cents: number;
  available: boolean;
  image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

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
  order_number: number;
  status: OrderStatus;
  order_type: OrderType;
  payment_status: PaymentStatus;
  customer_name: string | null;
  notes: string | null;
  subtotal_cents: number;
  gst_cents: number;
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
  unit_price_cents: number;
  notes: string | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

/** Formats an integer cent value as NZD string (e.g. 1850 → "$18.50") */
export function formatNZD(cents: number): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(cents / 100);
}

/** Parses a dollar string to integer cents (e.g. "18.50" → 1850) */
export function parseCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}
