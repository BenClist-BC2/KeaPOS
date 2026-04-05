import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import type { OfflineTransaction, SyncQueueItem } from '@/lib/db/offline-db';

// Use a unique DB name per test run to avoid state leakage between suites
let dbCounter = 0;

class TestOfflineDatabase extends Dexie {
  transactions!: Dexie.Table<OfflineTransaction, number>;
  syncQueue!: Dexie.Table<SyncQueueItem, number>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      transactions: '++id, transaction_id, company_id, location_id, synced, created_at',
      syncQueue: '++id, synced, table, created_at',
    });
  }
}

const makeTransaction = (overrides: Partial<OfflineTransaction> = {}): OfflineTransaction => ({
  transaction_id: 'txn-001',
  company_id: 'company-abc',
  location_id: 'loc-001',
  user_id: 'user-001',
  items: [{ id: 'item-1', name: 'Burger', price: 18.5, qty: 1 }],
  total: 18.5,
  payment_method: 'cash',
  synced: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const makeSyncItem = (overrides: Partial<SyncQueueItem> = {}): SyncQueueItem => ({
  operation: 'create',
  table: 'transactions',
  data: { transaction_id: 'txn-001' },
  synced: false,
  retries: 0,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('OfflineDatabase - transactions', () => {
  let db: TestOfflineDatabase;

  beforeEach(() => {
    db = new TestOfflineDatabase(`KeaPOSTest-${++dbCounter}`);
  });

  it('adds a transaction and retrieves it by transaction_id', async () => {
    const txn = makeTransaction({ transaction_id: 'txn-retrieve' });
    await db.transactions.add(txn);

    const result = await db.transactions
      .where('transaction_id')
      .equals('txn-retrieve')
      .first();

    expect(result).toBeDefined();
    expect(result?.transaction_id).toBe('txn-retrieve');
    expect(result?.total).toBe(18.5);
    expect(result?.synced).toBe(false);
  });

  it('marks a transaction as synced', async () => {
    const id = await db.transactions.add(makeTransaction({ transaction_id: 'txn-sync' }));

    await db.transactions.update(id, { synced: true });

    const updated = await db.transactions.get(id);
    expect(updated?.synced).toBe(true);
  });

  it('returns only unsynced transactions', async () => {
    await db.transactions.add(makeTransaction({ transaction_id: 'txn-a', synced: false }));
    await db.transactions.add(makeTransaction({ transaction_id: 'txn-b', synced: true }));
    await db.transactions.add(makeTransaction({ transaction_id: 'txn-c', synced: false }));

    const unsynced = await db.transactions.filter(t => !t.synced).toArray();

    expect(unsynced).toHaveLength(2);
    expect(unsynced.map(t => t.transaction_id)).toEqual(
      expect.arrayContaining(['txn-a', 'txn-c'])
    );
  });

  it('stores items array correctly', async () => {
    const items = [
      { id: 'item-1', name: 'Burger', price: 18.5, qty: 2 },
      { id: 'item-2', name: 'Fries', price: 8.0, qty: 1 },
    ];
    const id = await db.transactions.add(makeTransaction({ items }));

    const result = await db.transactions.get(id);
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0].name).toBe('Burger');
  });

  it('filters transactions by company_id', async () => {
    await db.transactions.add(makeTransaction({ company_id: 'company-A', transaction_id: 'txn-a1' }));
    await db.transactions.add(makeTransaction({ company_id: 'company-B', transaction_id: 'txn-b1' }));
    await db.transactions.add(makeTransaction({ company_id: 'company-A', transaction_id: 'txn-a2' }));

    const companyA = await db.transactions.where('company_id').equals('company-A').toArray();
    expect(companyA).toHaveLength(2);
  });

  it('deletes a transaction', async () => {
    const id = await db.transactions.add(makeTransaction());
    await db.transactions.delete(id);

    const result = await db.transactions.get(id);
    expect(result).toBeUndefined();
  });
});

describe('OfflineDatabase - syncQueue', () => {
  let db: TestOfflineDatabase;

  beforeEach(() => {
    db = new TestOfflineDatabase(`KeaPOSTest-${++dbCounter}`);
  });

  it('adds a sync queue item', async () => {
    const item = makeSyncItem({ operation: 'create', table: 'orders' });
    const id = await db.syncQueue.add(item);

    const result = await db.syncQueue.get(id);
    expect(result?.operation).toBe('create');
    expect(result?.table).toBe('orders');
    expect(result?.synced).toBe(false);
  });

  it('supports all CRUD operations in queue', async () => {
    await db.syncQueue.add(makeSyncItem({ operation: 'create' }));
    await db.syncQueue.add(makeSyncItem({ operation: 'update' }));
    await db.syncQueue.add(makeSyncItem({ operation: 'delete' }));

    const all = await db.syncQueue.toArray();
    const operations = all.map(i => i.operation);

    expect(operations).toContain('create');
    expect(operations).toContain('update');
    expect(operations).toContain('delete');
  });

  it('increments retry count', async () => {
    const id = await db.syncQueue.add(makeSyncItem({ retries: 0 }));

    await db.syncQueue.update(id, { retries: 1 });
    const result = await db.syncQueue.get(id);

    expect(result?.retries).toBe(1);
  });

  it('returns only pending (unsynced) queue items', async () => {
    await db.syncQueue.add(makeSyncItem({ synced: false }));
    await db.syncQueue.add(makeSyncItem({ synced: true }));
    await db.syncQueue.add(makeSyncItem({ synced: false }));

    const pending = await db.syncQueue.filter(i => !i.synced).toArray();
    expect(pending).toHaveLength(2);
  });

  it('marks queue item as synced after processing', async () => {
    const id = await db.syncQueue.add(makeSyncItem({ synced: false }));

    await db.syncQueue.update(id, { synced: true });

    const result = await db.syncQueue.get(id);
    expect(result?.synced).toBe(true);
  });
});
