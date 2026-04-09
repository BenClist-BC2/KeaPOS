-- ============================================================
-- Per-product modifier option pricing and visibility
-- ============================================================
-- Replaces global price_adjustment on modifiers with a per-product
-- product_modifier_options table. This allows:
--   - Different prices for the same modifier on different products
--     (e.g. "Large" costs more for chips than for a drink)
--   - Hiding specific options on specific products
--     (e.g. drinks only show Medium and Large, not Small)
-- ============================================================

-- Drop the global price_adjustment column from modifiers.
-- It made no sense as a global value — price depends on the product.
alter table modifiers drop column price_adjustment;

-- ── Product modifier options ──────────────────────────────────
-- One row per (product × modifier) when a modifier group is assigned
-- to a product. Created automatically by the server action.

create table product_modifier_options (
  id                     uuid    primary key default gen_random_uuid(),
  product_id             uuid    not null references products(id)  on delete cascade,
  modifier_id            uuid    not null references modifiers(id) on delete cascade,
  price_adjustment_cents integer not null default 0,
  enabled                boolean not null default true,
  unique (product_id, modifier_id)
);

comment on table product_modifier_options is
  'Per-product configuration for each modifier option: price adjustment (ex-GST) '
  'and whether this option is available on this product. '
  'Created automatically when a modifier group is assigned to a product.';
comment on column product_modifier_options.price_adjustment_cents is
  'Ex-GST price adjustment for this option on this product. '
  'Can be negative (discount/removal). Snapshotted onto order_item_modifiers at sale time.';
comment on column product_modifier_options.enabled is
  'When false, this option is hidden on this product at the POS terminal.';

create index product_modifier_options_product_id_idx  on product_modifier_options(product_id);
create index product_modifier_options_modifier_id_idx on product_modifier_options(modifier_id);

alter table product_modifier_options enable row level security;

create policy "users see company product modifier options"
  on product_modifier_options for select
  using (
    product_id in (select id from products where company_id = auth_company_id())
  );

create policy "managers manage product modifier options"
  on product_modifier_options for all
  using (
    product_id in (
      select id from products where company_id = auth_company_id()
    )
    and auth_user_role() in ('owner', 'manager')
  );
