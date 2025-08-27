-- Fix user_access_overrides to allow org-wide overrides (NULL department_id)
-- and support upsert on (org_id, user_id, department_id)

do $$
begin
  -- Add surrogate primary key if not present
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'user_access_overrides' and column_name = 'id'
  ) then
    alter table user_access_overrides add column id uuid default gen_random_uuid();
  end if;

  -- Drop existing primary key on (org_id, user_id, department_id) if it exists
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'user_access_overrides' and constraint_type = 'PRIMARY KEY'
  ) then
    alter table user_access_overrides drop constraint user_access_overrides_pkey;
  end if;

  -- Set surrogate primary key
  alter table user_access_overrides alter column id set not null;
  alter table user_access_overrides add primary key (id);

  -- Ensure department_id is nullable (org-wide overrides use NULL)
  begin
    alter table user_access_overrides alter column department_id drop not null;
  exception when others then
    -- ignore if already nullable
    null;
  end;

  -- Add a unique constraint for upsert semantics
  do $$ begin
    if not exists (
      select 1 from information_schema.table_constraints
      where table_name = 'user_access_overrides' and constraint_name = 'uq_user_access_scope'
    ) then
      alter table user_access_overrides add constraint uq_user_access_scope unique (org_id, user_id, department_id);
    end if;
  end $$;
end $$;

select 'overrides_fix applied' as status;

