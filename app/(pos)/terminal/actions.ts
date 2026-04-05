'use server';

import { createClient } from '@/lib/supabase/server';
import type { CartLine } from '@/lib/store/cart';
import type { OrderType } from '@/lib/types';

export interface PlaceOrderInput {
  lines: CartLine[];
  table_id: string | null;
  customer_name: string;
  order_type: OrderType;
  payment_method: 'cash' | 'eftpos' | 'credit' | 'voucher' | 'complimentary';
  /** Amount tendered in cents (cash only) */
  tendered_cents?: number;
  subtotal_cents: number;
  gst_cents: number;
  total_cents: number;
  /** Staff member who created this order (from PIN login) */
  staff_id: string;
}

export interface PlaceOrderResult {
  order_id: string | null;
  order_number: number | null;
  change_cents: number;
  error: string | null;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { order_id: null, order_number: null, change_cents: 0, error: 'Terminal not authenticated' };

  // Get terminal ID from user email (format: terminal-{id}@keapos.internal)
  const terminalIdMatch = user.email?.match(/^terminal-([a-f0-9-]+)@keapos\.internal$/);
  if (!terminalIdMatch) {
    return { order_id: null, order_number: null, change_cents: 0, error: 'Invalid terminal user' };
  }
  const terminal_id = terminalIdMatch[1];

  // Get terminal's company and location
  const { data: terminalProfile } = await supabase
    .from('profiles')
    .select('company_id, location_id, role')
    .eq('id', user.id)
    .single();

  if (!terminalProfile) return { order_id: null, order_number: null, change_cents: 0, error: 'Terminal profile not found' };
  if (terminalProfile.role !== 'terminal') {
    return { order_id: null, order_number: null, change_cents: 0, error: 'Not a terminal device' };
  }
  if (!terminalProfile.location_id) {
    return { order_id: null, order_number: null, change_cents: 0, error: 'Terminal has no location assigned' };
  }

  // Verify staff_id belongs to this company
  const { data: staff } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', input.staff_id)
    .eq('company_id', terminalProfile.company_id)
    .single();

  if (!staff) {
    return { order_id: null, order_number: null, change_cents: 0, error: 'Invalid staff member' };
  }

  // Create the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      company_id:     terminalProfile.company_id,
      location_id:    terminalProfile.location_id,
      table_id:       input.table_id || null,
      staff_id:       input.staff_id,        // Staff member who created the order
      terminal_id:    terminal_id,           // Terminal device that processed it
      status:         'open',
      order_type:     input.order_type,
      payment_status: 'unpaid',
      customer_name:  input.customer_name || null,
      subtotal_cents: input.subtotal_cents,
      gst_cents:      input.gst_cents,
      total_cents:    input.total_cents,
    })
    .select('id, order_number')
    .single();

  if (orderError || !order) {
    return { order_id: null, order_number: null, change_cents: 0, error: orderError?.message ?? 'Failed to create order' };
  }

  // Insert order items
  const { error: itemsError } = await supabase.from('order_items').insert(
    input.lines.map(line => ({
      order_id:        order.id,
      product_id:      line.product_id,
      name:            line.name,
      quantity:        line.quantity,
      unit_price_cents: line.price_cents,
      notes:           line.notes || null,
      status:          'pending',
    }))
  );

  if (itemsError) {
    return { order_id: order.id, order_number: order.order_number, change_cents: 0, error: itemsError.message };
  }

  // Record payment
  const { error: paymentError } = await supabase.from('payments').insert({
    order_id:    order.id,
    company_id:  terminalProfile.company_id,
    location_id: terminalProfile.location_id,
    staff_id:    input.staff_id,
    amount_cents: input.total_cents,
    method:      input.payment_method,
    status:      'completed',
    completed_at: new Date().toISOString(),
  });

  if (paymentError) {
    return { order_id: order.id, order_number: order.order_number, change_cents: 0, error: paymentError.message };
  }

  // Mark order as closed + paid
  await supabase
    .from('orders')
    .update({ status: 'closed', payment_status: 'paid', closed_at: new Date().toISOString() })
    .eq('id', order.id);

  const change_cents = input.payment_method === 'cash' && input.tendered_cents
    ? Math.max(0, input.tendered_cents - input.total_cents)
    : 0;

  return { order_id: order.id, order_number: order.order_number, change_cents, error: null };
}
