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

// User-friendly permission categories - hide technical details
const PERMISSION_CATEGORIES = [
  {
    title: 'Documents',
    description: 'What users can do with documents',
    permissions: [
      {
        key: 'documents.read',
        label: 'View Documents',
        description: 'Can view and search documents',
        userFriendly: true
      },
      {
        key: 'documents.create',
        label: 'Upload Documents',
        description: 'Can upload new documents to the system',
        userFriendly: true
      },
      {
        key: 'documents.update',
        label: 'Edit Documents',
        description: 'Can modify existing documents',
        userFriendly: true
      },
      {
        key: 'documents.delete',
        label: 'Delete Documents',
        description: 'Can remove documents from the system',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Organization',
    description: 'Administrative capabilities',
    permissions: [
      {
        key: 'org.manage_members',
        label: 'Manage Users & Teams',
        description: 'Can manage user accounts and team membership across the organization',
        userFriendly: true
      },
      {
        key: 'departments.manage_members',
        label: 'Manage Team Members',
        description: 'Can add, remove, and manage users within their own teams',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Security',
    description: 'Access control and security features',
    permissions: [
      {
        key: 'security.ip_bypass',
        label: 'Bypass IP Restrictions',
        description: 'Can access the organization from any IP address, bypassing IP allowlist restrictions',
        userFriendly: true
      }
    ]
  },
  {
    title: 'Advanced Features',
    description: 'Specialized functionality',
    permissions: [
      {
        key: 'audit.read',
        label: 'View Activity Logs',
        description: 'Can see system activity and audit trail',
        userFriendly: true
      }
    ]
  }
];

// Technical permissions that should be hidden from end users but managed in backend
const HIDDEN_PERMISSIONS = [
  'org.update_settings',
  'documents.move',
  'documents.link',
  'documents.version.manage',
  'documents.bulk_delete',
  'storage.upload',
  'search.semantic',
  'departments.read'
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
  // Access is limited to core roles only; creation disabled
  const [creating] = React.useState(false);
  const [newRole] = React.useState({ key: '', name: '', description: '' });

  const refresh = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`);
      const allowed = new Set(['orgAdmin','teamLead','member','contentViewer','contentManager']);
      setRoles((data || []).filter(r => allowed.has(r.key)));
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

  const onCreate = async () => {};

  const onDelete = async (_role: OrgRole) => {};

  // Filter permissions to only show user-friendly ones
  const getVisiblePermissions = (rolePermissions: Record<string, boolean>) => {
    const visible: Record<string, boolean> = {};
    Object.entries(rolePermissions).forEach(([key, value]) => {
      if (!HIDDEN_PERMISSIONS.includes(key)) {
        visible[key] = value;
      }
    });
    return visible;
  };

  const roleLabel = (key: string, name: string) => {
    switch (key) {
      case 'orgAdmin': return 'Admin';
      case 'teamLead': return 'Team Lead';
      case 'member': return 'Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Content Viewer';
      default: return name || key;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles & Permissions</CardTitle>
        <p className="text-sm text-muted-foreground">Core roles for this organization.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{roles.length} roles</div>
          {/* Role creation disabled in limited access mode */}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading roles…</div>) : (
          <div className="space-y-6">
            {roles.map(role => (
              <div key={role.key} className="border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {roleLabel(role.key, role.name)} <span className="text-muted-foreground text-xs">({role.key})</span>
                    </div>
                    {role.description && <div className="text-xs text-muted-foreground">{role.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">System</Badge>
                  </div>
                </div>
                <div className="mt-4 space-y-6">
                  {PERMISSION_CATEGORIES.map(category => {
                    const categoryPermissions = category.permissions.filter(p =>
                      getVisiblePermissions(role.permissions)[p.key] !== undefined
                    );

                    if (categoryPermissions.length === 0) return null;

                    return (
                      <div key={category.title}>
                        <div className="mb-3">
                          <div className="text-sm font-semibold">{category.title}</div>
                          <div className="text-xs text-muted-foreground">{category.description}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {categoryPermissions.map(p => (
                            <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={!!role.permissions?.[p.key]}
                                  onCheckedChange={(v:any) => onToggle(role, p.key, !!v)}
                                />
                                <div>
                                  <div className="text-sm font-medium">{p.label}</div>
                                  <div className="text-xs text-muted-foreground">{p.description}</div>
                                </div>
                              </div>
                              <Badge variant={!!role.permissions?.[p.key] ? "default" : "secondary"}>
                                {!!role.permissions?.[p.key] ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
