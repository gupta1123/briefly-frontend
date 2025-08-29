# SQL Playbooks for Policies & Access

This folder contains ready-to-run SQL scripts to audit and reset Row Level Security (RLS) policies, aligned with Briefly’s roles, departments, and overrides model.

## Files
- `01_audit_core.sql`: Dumps current RLS status, all policies, duplicates summary, helper functions, triggers, and a snapshot of roles/members/departments/documents/overrides for all orgs.
- `02_minimal_fix.sql`: Drops the known conflicting policies (doc_chunks open read; duplicate org_settings policies) without a full reset.
- `03_reset_policies_drop_all.sql`: Drops ALL policies for the relevant tables and re-enables RLS (no data loss). Use during a quiet window.
- `04_reset_policies_create_clean.sql`: Recreates a clean, consistent policy set (documents are department-scoped; admins bypass; storage writes require `storage.upload`).
 - `05_enable_folder_sharing.sql`: Adds folder/subfolder sharing support via `folder_access` and updates document/chunk policies to honor shares.
 - `03b_reset_policies_drop_public_only.sql`: Same as 03 but only for `public` schema (skips `storage.objects`). Use this if you see "must be owner of table objects".
 - `04b_reset_policies_create_public_only.sql`: Same as 04 but only for `public` schema.

## Recommended Usage

### Option A — Minimal Fix (fast, low risk)
1) Run `01_audit_core.sql` to snapshot your current state.
2) Run `02_minimal_fix.sql` to remove the most problematic overlaps.
3) Run `01_audit_core.sql` again and check the duplicates summary is empty for the targeted tables.

### Option B — Full Reset (most consistent)
1) Run `01_audit_core.sql` and save outputs.
2) Run `03_reset_policies_drop_all.sql` to drop all existing policies. If you get an error like `must be owner of table objects`, run `03b_reset_policies_drop_public_only.sql` instead.
3) Run `04_reset_policies_create_clean.sql` to apply the unified policy set. If you used 03b, run `04b_reset_policies_create_public_only.sql` instead.
4) Run `01_audit_core.sql` again to verify.
5) (Optional) Run `05_enable_folder_sharing.sql` to enable folder/subfolder sharing across departments.

If you want me to validate results, share the outputs from steps 1 and 4.
