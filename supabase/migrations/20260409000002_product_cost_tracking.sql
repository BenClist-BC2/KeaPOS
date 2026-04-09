-- Add cost snapshot column to order items (ex-GST cost at time of sale)
ALTER TABLE order_items ADD COLUMN unit_cost_cents integer;

-- ─── Product cost snapshots ───────────────────────────────────
-- Records the calculated cost of a product each time it changes.
-- Used for cost history display and for audit/reporting.

CREATE TABLE product_cost_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id    uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost_cents    integer     NOT NULL,
  reason        text        NOT NULL,   -- 'ingredient_price_change' | 'recipe_change' | 'product_created'
  triggered_by  text,                   -- human-readable description e.g. ingredient name
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON product_cost_snapshots (product_id, created_at DESC);
CREATE INDEX ON product_cost_snapshots (company_id, created_at DESC);

ALTER TABLE product_cost_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON product_cost_snapshots
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
