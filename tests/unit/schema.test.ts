import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke-tests that verify the SQL migration file contains all the
 * expected tables, types, indexes, and RLS policies — without needing
 * a live database connection.
 */

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/001_initial_schema.sql'),
  'utf-8'
);

const tables = [
  'companies',
  'locations',
  'profiles',
  'categories',
  'products',
  'modifier_groups',
  'modifiers',
  'product_modifier_groups',
  'restaurant_tables',
  'orders',
  'order_items',
  'order_item_modifiers',
  'payments',
];

const types = [
  'user_role',
  'table_status',
  'order_status',
  'order_type',
  'payment_status',
  'payment_method',
  'item_status',
];

describe('001_initial_schema.sql — tables', () => {
  it.each(tables)('defines table: %s', (table) => {
    expect(migration).toMatch(new RegExp(`create table ${table}\\b`));
  });
});

describe('001_initial_schema.sql — custom types', () => {
  it.each(types)('defines type: %s', (type) => {
    // Allow any amount of whitespace between type name and 'as enum'
    expect(migration).toMatch(new RegExp(`create type ${type}\\s+as enum`));
  });
});

describe('001_initial_schema.sql — RLS', () => {
  it('enables RLS on all tables', () => {
    tables.forEach(table => {
      expect(migration).toMatch(
        new RegExp(`alter table ${table}\\s+enable row level security`)
      );
    });
  });

  it('defines the auth_company_id() helper function', () => {
    expect(migration).toContain('function auth_company_id()');
  });

  it('defines the auth_user_role() helper function', () => {
    expect(migration).toContain('function auth_user_role()');
  });
});

describe('001_initial_schema.sql — triggers', () => {
  it('defines updated_at trigger function', () => {
    expect(migration).toContain('function touch_updated_at()');
  });

  it('defines order_number trigger', () => {
    expect(migration).toContain('trg_set_order_number');
  });

  it('defines updated_at triggers for key tables', () => {
    ['companies', 'locations', 'profiles', 'products', 'orders'].forEach(table => {
      expect(migration).toContain(`trg_${table}_updated_at`);
    });
  });
});

describe('001_initial_schema.sql — NZD price storage', () => {
  it('stores product prices as integer cents', () => {
    expect(migration).toContain('price_cents  integer');
  });

  it('stores order totals as integer cents', () => {
    expect(migration).toContain('subtotal_cents integer');
    expect(migration).toContain('gst_cents      integer');
    expect(migration).toContain('total_cents    integer');
  });

  it('stores payment amounts as integer cents', () => {
    expect(migration).toContain('amount_cents    integer');
  });
});

describe('001_initial_schema.sql — NZ-specific fields', () => {
  it('has GST number field on companies', () => {
    expect(migration).toContain('gst_number');
  });

  it('has NZBN field on companies', () => {
    expect(migration).toContain('nzbn');
  });

  it('defaults location timezone to Pacific/Auckland', () => {
    expect(migration).toContain("default 'Pacific/Auckland'");
  });
});
