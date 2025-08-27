"use client";
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { Check, X } from 'lucide-react';

// Human-friendly permission labels (keep keys in sync with backend)
const PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: 'org.manage_members', label: 'Manage members', group: 'Organization' },
  { key: 'org.update_settings', label: 'Update settings', group: 'Organization' },
  { key: 'security.ip_bypass', label: 'Bypass IP allowlist', group: 'Security' },
  { key: 'documents.read', label: 'Read documents', group: 'Documents' },
  { key: 'documents.create', label: 'Create documents', group: 'Documents' },
  { key: 'documents.update', label: 'Edit documents', group: 'Documents' },
  { key: 'documents.delete', label: 'Delete documents', group: 'Documents' },
  { key: 'documents.move', label: 'Move documents', group: 'Documents' },
  { key: 'documents.link', label: 'Link documents', group: 'Documents' },
  { key: 'documents.version.manage', label: 'Manage versions', group: 'Documents' },
  { key: 'documents.bulk_delete', label: 'Bulk delete', group: 'Documents' },
  { key: 'storage.upload', label: 'Upload files', group: 'Storage' },
  { key: 'search.semantic', label: 'Use semantic search', group: 'Search' },
  { key: 'chat.save_sessions', label: 'Save chat sessions', group: 'Chat' },
  { key: 'audit.read', label: 'View audit log', group: 'Audit' },
];

type Department = { id: string; name: string };
type OrgUser = { userId: string; displayName?: string | null };

export default function OverridesManagement() {
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [selectedUser, setSelectedUser] = React.useState<string>('');
  const [selectedDept, setSelectedDept] = React.useState<string | 'org'>('org');
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(false);
  const [effective, setEffective] = React.useState<Record<string, boolean>>({});
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');
  React.useEffect(() => {
    const off = onApiContextChange(({ orgId }) => setOrgId(orgId || ''));
    return () => off();
  }, []);

  const refresh = React.useCallback(async () => {
    if (!orgId) return;
    const u = await apiFetch<any[]>(`/orgs/${orgId}/users`);
    setUsers((u || []).map(r => ({ userId: r.userId, displayName: r.displayName || r.app_users?.display_name || '' })));
    const d = await apiFetch<any[]>(`/orgs/${orgId}/departments`);
    setDepartments((d || []).map((x:any) => ({ id: x.id, name: x.name })));
  }, [orgId]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const loadOverrides = React.useCallback(async () => {
    if (!selectedUser) { setOverrides({}); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userId', selectedUser);
      if (selectedDept === 'org') params.set('departmentId', 'null');
      else params.set('departmentId', selectedDept);
      const list = await apiFetch<any[]>(`/orgs/${orgId}/overrides?${params.toString()}`);
      const row = (list || [])[0];
      const base = row?.permissions || {};
      setOverrides(base);
      setPending(base);
      setDirty(false);
      // Also load effective permissions
      const eff = await apiFetch<any>(`/orgs/${orgId}/overrides/effective?${params.toString()}`);
      setEffective(eff?.effective || {});
    } finally { setLoading(false); }
  }, [orgId, selectedUser, selectedDept]);

  React.useEffect(() => { void loadOverrides(); }, [loadOverrides]);

  const onToggleLocal = (key: string, val: boolean) => {
    const next = { ...(pending || {}), [key]: val };
    setPending(next);
    setDirty(true);
  };

  const onReset = () => {
    setPending(overrides);
    setDirty(false);
  };

  const onSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiFetch(`/orgs/${orgId}/overrides`, {
        method: 'PUT',
        body: {
          userId: selectedUser,
          departmentId: selectedDept === 'org' ? null : selectedDept,
          permissions: pending,
        },
      });
      setOverrides(pending);
      setDirty(false);
      // Refresh effective after save
      await loadOverrides();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per‑User Overrides</CardTitle>
        <p className="text-sm text-muted-foreground">Override a person’s permissions at the org or for a specific department. Overrides take precedence over role permissions.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Select value={selectedUser} onValueChange={v => setSelectedUser(v)}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {users.map(u => (<SelectItem key={u.userId} value={u.userId}>{u.displayName || u.userId}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={selectedDept} onValueChange={v => setSelectedDept(v as any)}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Scope" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="org">Organization (all departments)</SelectItem>
              {departments.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadOverrides}>Reload</Button>
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Effective access (read‑only) reflects Role → Org override → Team override precedence.</div>
            <div className="flex items-center gap-2">
              <Button onClick={onSave} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>Reset</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PERMISSIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={!!pending[p.key]} onCheckedChange={(v:any) => onToggleLocal(p.key, !!v)} />
                    <span className="text-sm">{p.label}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {effective[p.key] ? (
                      <>
                        <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                        <span>Has access</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 text-muted-foreground" />
                        <span>No access</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
