-- ============================================================
-- KeaPOS Initial Schema
-- ============================================================
-- Multi-tenant hierarchy:
--   Company → Locations → (Staff, Tables, Orders)
--   Company → Menu (Categories → Products → Modifiers)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- COMPANIES
-- Top-level tenant. One company can own multiple locations.
-- ============================================================
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  nzbn        text,                      -- NZ Business Number (optional)
  gst_number  text,                      -- GST registration number
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- LOCATIONS
-- A physical venue belonging to a company (e.g. a restaurant branch).
-- ============================================================
create table locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  address     text,
  phone       text,
  timezone    text not null default 'Pacific/Auckland',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index locations_company_id_idx on locations(company_id);

-- ============================================================
-- PROFILES
-- Extends Supabase auth.users with POS-specific fields.
-- One profile per auth user; linked to a company and optionally
-- a specific location.
-- ============================================================
create type user_role as enum ('owner', 'manager', 'staff');

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  location_id  uuid references locations(id) on delete set null,
  role         user_role not null default 'staff',
  full_name    text not null,
  pin_hash     text,                     -- bcrypt hash of 4-digit PIN for quick POS login
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_company_id_idx  on profiles(company_id);
create index profiles_location_id_idx on profiles(location_id);

-- ============================================================
-- MENU — CATEGORIES
-- Top-level menu groupings (e.g. "Mains", "Drinks", "Desserts").
-- Stored at company level so all locations share the same menu.
-- ============================================================
create table categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_company_id_idx on categories(company_id);

-- ============================================================
-- MENU — PRODUCTS
-- Individual menu items. Prices in NZD (stored as integer cents
-- to avoid floating-point issues).
-- ============================================================
create table products (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  category_id  uuid not null references categories(id) on delete restrict,
  name         text not null,
  description  text,
  price_cents  integer not null check (price_cents >= 0),  -- NZD cents
  available    boolean not null default true,
  image_url    text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index products_company_id_idx  on products(company_id);
create index products_category_id_idx on products(category_id);

-- ============================================================
-- MENU — MODIFIER GROUPS + MODIFIERS
-- e.g. Group: "Choose your size" → Options: Small, Medium, Large
-- ============================================================
create table modifier_groups (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  name           text not null,                        -- e.g. "Choose your size"
  required       boolean not null default false,
  min_selections integer not null default 0,
  max_selections integer not null default 1,
  created_at     timestamptz not null default now()
);

create table modifiers (
  id                uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  name              text not null,                     -- e.g. "Large"
  price_adjustment  integer not null default 0,        -- NZD cents (can be negative)
  sort_order        integer not null default 0
);

-- Link table: which modifier groups apply to which products
create table product_modifier_groups (
  product_id        uuid not null references products(id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  primary key (product_id, modifier_group_id)
);

-- ============================================================
-- TABLES
-- Physical tables in a restaurant/bar (per location).
-- ============================================================
create type table_status as enum ('available', 'occupied', 'reserved', 'unavailable');

create table restaurant_tables (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  number      text not null,             -- Display label, e.g. "12" or "Bar 3"
  capacity    integer not null default 4,
  area        text,                      -- e.g. "Main Floor", "Outdoor", "Bar"
  status      table_status not null default 'available',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (location_id, number)
);

create index restaurant_tables_location_id_idx on restaurant_tables(location_id);

-- ============================================================
-- ORDERS
-- A tab or transaction. An order belongs to a location and
-- optionally to a table. Totals stored as integer cents.
-- ============================================================
create type order_status as enum ('open', 'closed', 'cancelled', 'refunded');
create type order_type   as enum ('dine-in', 'takeaway', 'delivery');
create type payment_status as enum ('unpaid', 'partial', 'paid', 'refunded');

create table orders (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references locations(id) on delete restrict,
  company_id     uuid not null references companies(id) on delete restrict,
  table_id       uuid references restaurant_tables(id) on delete set null,
  staff_id       uuid references profiles(id) on delete set null,
  order_number   integer not null,       -- Human-readable daily counter, set by trigger
  status         order_status not null default 'open',
  order_type     order_type   not null default 'dine-in',
  payment_status payment_status not null default 'unpaid',
  customer_name  text,
  notes          text,
  subtotal_cents integer not null default 0,
  gst_cents      integer not null default 0,   -- 15% NZ GST
  total_cents    integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz
);

create index orders_location_id_idx on orders(location_id);
create index orders_company_id_idx  on orders(company_id);
create index orders_table_id_idx    on orders(table_id);
create index orders_status_idx      on orders(status);

-- Daily order counter per location
create sequence order_number_seq;

create or replace function set_order_number()
returns trigger language plpgsql as $$
begin
  -- Simple incrementing counter; in production you'd reset per-location per-day
  new.order_number := nextval('order_number_seq');
  return new;
end;
$$;

create trigger trg_set_order_number
  before insert on orders
  for each row execute function set_order_number();

-- ============================================================
-- ORDER ITEMS
-- ============================================================
create type item_status as enum ('pending', 'preparing', 'ready', 'served', 'cancelled');

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  name        text not null,             -- Snapshot of product name at time of order
  quantity    integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null,     -- Snapshot of price at time of order
  notes       text,
  status      item_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index order_items_order_id_idx on order_items(order_id);

-- ============================================================
-- ORDER ITEM MODIFIERS
-- Snapshot of applied modifiers (name + price at time of order)
-- ============================================================
create table order_item_modifiers (
  id                  uuid primary key default gen_random_uuid(),
  order_item_id       uuid not null references order_items(id) on delete cascade,
  modifier_id         uuid references modifiers(id) on delete set null,
  name                text not null,     -- Snapshot
  price_adjustment_cents integer not null default 0
);

-- ============================================================
-- PAYMENTS
-- A single order can have multiple payments (e.g. split bill).
-- ============================================================
create type payment_method as enum ('cash', 'eftpos', 'credit', 'voucher', 'complimentary');
create type payment_status_type as enum ('pending', 'completed', 'failed', 'refunded');

create table payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete restrict,
  company_id      uuid not null references companies(id) on delete restrict,
  location_id     uuid not null references locations(id) on delete restrict,
  staff_id        uuid references profiles(id) on delete set null,
  amount_cents    integer not null check (amount_cents > 0),
  method          payment_method not null,
  status          payment_status_type not null default 'pending',
  transaction_ref text,                  -- External terminal reference
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index payments_order_id_idx on payments(order_id);

-- ============================================================
-- updated_at TRIGGER
-- Automatically maintain updated_at on every write.
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_companies_updated_at
  before update on companies
  for each row execute function touch_updated_at();

create trigger trg_locations_updated_at
  before update on locations
  for each row execute function touch_updated_at();

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function touch_updated_at();

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function touch_updated_at();

create trigger trg_products_updated_at
  before update on products
  for each row execute function touch_updated_at();

create trigger trg_tables_updated_at
  before update on restaurant_tables
  for each row execute function touch_updated_at();

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function touch_updated_at();

create trigger trg_order_items_updated_at
  before update on order_items
  for each row execute function touch_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY
-- All data is scoped to company_id from the user's profile.
-- ============================================================
alter table companies           enable row level security;
alter table locations           enable row level security;
alter table profiles            enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table modifier_groups     enable row level security;
alter table modifiers           enable row level security;
alter table product_modifier_groups enable row level security;
alter table restaurant_tables   enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_item_modifiers enable row level security;
alter table payments            enable row level security;

-- Helper: get the company_id for the currently authenticated user
create or replace function auth_company_id()
returns uuid language sql stable as $$
  select company_id from profiles where id = auth.uid()
$$;

-- Helper: get the role for the currently authenticated user
create or replace function auth_user_role()
returns user_role language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

-- companies: users can only see their own company
create policy "users see own company"
  on companies for select
  using (id = auth_company_id());

create policy "owners can update company"
  on companies for update
  using (id = auth_company_id() and auth_user_role() = 'owner');

-- locations: scoped to company
create policy "users see own company locations"
  on locations for select
  using (company_id = auth_company_id());

create policy "managers can manage locations"
  on locations for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- profiles: users see profiles in their company; can update own profile
create policy "users see company profiles"
  on profiles for select
  using (company_id = auth_company_id());

create policy "users update own profile"
  on profiles for update
  using (id = auth.uid());

create policy "managers manage profiles"
  on profiles for insert
  with check (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- categories
create policy "users see company categories"
  on categories for select
  using (company_id = auth_company_id());

create policy "managers manage categories"
  on categories for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- products
create policy "users see company products"
  on products for select
  using (company_id = auth_company_id());

create policy "managers manage products"
  on products for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- modifier_groups + modifiers
create policy "users see company modifier_groups"
  on modifier_groups for select
  using (company_id = auth_company_id());

create policy "managers manage modifier_groups"
  on modifier_groups for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

create policy "users see company modifiers"
  on modifiers for select
  using (company_id = auth_company_id());

create policy "managers manage modifiers"
  on modifiers for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

create policy "users see product_modifier_groups"
  on product_modifier_groups for select
  using (
    product_id in (select id from products where company_id = auth_company_id())
  );

create policy "managers manage product_modifier_groups"
  on product_modifier_groups for all
  using (
    product_id in (
      select id from products
      where company_id = auth_company_id()
    )
    and auth_user_role() in ('owner', 'manager')
  );

-- restaurant_tables
create policy "users see company tables"
  on restaurant_tables for select
  using (company_id = auth_company_id());

create policy "staff can update table status"
  on restaurant_tables for update
  using (company_id = auth_company_id());

create policy "managers manage tables"
  on restaurant_tables for insert
  with check (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- orders
create policy "users see company orders"
  on orders for select
  using (company_id = auth_company_id());

create policy "staff can create and update orders"
  on orders for insert
  with check (company_id = auth_company_id());

create policy "staff can update orders"
  on orders for update
  using (company_id = auth_company_id());

-- order_items
create policy "users see order items"
  on order_items for select
  using (
    order_id in (select id from orders where company_id = auth_company_id())
  );

create policy "staff manage order items"
  on order_items for all
  using (
    order_id in (select id from orders where company_id = auth_company_id())
  );

-- order_item_modifiers
create policy "users see order item modifiers"
  on order_item_modifiers for select
  using (
    order_item_id in (
      select oi.id from order_items oi
      join orders o on o.id = oi.order_id
      where o.company_id = auth_company_id()
    )
  );

create policy "staff manage order item modifiers"
  on order_item_modifiers for all
  using (
    order_item_id in (
      select oi.id from order_items oi
      join orders o on o.id = oi.order_id
      where o.company_id = auth_company_id()
    )
  );

-- payments
create policy "users see company payments"
  on payments for select
  using (company_id = auth_company_id());

create policy "staff create payments"
  on payments for insert
  with check (company_id = auth_company_id());

create policy "managers manage payments"
  on payments for update
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));
