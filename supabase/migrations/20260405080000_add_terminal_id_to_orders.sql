-- Add terminal_id to orders table for audit trail
-- This tracks which terminal device processed each order

alter table orders
  add column terminal_id uuid references terminals(id) on delete restrict;

-- Add index for performance
create index orders_terminal_id_idx on orders(terminal_id);

-- Update RLS policies to allow terminals to create orders
-- Terminals can create orders for their own company
create policy "terminals create orders for own company"
  on orders for insert
  with check (
    exists (
      select 1 from terminals
      where id = auth.uid()
      and company_id = orders.company_id
    )
  );
