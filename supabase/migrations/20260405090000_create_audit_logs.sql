-- Audit logging table for compliance and security
-- Records all significant actions in the system for financial/security auditing

create table audit_logs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  user_id        uuid references profiles(id) on delete set null,  -- Who performed the action
  terminal_id    uuid references terminals(id) on delete set null, -- If from a terminal

  -- What happened
  action         text not null,      -- e.g. 'order.created', 'staff.login', 'product.price_changed'
  entity_type    text not null,      -- e.g. 'order', 'product', 'staff', 'terminal'
  entity_id      uuid,                -- ID of the affected record

  -- Change tracking (for modifications)
  old_values     jsonb,               -- Previous state (for updates/deletes)
  new_values     jsonb,               -- New state (for creates/updates)

  -- Context
  metadata       jsonb,               -- Additional context (order_number, PIN attempt count, etc.)
  ip_address     inet,                -- Client IP
  user_agent     text,                -- Browser/client info

  created_at     timestamptz not null default now()
);

-- Indexes for querying
create index audit_logs_company_id_idx on audit_logs(company_id);
create index audit_logs_user_id_idx on audit_logs(user_id);
create index audit_logs_terminal_id_idx on audit_logs(terminal_id);
create index audit_logs_action_idx on audit_logs(action);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);
create index audit_logs_created_at_idx on audit_logs(created_at desc);

-- RLS policies
alter table audit_logs enable row level security;

-- Users can only read audit logs for their own company
create policy "users read own company audit logs"
  on audit_logs for select
  using (company_id = auth_company_id());

-- Only the system can insert audit logs (via triggers or server functions)
-- Users cannot directly insert/update/delete audit logs
create policy "system only writes audit logs"
  on audit_logs for insert
  with check (false);  -- No one can insert directly

-- Grant insert to authenticated role for server actions
grant insert on audit_logs to authenticated;

comment on table audit_logs is 'Comprehensive audit trail for all system actions';
comment on column audit_logs.action is 'Action type: auth.login, auth.pin_login, order.created, order.item_added, order.item_removed, order.completed, order.cancelled, product.created, product.price_changed, terminal.created, terminal.deactivated, staff.created, etc.';
comment on column audit_logs.metadata is 'Additional context: { order_number, success: true/false, reason, etc. }';
