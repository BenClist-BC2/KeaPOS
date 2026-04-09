-- ============================================================
-- Menu Management Expansion
-- ============================================================
-- Changes:
--   1. companies: add default_gst_rate setting
--   2. products:  add product_type, gst_rate, yield fields, ingredient link
--                 convert price_cents from inc-GST to ex-GST storage
--   3. order_items / order_item_modifiers: add gst_rate snapshot column
--   4. New tables: ingredients, suppliers, stock_receipts,
--                  stock_receipt_lines, recipe_lines,
--                  combo_items, combo_configs, promotions
-- ============================================================

-- ── Companies: configurable GST rate ─────────────────────────

alter table companies
  add column default_gst_rate integer not null default 15;

comment on column companies.default_gst_rate is
  'Default GST rate as an integer percentage (e.g. 15 for 15%). '
  'Applied to all new products and used by the GST helper throughout the app.';

-- ── Products: new columns ────────────────────────────────────

alter table products
  add column product_type text not null default 'purchased'
    check (product_type in ('purchased', 'recipe', 'combo')),
  add column gst_rate integer not null default 15,
  add column yield_quantity numeric,
  add column yield_unit text check (yield_unit in ('g', 'kg', 'ml', 'L', 'each', 'dozen'));

comment on column products.product_type is
  'purchased = buy and sell as-is; '
  'recipe = assembled from ingredients/nested recipes; '
  'combo = fixed bundle of products';
comment on column products.gst_rate is
  'GST rate percentage for this product. Defaults to company default_gst_rate. '
  'Stored on order_items at sale time so historical data is unaffected by rate changes.';
comment on column products.yield_quantity is
  'Recipe products only: quantity produced by one run of the recipe (e.g. 3 for "3 L of batter").';
comment on column products.yield_unit is
  'Recipe products only: unit of the yield (e.g. ''L''). '
  'Used to calculate cost-per-unit when this recipe is nested inside another.';

-- Convert existing price_cents from inc-GST to ex-GST.
-- Ex-GST = round(inc-GST × 100 / (100 + rate)).
-- Assumes historical rate of 15%; no-op if table is empty.
update products
  set price_cents = round(price_cents * 100.0 / 115.0)::integer;

comment on column products.price_cents is
  'Sell price in NZD cents, stored ex-GST. '
  'Multiply by (1 + gst_rate/100) to display inc-GST to customers.';

-- ── Order items: GST rate snapshot ───────────────────────────

alter table order_items
  add column gst_rate integer not null default 15;

comment on column order_items.gst_rate is
  'GST rate percentage at time of sale. '
  'Preserves correct rate for historical reporting if the rate ever changes.';
comment on column order_items.unit_price_cents is
  'Unit price at time of order, stored ex-GST.';

-- ── Order item modifiers: GST rate snapshot ───────────────────

alter table order_item_modifiers
  add column gst_rate integer not null default 15;

comment on column order_item_modifiers.gst_rate is
  'GST rate percentage at time of sale.';
comment on column order_item_modifiers.price_adjustment_cents is
  'Price adjustment in NZD cents, stored ex-GST (can be negative for removals).';

-- ── Ingredients ───────────────────────────────────────────────
-- Physical stock items: raw recipe components AND purchased-for-resale items (e.g. cans of Coke).
-- All costs stored ex-GST per the ingredient's base unit.

create table ingredients (
  id           uuid    primary key default gen_random_uuid(),
  company_id   uuid    not null references companies(id) on delete cascade,
  name         text    not null,
  unit         text    not null check (unit in ('g', 'kg', 'ml', 'L', 'each', 'dozen')),
  cost_cents   integer not null default 0 check (cost_cents >= 0),
  out_of_stock boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table ingredients is
  'Stock items tracked for cost and availability. '
  'unit is the canonical base unit — all cost_cents values are per this unit. '
  'stock_receipt_lines may use a different unit (e.g. kg) which is converted on save.';
comment on column ingredients.cost_cents is
  'Ex-GST cost per base unit. Updated to the latest received price on each stock receipt save.';
comment on column ingredients.out_of_stock is
  'When true, all products that depend on this ingredient (directly or via nested recipes) '
  'are automatically marked unavailable by the server action.';

create index ingredients_company_id_idx on ingredients(company_id);

alter table ingredients enable row level security;

create policy "users see company ingredients"
  on ingredients for select
  using (company_id = auth_company_id());

create policy "managers manage ingredients"
  on ingredients for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

create trigger trg_ingredients_updated_at
  before update on ingredients
  for each row execute function touch_updated_at();

-- ── Products: link to ingredient (after ingredients table exists) ──

alter table products
  add column ingredient_id uuid references ingredients(id) on delete set null;

comment on column products.ingredient_id is
  'Purchased products only: the ingredient record used for cost tracking and out-of-stock propagation.';

-- ── Suppliers ─────────────────────────────────────────────────

create table suppliers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index suppliers_company_id_idx on suppliers(company_id);

alter table suppliers enable row level security;

create policy "users see company suppliers"
  on suppliers for select
  using (company_id = auth_company_id());

create policy "managers manage suppliers"
  on suppliers for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function touch_updated_at();

-- ── Stock receipts ────────────────────────────────────────────
-- Represents a supplier delivery / invoice.

create table stock_receipts (
  id             uuid  primary key default gen_random_uuid(),
  company_id     uuid  not null references companies(id) on delete cascade,
  supplier_id    uuid  references suppliers(id) on delete set null,
  created_by     uuid  references profiles(id) on delete set null,
  receipt_date   date  not null default current_date,
  invoice_number text,
  notes          text,
  created_at     timestamptz not null default now()
);

comment on table stock_receipts is
  'A supplier delivery / invoice. Contains one or more lines, each updating an ingredient cost.';

create index stock_receipts_company_id_idx  on stock_receipts(company_id);
create index stock_receipts_supplier_id_idx on stock_receipts(supplier_id);

alter table stock_receipts enable row level security;

create policy "users see company stock receipts"
  on stock_receipts for select
  using (company_id = auth_company_id());

create policy "managers manage stock receipts"
  on stock_receipts for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

-- ── Stock receipt lines ───────────────────────────────────────

create table stock_receipt_lines (
  id              uuid    primary key default gen_random_uuid(),
  receipt_id      uuid    not null references stock_receipts(id) on delete cascade,
  ingredient_id   uuid    not null references ingredients(id) on delete restrict,
  quantity        numeric not null check (quantity > 0),
  unit            text    not null check (unit in ('g', 'kg', 'ml', 'L', 'each', 'dozen')),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  created_at      timestamptz not null default now()
);

comment on column stock_receipt_lines.unit is
  'Unit as stated on the supplier invoice. May differ from ingredient base unit (e.g. kg vs g). '
  'Converted to base unit cost when updating ingredients.cost_cents.';
comment on column stock_receipt_lines.unit_cost_cents is
  'Ex-GST cost per invoice unit (not per base unit). '
  'ingredients.cost_cents = unit_cost_cents / unit_to_base_multiplier(unit).';

create index stock_receipt_lines_receipt_id_idx    on stock_receipt_lines(receipt_id);
create index stock_receipt_lines_ingredient_id_idx on stock_receipt_lines(ingredient_id);

alter table stock_receipt_lines enable row level security;

create policy "users see company receipt lines"
  on stock_receipt_lines for select
  using (
    receipt_id in (select id from stock_receipts where company_id = auth_company_id())
  );

create policy "managers manage receipt lines"
  on stock_receipt_lines for all
  using (
    receipt_id in (
      select id from stock_receipts where company_id = auth_company_id()
    )
    and auth_user_role() in ('owner', 'manager')
  );

-- ── Recipe lines ──────────────────────────────────────────────
-- Each row is one component of a recipe product.
-- Exactly one of ingredient_id or component_product_id must be set (enforced by CHECK).
-- Circular references are blocked at the application layer before insert.

create table recipe_lines (
  id                   uuid    primary key default gen_random_uuid(),
  product_id           uuid    not null references products(id) on delete cascade,
  ingredient_id        uuid    references ingredients(id) on delete restrict,
  component_product_id uuid    references products(id) on delete restrict,
  quantity             numeric not null check (quantity > 0),
  unit                 text    not null check (unit in ('g', 'kg', 'ml', 'L', 'each', 'dozen')),
  sort_order           integer not null default 0,
  constraint recipe_line_one_component check (
    (ingredient_id is not null)::int + (component_product_id is not null)::int = 1
  )
);

comment on table recipe_lines is
  'Components of a recipe product. Each line is either an ingredient or a nested recipe product.';
comment on column recipe_lines.component_product_id is
  'Nested recipe: another recipe-type product used as a component (e.g. "Batter" inside "Fried Fish"). '
  'Circular references are prevented in the server action — never enforced via a DB trigger.';
comment on column recipe_lines.quantity is
  'How much of this component goes into one batch of the parent recipe.';
comment on column recipe_lines.unit is
  'Unit for this quantity. Must be dimensionally compatible with the component''s base unit '
  '(weight↔weight, volume↔volume, count↔count). Validated at the application layer.';

create index recipe_lines_product_id_idx           on recipe_lines(product_id);
create index recipe_lines_ingredient_id_idx        on recipe_lines(ingredient_id);
create index recipe_lines_component_product_id_idx on recipe_lines(component_product_id);

alter table recipe_lines enable row level security;

create policy "users see company recipe lines"
  on recipe_lines for select
  using (
    product_id in (select id from products where company_id = auth_company_id())
  );

create policy "managers manage recipe lines"
  on recipe_lines for all
  using (
    product_id in (
      select id from products where company_id = auth_company_id()
    )
    and auth_user_role() in ('owner', 'manager')
  );

-- ── Combo items ───────────────────────────────────────────────

create table combo_items (
  id               uuid    primary key default gen_random_uuid(),
  combo_product_id uuid    not null references products(id) on delete cascade,
  item_product_id  uuid    not null references products(id) on delete restrict,
  quantity         integer not null default 1 check (quantity > 0),
  sort_order       integer not null default 0,
  constraint combo_no_self_reference check (combo_product_id != item_product_id)
);

create index combo_items_combo_product_id_idx on combo_items(combo_product_id);

alter table combo_items enable row level security;

create policy "users see company combo items"
  on combo_items for select
  using (
    combo_product_id in (select id from products where company_id = auth_company_id())
  );

create policy "managers manage combo items"
  on combo_items for all
  using (
    combo_product_id in (
      select id from products where company_id = auth_company_id()
    )
    and auth_user_role() in ('owner', 'manager')
  );

-- ── Combo configs ─────────────────────────────────────────────
-- One row per combo product, defining how its price is determined.

create table combo_configs (
  product_id          uuid primary key references products(id) on delete cascade,
  pricing_type        text not null default 'fixed'
    check (pricing_type in ('fixed', 'discount_percentage', 'discount_fixed')),
  discount_percentage integer check (discount_percentage between 0 and 100),
  discount_cents      integer check (discount_cents >= 0)
);

comment on column combo_configs.pricing_type is
  'fixed: use products.price_cents as-is (manually set). '
  'discount_percentage: auto-price = sum_of_parts − (sum × discount_percentage / 100). '
  'discount_fixed: auto-price = sum_of_parts − discount_cents (ex-GST).';
comment on column combo_configs.discount_cents is 'Ex-GST fixed discount amount for discount_fixed pricing.';

alter table combo_configs enable row level security;

create policy "users see company combo configs"
  on combo_configs for select
  using (
    product_id in (select id from products where company_id = auth_company_id())
  );

create policy "managers manage combo configs"
  on combo_configs for all
  using (
    product_id in (
      select id from products where company_id = auth_company_id()
    )
    and auth_user_role() in ('owner', 'manager')
  );

-- ── Promotions ────────────────────────────────────────────────

create table promotions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  name                text not null,
  type                text not null
    check (type in ('percentage_off', 'fixed_off', 'bogo', 'happy_hour')),
  scope               text not null default 'all'
    check (scope in ('product', 'category', 'all')),
  product_id          uuid references products(id) on delete cascade,
  category_id         uuid references categories(id) on delete cascade,
  discount_percentage integer check (discount_percentage between 0 and 100),
  discount_cents      integer check (discount_cents >= 0),
  valid_from          date,
  valid_to            date,
  start_time          time,
  end_time            time,
  days_of_week        integer[],
  min_spend_cents     integer check (min_spend_cents >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column promotions.discount_cents is 'Ex-GST fixed discount amount for fixed_off type.';
comment on column promotions.min_spend_cents is 'Ex-GST minimum order total before promotion applies.';
comment on column promotions.days_of_week is 'Days the promotion is active (0=Sun … 6=Sat). NULL means every day.';
comment on column promotions.start_time is 'Start of daily time window (happy_hour). NULL means no time restriction.';

create index promotions_company_id_idx on promotions(company_id);

alter table promotions enable row level security;

create policy "users see company promotions"
  on promotions for select
  using (company_id = auth_company_id());

create policy "managers manage promotions"
  on promotions for all
  using (company_id = auth_company_id() and auth_user_role() in ('owner', 'manager'));

create trigger trg_promotions_updated_at
  before update on promotions
  for each row execute function touch_updated_at();
