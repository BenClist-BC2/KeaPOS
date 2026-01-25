import Dexie, { type EntityTable } from 'dexie';

// Define the transaction interface
export interface OfflineTransaction {
  id?: number;
  transaction_id: string;
  company_id: string;
  location_id: string;
  user_id: string;
  items: any[];
  total: number;
  payment_method: string;
  synced: boolean;
  created_at: string;
  updated_at: string;
}

// Define the sync queue interface
export interface SyncQueueItem {
  id?: number;
  operation: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  synced: boolean;
  retries: number;
  created_at: string;
}

// Define the database class
class OfflineDatabase extends Dexie {
  transactions!: EntityTable<OfflineTransaction, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('KeaPOSOffline');

    this.version(1).stores({
      transactions: '++id, transaction_id, company_id, location_id, synced, created_at',
      syncQueue: '++id, synced, table, created_at',
    });
  }
}

export const offlineDb = new OfflineDatabase();
