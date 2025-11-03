"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { apiFetch, getApiContext, onApiContextChange } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Check, X, Settings, Users, Shield, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
        description: 'Can upload new documents',
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
        description: 'Can remove documents',
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
  },
  {
    title: 'Page Access',
    description: 'Control which pages users can see and access',
    permissions: [
      {
        key: 'pages.upload',
        label: 'Upload Document Page',
        description: 'Can access the upload document page',
        userFriendly: true
      },
      {
        key: 'pages.documents',
        label: 'Folders & Documents Page',
        description: 'Can access the folders and documents browsing page',
        userFriendly: true
      },
      {
        key: 'pages.activity',
        label: 'Activity Page',
        description: 'Can access the activity and audit logs page',
        userFriendly: true
      },
      {
        key: 'pages.recycle_bin',
        label: 'Recycle Bin Page',
        description: 'Can access the recycle bin to view deleted documents',
        userFriendly: true
      },
      {
        key: 'pages.chat',
        label: 'Chat Bot Page',
        description: 'Can access the chat/chatbot page',
        userFriendly: true
      },
      {
        key: 'dashboard.view',
        label: 'Dashboard View Level',
        description: 'Controls which dashboard view is shown. "admin" shows org-wide stats and team cards. "regular" shows role-based dashboard.',
        userFriendly: true,
        customType: 'select',
        options: [
          { value: 'regular', label: 'Regular Dashboard (Role-based)' },
          { value: 'admin', label: 'Admin Dashboard (Org-wide)' }
        ]
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
  'departments.read',
  'chat.save_sessions'
];

type OrgRole = {
  org_id: string;
  key: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: Record<string, boolean | string>;  // Allow string for dashboard.view
};

type Department = { id: string; name: string };
type OrgUser = { 
  userId: string; 
  displayName?: string | null; 
  email?: string | null; 
  role?: string; 
  departments?: Array<{ id: string; name: string; deptRole?: string }> 
};

export default function PermissionsManagement() {
  const { user, refreshPermissions } = useAuth();
  const [roles, setRoles] = React.useState<OrgRole[]>([]);
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);

  // General tab state
  const [selectedRole, setSelectedRole] = React.useState<string>('');

  // Override tab state
  const [selectedUser, setSelectedUser] = React.useState<string>('');
  const [selectedDept, setSelectedDept] = React.useState<string>('');
  const [overrides, setOverrides] = React.useState<Record<string, boolean | string>>({});
  const [effective, setEffective] = React.useState<Record<string, boolean | string>>({});
  const [deptMembershipWarning, setDeptMembershipWarning] = React.useState<string>('');

  // Loading states
  const [loading, setLoading] = React.useState(false);
  const [rolesLoading, setRolesLoading] = React.useState(false);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [orgId, setOrgId] = React.useState<string>(getApiContext().orgId || '');

  React.useEffect(() => {
    const off = onApiContextChange(({ orgId }) => {
      setOrgId(orgId || '');
      // Clear selected user when switching organizations
      setSelectedUser('');
      setSelectedDept('');
      setOverrides({});
      setEffective({});
      setDeptMembershipWarning('');
    });
    return () => { off(); };
  }, []);

  const refreshRoles = React.useCallback(async () => {
    if (!orgId) return;
    setRolesLoading(true);
    try {
      const data = await apiFetch<OrgRole[]>(`/orgs/${orgId}/roles`);
      const allowed = new Set(['orgAdmin','teamLead','member','contentManager','contentViewer']);
      const filteredRoles = (data || []).filter(r => allowed.has(r.key));
      
      // Sort roles from highest to lowest authority
      const roleOrder = ['orgAdmin', 'teamLead', 'contentManager', 'member', 'contentViewer'];
      const sortedRoles = filteredRoles.sort((a, b) => {
        const aIndex = roleOrder.indexOf(a.key);
        const bIndex = roleOrder.indexOf(b.key);
        return aIndex - bIndex;
      });
      
      setRoles(sortedRoles);
    } finally {
      setRolesLoading(false);
    }
  }, [orgId]);

  const refreshUsers = React.useCallback(async () => {
    if (!orgId) return;
    setUsersLoading(true);
    try {
      const u = await apiFetch<any[]>(`/orgs/${orgId}/users`);
      const usersWithDepts = (u || []).map((r) => {
          return {
            userId: r.userId,
            displayName: r.displayName || r.app_users?.display_name || '',
            email: r.email,
          role: r.role,
          departments: r.departments?.map((d: any) => ({ 
            id: d.id, 
            name: d.name, 
            deptRole: d.deptRole || d.role 
          })) || []
        };
      });
      // Sort users: Admin first, then Leads by name asc, then others by name asc
      const sortedUsers = usersWithDepts.sort((a, b) => {
        // Role priority: orgAdmin > teamLead > contentManager > member > contentViewer (case insensitive)
        const roleOrder = { 'orgadmin': 0, 'teamlead': 1, 'contentmanager': 2, 'member': 3, 'contentviewer': 4 };
        const aRolePriority = roleOrder[(a.role || '').toLowerCase() as keyof typeof roleOrder] ?? 999;
        const bRolePriority = roleOrder[(b.role || '').toLowerCase() as keyof typeof roleOrder] ?? 999;
        
        // If different roles, sort by role priority
        if (aRolePriority !== bRolePriority) {
          return aRolePriority - bRolePriority;
        }
        
        // Same role, sort alphabetically by display name
        const aName = (a.displayName || a.email || '').toLowerCase();
        const bName = (b.displayName || b.email || '').toLowerCase();
        return aName.localeCompare(bName);
      });
      
      setUsers(sortedUsers);
      const d = await apiFetch<any[]>(`/orgs/${orgId}/departments?includeMine=1`);
      // Filter out Core team for non-admin users
      const filteredDepartments = (d || []).filter((dept: any) => {
        if (dept.name === 'Core') {
          // Only show Core team to org admins
          return user?.role === 'systemAdmin';
        }
        return true;
      });
      setDepartments(filteredDepartments.map((x:any) => ({ id: x.id, name: x.name })));
    } finally {
      setUsersLoading(false);
    }
  }, [orgId, user]);

  React.useEffect(() => {
    refreshRoles();
    refreshUsers();
  }, [refreshRoles, refreshUsers]);

  const loadOverrides = React.useCallback(async () => {
    if (!selectedUser) {
      setOverrides({});
      setEffective({});
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('userId', selectedUser);
      if (selectedDept) params.set('departmentId', selectedDept);

      // Load current overrides
      const list = await apiFetch<any[]>(`/orgs/${orgId}/overrides?${params.toString()}`);
      const row = (list || [])[0];
      const base = row?.permissions || {};
      console.log('Overrides loaded:', base);
      setOverrides(base);

      // Load effective permissions (what the user actually has after role + overrides)
      const eff = await apiFetch<any>(`/orgs/${orgId}/overrides/effective?${params.toString()}`);
      setEffective(eff?.effective || {});
      setDeptMembershipWarning(eff?.note || '');
      console.log('Effective permissions loaded:', eff?.effective);
      if (eff?.note) {
        console.log('Permission note:', eff.note);
      }
    } finally { setLoading(false); }
  }, [orgId, selectedUser, selectedDept]);

  React.useEffect(() => { void loadOverrides(); }, [loadOverrides]);

  // When a user is selected, set default scope to their team if they have one
  React.useEffect(() => {
    if (selectedUser && users.length > 0) {
      const user = users.find(u => u.userId === selectedUser);
      if (user?.departments && user.departments.length > 0) {
        // Set to first team by default
        setSelectedDept(user.departments[0].id);
      } else if (departments.length > 0) {
        // No user teams, default to first available team
        setSelectedDept(departments[0].id);
      }
    }
  }, [selectedUser, users, departments]);

  const onRoleToggle = async (role: OrgRole, permKey: string, value: boolean | string) => {
    const nextPerms = { ...(role.permissions || {}), [permKey]: value };
    await apiFetch(`/orgs/${orgId}/roles/${encodeURIComponent(role.key)}`, {
      method: 'PATCH',
      body: { permissions: nextPerms },
    });
    setRoles(prev => prev.map(r => r.key === role.key ? { ...r, permissions: nextPerms } : r));
    // Refresh user permissions in the auth context so the UI updates immediately
    await refreshPermissions();
  };

  const onOverrideToggle = (key: string, val: boolean | string) => {
    setOverrides(prev => ({ ...prev, [key]: val }));
  };

  const onUserSelect = (userId: string) => {
    setSelectedUser(userId);
    setOverrides({});
    setEffective({});
    setDeptMembershipWarning('');
    setSelectedDept(''); // Will be updated by useEffect
  };

  const onSaveOverrides = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      await apiFetch(`/orgs/${orgId}/overrides`, {
        method: 'PUT',
        body: {
          userId: selectedUser,
          departmentId: selectedDept,
          permissions: overrides,
        },
      });
      // Refresh effective permissions after save
      await loadOverrides();
    } finally { setLoading(false); }
  };

  const roleLabel = (key: string, name: string) => {
    switch (key) {
      case 'orgAdmin': return 'Organization Administrator';
      case 'teamLead': return 'Team Lead';
      case 'member': return 'Team Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Content Viewer';
      default: return name || key;
    }
  };

  const roleDescription = (key: string) => {
    switch (key) {
      case 'orgAdmin': return 'Full organization access with administrative privileges';
      case 'teamLead': return 'Department lead with team-scoped management capabilities';
      case 'member': return 'Department member with full document capabilities within team';
      case 'contentManager': return 'Expanded content management privileges without administrative access';
      case 'contentViewer': return 'Read-only access with basic viewing permissions';
      default: return 'Custom role with specific permissions';
    }
  };

  const formatUserRole = (role: string) => {
    switch (role) {
      case 'orgAdmin': return 'Admin';
      case 'teamLead': return 'Lead';
      case 'member': return 'Member';
      case 'contentManager': return 'Content Manager';
      case 'contentViewer': return 'Viewer';
      default: return role;
    }
  };

  const getVisiblePermissions = (rolePermissions: Record<string, boolean | string>) => {
    const visible: Record<string, boolean | string> = {};
    Object.entries(rolePermissions).forEach(([key, value]) => {
      if (!HIDDEN_PERMISSIONS.includes(key)) {
        visible[key] = value;
      }
    });
    return visible;
  };

  return (
    <div className="h-full min-h-[600px] flex flex-col">
      <Tabs defaultValue="general" className="flex-1 flex flex-col">
        <div className="border-b">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              General Roles
            </TabsTrigger>
            <TabsTrigger value="override" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              User Overrides
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 flex">
          {/* Left Sidebar */}
          <div className="w-80 border-r bg-muted/30">
            <TabsContent value="general" className="h-full m-0">
              <div className="p-4">
                <h3 className="font-semibold mb-3">Roles</h3>
                <ScrollArea className="h-[500px]">
                  {rolesLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="p-3 rounded-lg border bg-card">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {roles.map(role => (
                        <button
                          key={role.key}
                          onClick={() => setSelectedRole(role.key)}
                          className={`w-full p-3 text-left rounded-lg border transition-colors ${
                            selectedRole === role.key
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card hover:bg-muted'
                          }`}
                        >
                          <div className="font-medium">{roleLabel(role.key, role.name)}</div>
                          <div className="text-xs opacity-80">{roleDescription(role.key)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="override" className="h-full m-0">
              <div className="p-4">
                <h3 className="font-semibold mb-3">Users</h3>
                <ScrollArea className="h-full max-h-[500px]">
                  {usersLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="p-3 rounded-lg border bg-card">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div>
                              <Skeleton className="h-4 w-24 mb-1" />
                              <Skeleton className="h-3 w-32" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {users.map(user => (
                        <button
                          key={user.userId}
                          onClick={() => onUserSelect(user.userId)}
                          className={`w-full p-3 text-left rounded-lg border transition-colors ${
                            selectedUser === user.userId
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card hover:bg-muted'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={`text-xs ${
                                selectedUser === user.userId
                                  ? 'bg-primary-foreground text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {(user.displayName || user.email || '?')[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                              <div className="font-medium truncate">{user.displayName || 'Unknown User'}</div>
                                {user.role && (
                                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                    {formatUserRole(user.role)}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs opacity-80 truncate">{user.email}</div>
                              {user.departments && user.departments.length > 0 && (
                                <div className="text-xs text-primary truncate">
                                  {user.departments.length} team{user.departments.length > 1 ? 's' : ''}
                                  {user.departments.some(d => d.deptRole === 'lead') && (
                                    <span className="ml-1 text-yellow-600">• Lead</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 min-w-0">
            <TabsContent value="general" className="h-full m-0">
              {selectedRole ? (
                <div className="p-6 h-full overflow-y-auto">
                  {(() => {
                    const role = roles.find(r => r.key === selectedRole);
                    if (!role) return null;

                    return (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <Shield className="w-5 h-5" />
                          <div>
                            <h2 className="text-lg font-semibold">{roleLabel(role.key, role.name)} Permissions</h2>
                            <p className="text-sm text-muted-foreground">Configure what this role can access</p>
                          </div>
                        </div>

                        <div className="space-y-6">
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
                                  {categoryPermissions.map(p => {
                                    // Handle dashboard.view as select dropdown
                                    if (p.key === 'dashboard.view') {
                                      const permValue = role.permissions?.[p.key];
                                      // Handle both string and boolean values (for backward compatibility)
                                      const currentValue = typeof permValue === 'string' 
                                        ? permValue 
                                        : (typeof permValue === 'boolean' && permValue 
                                          ? 'admin'  // If true, treat as admin
                                          : 'regular');  // Default to regular
                                      return (
                                        <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                          <div className="flex-1">
                                            <div className="text-sm font-medium mb-1">{p.label}</div>
                                            <div className="text-xs text-muted-foreground mb-2">{p.description}</div>
                                            <select
                                              value={currentValue}
                                              onChange={(e) => onRoleToggle(role, p.key, e.target.value)}
                                              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                                            >
                                              {p.options?.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    // Regular boolean permission checkbox
                                    return (
                                      <div key={p.key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                        <div className="flex items-center gap-3">
                                          <Checkbox
                                            checked={!!role.permissions?.[p.key]}
                                            onCheckedChange={(v:any) => onRoleToggle(role, p.key, !!v)}
                                          />
                                          <div>
                                            <div className="text-sm font-medium">{p.label}</div>
                                            <div className="text-xs text-muted-foreground">{p.description}</div>
                                          </div>
                                        </div>
                                        <Badge variant={role.permissions?.[p.key] ? "default" : "secondary"}>
                                          {role.permissions?.[p.key] ? "Enabled" : "Disabled"}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-6 h-full flex items-center justify-center text-center">
                  <div>
                    <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Select a Role</h3>
                    <p className="text-sm text-muted-foreground">Choose a role from the left to view and edit its permissions</p>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="override" className="h-full m-0">
              {selectedUser ? (
                <div className="p-6 h-full overflow-y-auto">
                  {(() => {
                    const user = users.find(u => u.userId === selectedUser);
                    if (!user) return null;

                    return (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5" />
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                {(user.displayName || user.email || '?')[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h2 className="text-lg font-semibold">{user.displayName || 'Unknown User'}</h2>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium">Scope</label>
                            <Select value={selectedDept} onValueChange={(value) => setSelectedDept(value as any)}>
                              <SelectTrigger className="w-full mt-1">
                                <SelectValue placeholder="Select scope" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments.filter(d => {
                                  // Only show departments where the user is a member
                                  const selectedUserData = users.find(u => u.userId === selectedUser);
                                  const userDeptMembership = selectedUserData?.departments?.find(dept => dept.id === d.id);
                                  return !!userDeptMembership;
                                }).map(d => {
                                  const selectedUserData = users.find(u => u.userId === selectedUser);
                                  const userDeptMembership = selectedUserData?.departments?.find(dept => dept.id === d.id);
                                  const deptRole = userDeptMembership?.deptRole;
                                  
                                  return (
                                    <SelectItem key={d.id} value={d.id}>
                                      <div className="flex items-center gap-2">
                                        <span>{d.name === 'Core' ? 'Core (Admin Only)' : d.name}</span>
                                        <div className="flex items-center gap-1">
                                          <Badge variant={deptRole === 'lead' ? 'default' : 'secondary'} className="text-xs px-1.5 py-0.5">
                                            {deptRole === 'lead' ? 'Lead' : 'Member'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end gap-2">
                            <Button variant="outline" onClick={loadOverrides}>Reload</Button>
                          </div>
                          <div className="flex items-end">
                            <Button onClick={onSaveOverrides} disabled={loading}>
                              {loading ? 'Saving...' : 'Save Changes'}
                            </Button>
                          </div>
                        </div>

                        {deptMembershipWarning && (
                          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              <div className="text-sm text-yellow-800">
                                <strong>Warning:</strong> {deptMembershipWarning}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="space-y-4">
                          {PERMISSION_CATEGORIES.map(category => {
                            const categoryPermissions = category.permissions.filter(p =>
                              !HIDDEN_PERMISSIONS.includes(p.key)
                            );

                            if (categoryPermissions.length === 0) return null;

                            return (
                              <div key={category.title}>
                                <div className="mb-3">
                                  <div className="text-sm font-semibold">{category.title}</div>
                                  <div className="text-xs text-muted-foreground">{category.description}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {categoryPermissions.map(p => {
                                    // Handle dashboard.view as select dropdown
                                    if (p.key === 'dashboard.view') {
                                      const hasOverride = overrides.hasOwnProperty(p.key);
                                      const effectiveValueRaw = effective.hasOwnProperty(p.key) ? effective[p.key] : 'regular';
                                      // Handle both string and boolean values (for backward compatibility)
                                      const effectiveValue = typeof effectiveValueRaw === 'string' 
                                        ? effectiveValueRaw 
                                        : (typeof effectiveValueRaw === 'boolean' && effectiveValueRaw 
                                          ? 'admin' 
                                          : 'regular');
                                      const overrideValueRaw = hasOverride ? overrides[p.key] : effectiveValue;
                                      const overrideValue = typeof overrideValueRaw === 'string' 
                                        ? overrideValueRaw 
                                        : (typeof overrideValueRaw === 'boolean' && overrideValueRaw 
                                          ? 'admin' 
                                          : 'regular');
                                      
                                      return (
                                        <div key={p.key} className="rounded-lg border bg-card p-3">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="text-sm font-medium truncate">{p.label}</div>
                                              <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                              {hasOverride && (
                                                <Badge variant="default">
                                                  Override Active
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                          <select
                                            value={overrideValue}
                                            onChange={(e) => onOverrideToggle(p.key, e.target.value)}
                                            className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                                          >
                                            {p.options?.map(opt => (
                                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    }
                                    
                                    // Regular boolean permission
                                    const hasOverride = overrides.hasOwnProperty(p.key);
                                    const effectiveValue = effective.hasOwnProperty(p.key) ? !!effective[p.key] : false;
                                    const overrideValue = hasOverride ? !!overrides[p.key] : effectiveValue;

                                    return (
                                      <div key={p.key} className="rounded-lg border bg-card p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <Checkbox
                                              checked={overrideValue}
                                              onCheckedChange={(v:any) => onOverrideToggle(p.key, !!v)}
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-sm font-medium truncate">{p.label}</div>
                                              <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                            {hasOverride ? (
                                              <Badge variant={overrideValue ? "default" : "destructive"}>
                                                {overrideValue ? "Override: Yes" : "Override: No"}
                                              </Badge>
                                            ) : (
                                              <Badge variant={effectiveValue ? "default" : "secondary"}>
                                                {effectiveValue ? "From Role" : "No Access"}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-6 h-full flex items-center justify-center text-center">
                  <div>
                    <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Select a User</h3>
                    <p className="text-sm text-muted-foreground">Choose a user from the left to manage their permissions</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
