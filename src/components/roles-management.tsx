"use client";
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { apiFetch, getApiContext } from '@/lib/api';

type OrgRole = {
  org_id: string;
  key: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: Record<string, boolean>;
};

const PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: 'org.manage_members', label: 'Manage Members', group: 'Organization' },
  { key: 'org.update_settings', label: 'Update Settings', group: 'Organization' },
  { key: 'security.ip_bypass', label: 'Bypass IP Allowlist', group: 'Security' },
  { key: 'documents.read', label: 'Read Documents', group: 'Documents' },
  { key: 'documents.create', label: 'Create Documents', group: 'Documents' },
  { key: 'documents.update', label: 'Update Documents', group: 'Documents' },
  { key: 'documents.delete', label: 'Delete Documents', group: 'Documents' },
  { key: 'documents.move', label: 'Move Documents', group: 'Documents' },
  { key: 'documents.link', label: 'Link Documents', group: 'Documents' },
  { key: 'documents.version.manage', label: 'Manage Versions', group: 'Documents' },
  { key: 'documents.bulk_delete', label: 'Bulk Delete', group: 'Documents' },
  { key: 'storage.upload', label: 'Upload to Storage', group: 'Storage' },
  { key: 'search.semantic', label: 'Semantic Search', group: 'Search' },
  { key: 'chat.save_sessions', label: 'Save Chat Sessions', group: 'Chat' },
  { key: 'audit.read', label: 'Read Audit Log', group: 'Audit' },
];

function groupBy<T, K extends string>(list: T[], getKey: (t: T) => K) {
  return list.reduce((acc, item) => {
    const k = getKey(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

export default function RolesManagement() {
  const [roles, setRoles] = React.useState<OrgRole[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newRole, setNewRole] = React.useState({ key: '', name: '', description: '' });

  const refresh = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`);
      setRoles(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const onToggle = async (role: OrgRole, permKey: string, value: boolean) => {
    const orgId = getApiContext().orgId || '';
    const nextPerms = { ...(role.permissions || {}), [permKey]: value };
    await apiFetch(`/orgs/${orgId}/roles/${encodeURIComponent(role.key)}`, {
      method: 'PATCH',
      body: { permissions: nextPerms },
    });
    setRoles(prev => prev.map(r => r.key === role.key ? { ...r, permissions: nextPerms } : r));
  };

  const onCreate = async () => {
    const orgId = getApiContext().orgId || '';
    if (!newRole.key || !newRole.name) return;
    await apiFetch(`/orgs/${orgId}/roles`, { method: 'POST', body: { ...newRole, permissions: {} } });
    setNewRole({ key: '', name: '', description: '' });
    setCreating(false);
    refresh();
  };

  const onDelete = async (role: OrgRole) => {
    const orgId = getApiContext().orgId || '';
    await apiFetch(`/orgs/${orgId}/roles/${encodeURIComponent(role.key)}`, { method: 'DELETE' });
    setRoles(prev => prev.filter(r => r.key !== role.key));
  };

  const grouped = groupBy(PERMISSIONS, p => p.group);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles & Permissions</CardTitle>
        <p className="text-sm text-muted-foreground">Create custom roles and control granular access per organization.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{roles.length} roles</div>
          {!creating ? (
            <Button onClick={() => setCreating(true)}>New Role</Button>
          ) : (
            <div className="flex gap-2 items-end">
              <Input placeholder="key (e.g. editor)" value={newRole.key} onChange={e => setNewRole(r => ({ ...r, key: e.target.value }))} />
              <Input placeholder="name" value={newRole.name} onChange={e => setNewRole(r => ({ ...r, name: e.target.value }))} />
              <Input placeholder="description (optional)" value={newRole.description} onChange={e => setNewRole(r => ({ ...r, description: e.target.value }))} />
              <Button onClick={onCreate}>Create</Button>
              <Button variant="outline" onClick={() => { setCreating(false); setNewRole({ key: '', name: '', description: '' }); }}>Cancel</Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading roles…</div>) : (
          <div className="space-y-6">
            {roles.map(role => (
              <div key={role.key} className="border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {role.name} <span className="text-muted-foreground text-xs">({role.key})</span>
                    </div>
                    {role.description && <div className="text-xs text-muted-foreground">{role.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {role.is_system && <Badge variant="outline">System</Badge>}
                    {!role.is_system && (
                      <Button size="sm" variant="destructive" onClick={() => onDelete(role)}>Delete</Button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(grouped).map(([group, perms]) => (
                    <div key={group}>
                      <div className="text-xs font-semibold mb-2">{group}</div>
                      <div className="space-y-2">
                        {perms.map(p => (
                          <label key={p.key} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={!!role.permissions?.[p.key]} onCheckedChange={(v:any) => onToggle(role, p.key, !!v)} />
                            <span>{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {roles.length === 0 && <div className="text-sm text-muted-foreground">No roles yet.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

