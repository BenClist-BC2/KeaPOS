import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRevalidatePath, mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  getRequestContext: vi.fn().mockReturnValue({ ip_address: null, user_agent: null }),
  createDiff: vi.fn((a: object, b: object) => ({ old_values: a, new_values: b })),
}));
vi.mock('@/lib/product-cost', () => ({
  snapshotProductCosts: vi.fn().mockResolvedValue(undefined),
  snapshotCostsForIngredients: vi.fn().mockResolvedValue(undefined),
  calculateProductCost: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import {
  createCategory, updateCategory, deleteCategory,
  createProduct, updateProduct, deleteProduct,
} from '@/app/(admin)/dashboard/menu/actions';

const ADMIN_USER = { id: 'admin-1' };

// ─── Mock helpers ─────────────────────────────────────────────

/** Sets up the two from() calls made by getContext(): getUser + profiles select. */
function mockAuthenticated() {
  mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
  mockFrom.mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { company_id: 'comp-1' }, error: null }),
      }),
    }),
  });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null } });
}

/** A from() call that resolves a select→eq→single chain. */
function mockSelectSingle(data: object | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

/** A from() call that resolves insert→select→single (used by create actions). */
function mockInsertSelectSingle(data: object | null, errorMsg?: string) {
  const error = errorMsg ? { message: errorMsg } : null;
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

/** Capture the insert fn so tests can assert on what was passed. */
function makeInsertCapture(data: object | null) {
  const insertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data, error: null }),
    }),
  });
  return { mock: { insert: insertFn }, insertFn };
}

function mockUpdateEq(errorMsg?: string) {
  const error = errorMsg ? { message: errorMsg } : null;
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error }),
  });
  return { mock: { update: updateFn }, updateFn };
}

function mockDeleteEq(errorMsg?: string) {
  const error = errorMsg ? { message: errorMsg } : null;
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error }),
    }),
  };
}

// ─── Categories ───────────────────────────────────────────────

describe('createCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockUnauthenticated();
    const fd = new FormData();
    fd.set('name', 'Burgers');
    expect(await createCategory(fd)).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when name is missing', async () => {
    mockAuthenticated();
    expect(await createCategory(new FormData())).toEqual({ error: 'Category name is required' });
  });

  it('returns error when DB insert fails', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockInsertSelectSingle(null, 'duplicate key'));
    const fd = new FormData();
    fd.set('name', 'Burgers');
    expect(await createCategory(fd)).toEqual({ error: 'duplicate key' });
  });

  it('creates category and revalidates on success', async () => {
    mockAuthenticated();
    const { mock, insertFn } = makeInsertCapture({ id: 'cat-new-1' });
    mockFrom.mockReturnValueOnce(mock);

    const fd = new FormData();
    fd.set('name', 'Burgers');
    fd.set('sort_order', '1');

    expect(await createCategory(fd)).toEqual({ error: null });
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'comp-1', name: 'Burgers', sort_order: 1 })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('updateCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when name is missing', async () => {
    mockAuthenticated();
    expect(await updateCategory('cat-1', new FormData())).toEqual({
      error: 'Category name is required',
    });
  });

  it('returns error when DB update fails', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({ name: 'Old', sort_order: 0, active: true }));
    const { mock } = mockUpdateEq('not found');
    mockFrom.mockReturnValueOnce(mock);

    const fd = new FormData();
    fd.set('name', 'Sides');
    expect(await updateCategory('cat-1', fd)).toEqual({ error: 'not found' });
  });

  it('updates category and revalidates on success', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({ name: 'Old', sort_order: 0, active: true }));
    const { mock, updateFn } = mockUpdateEq();
    mockFrom.mockReturnValueOnce(mock);

    const fd = new FormData();
    fd.set('name', 'Sides');
    fd.set('active', 'true');
    fd.set('sort_order', '2');

    expect(await updateCategory('cat-1', fd)).toEqual({ error: null });
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sides', active: true, sort_order: 2 })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('deleteCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when DB delete fails', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({ name: 'Burgers' }));
    mockFrom.mockReturnValueOnce(mockDeleteEq('foreign key violation'));
    expect(await deleteCategory('cat-1')).toEqual({ error: 'foreign key violation' });
  });

  it('deletes category and revalidates on success', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({ name: 'Burgers' }));
    mockFrom.mockReturnValueOnce(mockDeleteEq());
    expect(await deleteCategory('cat-1')).toEqual({ error: null });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

// ─── Products ─────────────────────────────────────────────────

describe('createProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockUnauthenticated();
    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    expect(await createProduct(fd)).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when product name is missing', async () => {
    mockAuthenticated();
    const fd = new FormData();
    fd.set('category_id', 'cat-1');
    fd.set('price', '18.50');
    expect(await createProduct(fd)).toEqual({ error: 'Product name is required' });
  });

  it('returns error when category_id is missing', async () => {
    mockAuthenticated();
    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    fd.set('price', '18.50');
    expect(await createProduct(fd)).toEqual({ error: 'Category is required' });
  });

  it('returns error when price is invalid', async () => {
    mockAuthenticated();
    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    fd.set('category_id', 'cat-1');
    fd.set('price', 'not-a-number');
    expect(await createProduct(fd)).toEqual({ error: 'Valid price is required' });
  });

  it('creates product with price stored ex-GST', async () => {
    mockAuthenticated();
    const { mock, insertFn } = makeInsertCapture({ id: 'prod-new-1' });
    mockFrom.mockReturnValueOnce(mock);

    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    fd.set('category_id', 'cat-1');
    fd.set('price', '18.50'); // entered inc-GST @ 15% → stored as round(1850*100/115) = 1609
    fd.set('gst_rate', '15');

    expect(await createProduct(fd)).toEqual({ error: null, id: 'prod-new-1' });
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'comp-1',
        category_id: 'cat-1',
        name: 'Cheeseburger',
        price_cents: 1609,
        gst_rate: 15,
        available: true,
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('updateProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when name is missing', async () => {
    mockAuthenticated();
    const fd = new FormData();
    fd.set('price', '10.00');
    expect(await updateProduct('prod-1', fd)).toEqual({ error: 'Product name is required' });
  });

  it('returns error when price is invalid', async () => {
    mockAuthenticated();
    const fd = new FormData();
    fd.set('name', 'Chips');
    fd.set('price', 'free');
    expect(await updateProduct('prod-1', fd)).toEqual({ error: 'Valid price is required' });
  });

  it('updates product with price stored ex-GST and revalidates', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({
      name: 'Chips', price_cents: 400, category_id: 'cat-1',
      description: null, sort_order: 0, available: true,
      product_type: 'purchased', gst_rate: 15, ingredient_id: null,
      yield_quantity: null, yield_unit: null,
    }));
    const { mock, updateFn } = mockUpdateEq();
    mockFrom.mockReturnValueOnce(mock);

    const fd = new FormData();
    fd.set('name', 'Chips');
    fd.set('price', '5.00'); // inc-GST @ 15% → round(500*100/115) = 435
    fd.set('gst_rate', '15');
    fd.set('category_id', 'cat-1');
    fd.set('available', 'true');

    expect(await updateProduct('prod-1', fd)).toEqual({ error: null });
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chips', price_cents: 435, available: true })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('deleteProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when DB delete fails', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({ name: 'Chips', price_cents: 435, product_type: 'purchased' }));
    mockFrom.mockReturnValueOnce(mockDeleteEq('order items reference this product'));
    expect(await deleteProduct('prod-1')).toEqual({ error: 'order items reference this product' });
  });

  it('deletes product and revalidates on success', async () => {
    mockAuthenticated();
    mockFrom.mockReturnValueOnce(mockSelectSingle({ name: 'Chips', price_cents: 435, product_type: 'purchased' }));
    mockFrom.mockReturnValueOnce(mockDeleteEq());
    expect(await deleteProduct('prod-1')).toEqual({ error: null });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});
