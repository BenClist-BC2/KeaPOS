import Dexie, { type EntityTable } from 'dexie';

/**
 * A transaction recorded locally while offline.
 * Will be synced to Supabase when connectivity is restored.
 */
export interface OfflineTransaction {
  /** Auto-incremented local primary key */
  id?: number;
  /** Globally unique ID shared with the server */
  transaction_id: string;
  company_id: string;
  location_id: string;
  user_id: string;
  /** Line items in this transaction */
  items: any[];
  /** Total amount in NZD */
  total: number;
  payment_method: string;
  /** Whether this record has been successfully synced to Supabase */
  synced: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * An entry in the pending-sync queue.
 * Each write operation (create/update/delete) on any table while offline
 * creates one of these items; they are replayed in order when back online.
 */
export interface SyncQueueItem {
  /** Auto-incremented local primary key */
  id?: number;
  operation: 'create' | 'update' | 'delete';
  /** The Supabase table name this operation targets */
  table: string;
  /** The payload to send to the server */
  data: any;
  /** Whether this item has been successfully processed */
  synced: boolean;
  /** Number of failed sync attempts; used for exponential back-off */
  retries: number;
  created_at: string;
}

/**
 * Dexie-backed IndexedDB database for offline-first operation.
 *
 * NOTE: The `synced` boolean field cannot be used with `.where().equals()`
 * in IndexedDB (booleans are not valid key types). Use `.filter(r => !r.synced)`
 * to query unsynced records.
 */
class OfflineDatabase extends Dexie {
  transactions!: EntityTable<OfflineTransaction, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('KeaPOSOffline');

    this.version(1).stores({
      transactions: '++id, transaction_id, company_id, location_id, created_at',
      syncQueue: '++id, table, created_at',
    });
  }

  /** Returns all transactions that have not yet been synced to the server. */
  getUnsyncedTransactions() {
    return this.transactions.filter(t => !t.synced).toArray();
  }

  /** Returns all sync queue items that have not yet been processed. */
  getPendingSyncItems() {
    return this.syncQueue.filter(i => !i.synced).toArray();
  }
}

export const offlineDb = new OfflineDatabase();
