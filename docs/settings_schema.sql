-- Settings tables for Briefly application
-- Run this after the main supabase_schema.sql

-- User-level settings (preferences)
create table if not exists user_settings (
  user_id uuid primary key references app_users(id) on delete cascade,
  date_format text default 'd MMM yyyy',
  accent_color text default 'default',
  dark_mode boolean default false,
  chat_filters_enabled boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organization-level settings (security and UI preferences)
create table if not exists org_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  date_format text default 'd MMM yyyy',
  accent_color text default 'default',
  dark_mode boolean default false,
  chat_filters_enabled boolean default false,
  ip_allowlist_enabled boolean default false,
  ip_allowlist_ips text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on settings tables
alter table user_settings enable row level security;
alter table org_settings enable row level security;

-- RLS Policies for user_settings
create policy user_settings_self_read on user_settings for select using (user_id = auth.uid());
create policy user_settings_self_write on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- RLS Policies for org_settings  
create policy org_settings_member_read on org_settings for select using (is_member_of(org_id));
create policy org_settings_admin_write on org_settings for all using (current_org_role(org_id) = 'orgAdmin') with check (current_org_role(org_id) = 'orgAdmin');

-- Indexes for performance
create index if not exists idx_user_settings_user_id on user_settings(user_id);
create index if not exists idx_org_settings_org_id on org_settings(org_id);

-- Update triggers for updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_user_settings_updated_at before update on user_settings
  for each row execute function update_updated_at_column();

create trigger update_org_settings_updated_at before update on org_settings  
  for each row execute function update_updated_at_column();