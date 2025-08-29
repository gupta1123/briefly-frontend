-- 02_minimal_fix.sql
-- Drop known conflicting/over-broad policies without a full reset.

-- 1) doc_chunks: remove open read policy that bypasses department scoping
drop policy if exists chunks_read on doc_chunks;

-- 2) org_settings: remove duplicate legacy policies (keep member_read + manage_perm)
drop policy if exists org_settings_read  on org_settings;
drop policy if exists org_settings_write on org_settings;

