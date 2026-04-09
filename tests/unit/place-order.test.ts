import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFrom, mockLogAudit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockLogAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('@/lib/audit', () => ({ logAudit: mockLogAudit }));
vi.mock('@/lib/product-cost', () => ({
  calculateProductCost: vi.fn().mockResolvedValue(150),
}));

import { placeOrder } from '@/app/(pos)/terminal/actions';
import type { PlaceOrderInput } from '@/app/(pos)/terminal/actions';

const TERMINAL_EMAIL = 'terminal-550e8400-e29b-41d4-a716-446655440000@keapos.internal';
const TERMINAL_ID    = '550e8400-e29b-41d4-a716-446655440000';
const TERMINAL_USER  = { id: 'user-1', email: TERMINAL_EMAIL };
const TERMINAL_PROFILE = { company_id: 'comp-1', location_id: 'loc-1', role: 'terminal' };

const BASE_INPUT: PlaceOrderInput = {
  lines: [{ product_id: 'prod-1', name: 'Burger', quantity: 2, price_cents: 1500, notes: null }],
  table_id: 'T1',
  customer_name: 'Alice',
  order_type: 'dine-in',
  payment_method: 'eftpos',
  subtotal_cents: 2609,
  gst_cents: 391,
  total_cents: 3000,
  staff_id: 'staff-1',
};

/** Set up the standard happy-path mock sequence up to (but not including) order creation */
function setupTerminalAuth() {
  mockGetUser.mockResolvedValueOnce({ data: { user: TERMINAL_USER } });

  // Terminal profile
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: TERMINAL_PROFILE, error: null }),
      }),
    }),
  });

  // Staff verification
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'staff-1' }, error: null }),
        }),
      }),
    }),
  });
}

/** Set up order creation + items + payment + closure mocks */
function setupOrderFlow(
  orderResult = { data: { id: 'order-1', order_number: 42 }, error: null },
  itemsResult = { error: null },
  paymentResult = { error: null }
) {
  // Create order
  mockFrom.mockReturnValueOnce({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(orderResult),
      }),
    }),
  });
  // Fetch product gst_rate data
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: [{ id: 'prod-1', gst_rate: 15 }], error: null }),
    }),
  });
  // Insert order items
  mockFrom.mockReturnValueOnce({
    insert: vi.fn().mockResolvedValue(itemsResult),
  });
  // Record payment
  mockFrom.mockReturnValueOnce({
    insert: vi.fn().mockResolvedValue(paymentResult),
  });
  // Close order
  mockFrom.mockReturnValueOnce({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
}

describe('placeOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when terminal is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await placeOrder(BASE_INPUT);
    expect(result).toEqual({ order_id: null, order_number: null, change_cents: 0, error: 'Terminal not authenticated' });
  });

  it('returns error when authenticated user email is not a terminal email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-1', email: 'admin@example.com' } } });
    const result = await placeOrder(BASE_INPUT);
    expect(result).toEqual({ order_id: null, order_number: null, change_cents: 0, error: 'Invalid terminal user' });
  });

  it('returns error when terminal profile is not found', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: TERMINAL_USER } });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('Terminal profile not found');
  });

  it('returns error when profile role is not terminal', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: TERMINAL_USER } });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { company_id: 'comp-1', location_id: 'loc-1', role: 'manager' },
            error: null,
          }),
        }),
      }),
    });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('Not a terminal device');
  });

  it('returns error when terminal has no location assigned', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: TERMINAL_USER } });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { company_id: 'comp-1', location_id: null, role: 'terminal' },
            error: null,
          }),
        }),
      }),
    });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('Terminal has no location assigned');
  });

  it('returns error when staff member is not in the same company', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: TERMINAL_USER } });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: TERMINAL_PROFILE, error: null }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('Invalid staff member');
  });

  it('returns error when order creation fails', async () => {
    setupTerminalAuth();
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB constraint' } }),
        }),
      }),
    });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('DB constraint');
  });

  it('returns error when order items insertion fails', async () => {
    setupTerminalAuth();
    // Create order
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'order-1', order_number: 42 }, error: null }),
        }),
      }),
    });
    // Product gst_rate fetch
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [{ id: 'prod-1', gst_rate: 15 }], error: null }),
      }),
    });
    // Items insert (error)
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: { message: 'items insert failed' } }),
    });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('items insert failed');
    expect(result.order_id).toBe('order-1');
  });

  it('returns error when payment recording fails', async () => {
    setupTerminalAuth();
    // Create order
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'order-1', order_number: 42 }, error: null }),
        }),
      }),
    });
    // Product gst_rate fetch
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [{ id: 'prod-1', gst_rate: 15 }], error: null }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: { message: 'payment failed' } }) });
    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBe('payment failed');
  });

  it('completes order successfully via eftpos with zero change', async () => {
    setupTerminalAuth();
    setupOrderFlow();

    const result = await placeOrder(BASE_INPUT);
    expect(result.error).toBeNull();
    expect(result.order_id).toBe('order-1');
    expect(result.order_number).toBe(42);
    expect(result.change_cents).toBe(0);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'order.completed', entity_type: 'order', entity_id: 'order-1' })
    );
  });

  it('calculates correct change for cash payments', async () => {
    setupTerminalAuth();
    setupOrderFlow();

    const result = await placeOrder({
      ...BASE_INPUT,
      payment_method: 'cash',
      tendered_cents: 5000,
      total_cents: 3000,
    });
    expect(result.error).toBeNull();
    expect(result.change_cents).toBe(2000);
  });

  it('returns zero change for exact cash payment', async () => {
    setupTerminalAuth();
    setupOrderFlow();

    const result = await placeOrder({
      ...BASE_INPUT,
      payment_method: 'cash',
      tendered_cents: 3000,
      total_cents: 3000,
    });
    expect(result.change_cents).toBe(0);
  });

  it('extracts terminal_id correctly from user email', async () => {
    setupTerminalAuth();
    const mockInsertOrder = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'order-1', order_number: 1 }, error: null }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: mockInsertOrder });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });
    mockFrom.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });
    mockFrom.mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }) });

    await placeOrder(BASE_INPUT);

    expect(mockInsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({ terminal_id: TERMINAL_ID })
    );
  });
});
