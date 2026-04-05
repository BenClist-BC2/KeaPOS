-- ============================================================
-- Terminal Authentication Support
-- ============================================================
-- Adds terminal role for device-level authentication and PIN
-- login for all users (owners, managers, staff).
-- ============================================================

-- Add 'terminal' role for POS terminal devices
alter type user_role add value 'terminal';

-- Terminals table: tracks physical POS terminal devices
create table terminals (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name        text not null,  -- e.g. "Front Counter", "Bar Station"
  active      boolean not null default true,
  last_seen_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index terminals_company_id_idx on terminals(company_id);
create index terminals_location_id_idx on terminals(location_id);

create trigger trg_terminals_updated_at
  before update on terminals
  for each row execute function touch_updated_at();

-- RLS for terminals
alter table terminals enable row level security;

create policy "users see company terminals"
  on terminals for select
  using (company_id = auth_company_id());

create policy "managers manage terminals"
  on terminals for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- ============================================================
-- RLS updates for terminal role
-- ============================================================

-- Allow terminal users to read menu items for their company
create policy "terminals read company menu"
  on categories for select
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

create policy "terminals read company products"
  on products for select
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

-- Allow terminal users to read/update tables at their location
create policy "terminals read location tables"
  on restaurant_tables for select
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

create policy "terminals update table status"
  on restaurant_tables for update
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

-- Allow terminal users to create orders and payments at their location
create policy "terminals create orders"
  on orders for insert
  with check (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

create policy "terminals update orders"
  on orders for update
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

create policy "terminals manage order items"
  on order_items for all
  using (
    order_id in (
      select id from orders
      where company_id = auth_company_id()
      and auth_user_role() = 'terminal'
    )
  );

create policy "terminals manage payments"
  on payments for all
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );

-- Allow terminal users to read all staff profiles at their company
-- (needed for PIN verification)
create policy "terminals read company profiles"
  on profiles for select
  using (
    auth_user_role() = 'terminal'
    and company_id = auth_company_id()
  );
