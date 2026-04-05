import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRevalidatePath, mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

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
const ADMIN_PROFILE = { data: { company_id: 'comp-1' }, error: null };

function makeSelect(result: object) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeInsert(result: object) {
  return { insert: vi.fn().mockResolvedValue(result) };
}

function makeUpdate(result: object) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  };
}

function makeDelete(result: object) {
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  };
}

// ─── Categories ──────────────────────────────────────────────

describe('createCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const fd = new FormData();
    fd.set('name', 'Burgers');
    expect(await createCategory(fd)).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when name is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    expect(await createCategory(new FormData())).toEqual({ error: 'Category name is required' });
  });

  it('returns error when DB insert fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    mockFrom.mockReturnValueOnce(makeInsert({ error: { message: 'duplicate key' } }));
    const fd = new FormData();
    fd.set('name', 'Burgers');
    expect(await createCategory(fd)).toEqual({ error: 'duplicate key' });
  });

  it('creates category and revalidates on success', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const mockInsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ insert: mockInsertFn });

    const fd = new FormData();
    fd.set('name', 'Burgers');
    fd.set('sort_order', '1');

    const result = await createCategory(fd);
    expect(result).toEqual({ error: null });
    expect(mockInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'comp-1', name: 'Burgers', sort_order: 1 })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('updateCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when name is missing', async () => {
    expect(await updateCategory('cat-1', new FormData())).toEqual({ error: 'Category name is required' });
  });

  it('returns error when DB update fails', async () => {
    mockFrom.mockReturnValueOnce(makeUpdate({ error: { message: 'not found' } }));
    const fd = new FormData();
    fd.set('name', 'Sides');
    expect(await updateCategory('cat-1', fd)).toEqual({ error: 'not found' });
  });

  it('updates category and revalidates on success', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdateFn = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ update: mockUpdateFn });

    const fd = new FormData();
    fd.set('name', 'Sides');
    fd.set('active', 'true');
    fd.set('sort_order', '2');

    const result = await updateCategory('cat-1', fd);
    expect(result).toEqual({ error: null });
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sides', active: true, sort_order: 2 })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('deleteCategory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when DB delete fails', async () => {
    mockFrom.mockReturnValueOnce(makeDelete({ error: { message: 'foreign key violation' } }));
    expect(await deleteCategory('cat-1')).toEqual({ error: 'foreign key violation' });
  });

  it('deletes category and revalidates on success', async () => {
    mockFrom.mockReturnValueOnce(makeDelete({ error: null }));
    expect(await deleteCategory('cat-1')).toEqual({ error: null });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

// ─── Products ────────────────────────────────────────────────

describe('createProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    expect(await createProduct(fd)).toEqual({ error: 'Not authenticated' });
  });

  it('returns error when product name is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const fd = new FormData();
    fd.set('category_id', 'cat-1');
    fd.set('price', '18.50');
    expect(await createProduct(fd)).toEqual({ error: 'Product name is required' });
  });

  it('returns error when category_id is missing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    fd.set('price', '18.50');
    expect(await createProduct(fd)).toEqual({ error: 'Category is required' });
  });

  it('returns error when price is invalid', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    fd.set('category_id', 'cat-1');
    fd.set('price', 'not-a-number');
    expect(await createProduct(fd)).toEqual({ error: 'Valid price is required' });
  });

  it('creates product with price_cents converted from dollars', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: ADMIN_USER } });
    mockFrom.mockReturnValueOnce(makeSelect(ADMIN_PROFILE));
    const mockInsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ insert: mockInsertFn });

    const fd = new FormData();
    fd.set('name', 'Cheeseburger');
    fd.set('category_id', 'cat-1');
    fd.set('price', '18.50');

    const result = await createProduct(fd);
    expect(result).toEqual({ error: null });
    expect(mockInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'comp-1',
        category_id: 'cat-1',
        name: 'Cheeseburger',
        price_cents: 1850,
        available: true,
      })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('updateProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when name is missing', async () => {
    const fd = new FormData();
    fd.set('price', '10.00');
    expect(await updateProduct('prod-1', fd)).toEqual({ error: 'Product name is required' });
  });

  it('returns error when price is invalid', async () => {
    const fd = new FormData();
    fd.set('name', 'Chips');
    fd.set('price', 'free');
    expect(await updateProduct('prod-1', fd)).toEqual({ error: 'Valid price is required' });
  });

  it('updates product with correct price_cents and revalidates', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdateFn = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ update: mockUpdateFn });

    const fd = new FormData();
    fd.set('name', 'Chips');
    fd.set('price', '5.00');
    fd.set('category_id', 'cat-1');
    fd.set('available', 'true');

    const result = await updateProduct('prod-1', fd);
    expect(result).toEqual({ error: null });
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chips', price_cents: 500, available: true })
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});

describe('deleteProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error when DB delete fails', async () => {
    mockFrom.mockReturnValueOnce(makeDelete({ error: { message: 'order items reference this product' } }));
    expect(await deleteProduct('prod-1')).toEqual({ error: 'order items reference this product' });
  });

  it('deletes product and revalidates on success', async () => {
    mockFrom.mockReturnValueOnce(makeDelete({ error: null }));
    expect(await deleteProduct('prod-1')).toEqual({ error: null });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/menu');
  });
});
