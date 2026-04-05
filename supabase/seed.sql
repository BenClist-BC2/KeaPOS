-- ============================================================
-- KeaPOS Development Seed Data
-- Run after applying migrations to get a working dev environment.
--
-- Creates:
--   1 company  → "Aroha's Kitchen"
--   2 locations → "Cuba Street" + "Courtenay Place"
--   1 owner profile (link manually to an auth.users row)
--   Menu: 3 categories, 10 products
--   6 tables per location
-- ============================================================

-- NOTE: Replace these UUIDs with real auth.users IDs from your Supabase project
--       after creating test users via the Auth dashboard or sign-up flow.

-- ============================================================
-- Company
-- ============================================================
insert into companies (id, name, nzbn, gst_number) values
  ('00000000-0000-0000-0000-000000000001', 'Aroha''s Kitchen Ltd', '9429000000001', '123-456-789');

-- ============================================================
-- Locations
-- ============================================================
insert into locations (id, company_id, name, address, phone) values
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Cuba Street',
    '123 Cuba Street, Te Aro, Wellington 6011',
    '04 801 0001'
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Courtenay Place',
    '45 Courtenay Place, Te Aro, Wellington 6011',
    '04 801 0002'
  );

-- ============================================================
-- Categories
-- ============================================================
insert into categories (id, company_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Mains',   1),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Sides',   2),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'Drinks',  3),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'Desserts',4);

-- ============================================================
-- Products (prices in NZD cents)
-- ============================================================
insert into products (id, company_id, category_id, name, description, price_cents, sort_order) values
  -- Mains
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
    'Smashed Burger',     'Double beef patty, cheddar, pickles, house sauce',         1850, 1),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
    'Fish & Chips',       'Tarakihi, beer batter, thick-cut fries, tartare',          2200, 2),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
    'Eye Fillet 250g',    'Grass-fed NZ beef, seasonal veg, jus',                     3800, 3),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
    'Kumara & Lentil Bowl','Roasted kumara, lentils, tahini, dukkah (v)',             1900, 4),
  -- Sides
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021',
    'Thick-cut Fries',    'Sea salt, aioli',                                           800, 1),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021',
    'Onion Rings',        'Crispy, with chipotle dipping sauce',                       900, 2),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021',
    'Side Salad',         'Mixed leaves, cherry tomato, lemon dressing',               700, 3),
  -- Drinks
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022',
    'Craft Beer (Pint)',  'Ask your server for today''s selection',                    950, 1),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022',
    'House Wine (Glass)', 'Red or white — NZ drops',                                  1200, 2),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022',
    'Soft Drink',         'Coke, Sprite, L&P, Ginger Beer',                            450, 3),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022',
    'Flat White',         'Havana beans, full or trim',                                600, 4),
  -- Desserts
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000023',
    'Pavlova',            'House meringue, seasonal fruit, whipped cream',            1200, 1),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000023',
    'Hokey Pokey Ice Cream', '3 scoops, NZ-made',                                     900, 2);

-- ============================================================
-- Tables — Cuba Street (6 indoor + 2 outdoor)
-- ============================================================
insert into restaurant_tables (location_id, company_id, number, capacity, area) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '1',  4, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '2',  4, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '3',  2, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '4',  6, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '5',  4, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '6',  4, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'B1', 2, 'Bar'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'B2', 2, 'Bar');

-- ============================================================
-- Tables — Courtenay Place (6 indoor)
-- ============================================================
insert into restaurant_tables (location_id, company_id, number, capacity, area) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '1',  4, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '2',  4, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '3',  6, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '4',  2, 'Main Floor'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '5',  8, 'Private Dining'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'B1', 3, 'Bar');

-- ============================================================
-- Developer profiles
-- Each developer should add their own row here using their auth
-- user ID from their dev Supabase project. The conditional insert
-- means the row is silently skipped if the user doesn't exist in
-- the current environment (so other devs' seeds don't break).
-- ============================================================
insert into profiles (id, company_id, role, full_name)
select
  '12aa8c4e-7671-4ec6-9aaf-bbd70f6a2388',
  '00000000-0000-0000-0000-000000000001',
  'owner',
  'Ben Clist'
where exists (
  select 1 from auth.users where id = '12aa8c4e-7671-4ec6-9aaf-bbd70f6a2388'
)
on conflict (id) do nothing;
