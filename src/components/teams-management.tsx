"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Users } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Department = { 
  id: string; 
  org_id: string; 
  name: string; 
  lead_user_id?: string | null;
  member_count?: number;
  color?: string | null;
};

type OrgUser = { 
  userId: string; 
  displayName?: string | null; 
  email?: string | null;
};

const TEAM_COLORS = [
  { name: 'purple', class: 'bg-purple-500' },
  { name: 'blue', class: 'bg-blue-500' },
  { name: 'green', class: 'bg-green-500' },
  { name: 'orange', class: 'bg-orange-500' },
  { name: 'red', class: 'bg-red-500' },
  { name: 'pink', class: 'bg-pink-500' },
  { name: 'indigo', class: 'bg-indigo-500' },
  { name: 'teal', class: 'bg-teal-500' },
];

export default function TeamsManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'systemAdmin';
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('purple');
  const [orgUsers, setOrgUsers] = React.useState<OrgUser[]>([]);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editColor, setEditColor] = React.useState<string>('purple');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<{ userId: string; role: 'lead'|'member'; displayName?: string|null; email?: string|null }[]>([]);
  const [userQuery, setUserQuery] = React.useState('');
  const [pendingAddUserId, setPendingAddUserId] = React.useState<string>('');
  const [pendingAddRole, setPendingAddRole] = React.useState<'lead'|'member'>('member');
  const [currentUserId, setCurrentUserId] = React.useState<string>('');
  // Add user mode selection
  const [addUserMode, setAddUserMode] = React.useState<'existing' | 'invite' | null>(null);
  // Inline invite state for team leads/admins
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteName, setInviteName] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'member'|'guest'>('member');
  const [invitePassword, setInvitePassword] = React.useState('');
  const [inviting, setInviting] = React.useState(false);
  const { toast } = useToast();

  const refresh = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const list = await apiFetch<Department[]>(`/orgs/${orgId}/departments`);
      // Get member count for each department
      const departmentsWithCounts = await Promise.all(
        (list || []).map(async (dept) => {
          try {
            const members = await apiFetch<any[]>(`/orgs/${orgId}/departments/${dept.id}/users`);
            return { ...dept, member_count: members?.length || 0 };
          } catch {
            return { ...dept, member_count: 0 };
          }
        })
      );
      setDepartments(departmentsWithCounts);
      
      const users = await apiFetch<any[]>(`/orgs/${orgId}/users`);
      setOrgUsers((users || []).map(u => ({ 
        userId: u.userId, 
        displayName: u.displayName || u.app_users?.display_name || '', 
        email: u.email || '' 
      })));
    } finally { 
      setLoading(false); 
    }
  }, []);

  React.useEffect(() => { 
    void refresh(); 
  }, [refresh]);

  // Resolve current auth user id once for self-row checks
  React.useEffect(() => {
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const uid = sess?.data?.session?.user?.id || '';
        setCurrentUserId(uid);
      } catch {}
    })();
  }, []);

  const loadMembers = React.useCallback(async (deptId: string) => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    try {
      const rows = await apiFetch<any[]>(`/orgs/${orgId}/departments/${deptId}/users`);
      const mapped = (rows || []).map(r => ({ userId: r.userId, role: r.role, displayName: r.displayName, email: r.email }));
      setMembers(mapped);
      return mapped;
    } catch { return []; }
  }, []);

  React.useEffect(() => { if (selected) void loadMembers(selected); }, [selected, loadMembers]);

  const onCreate = async () => {
    const orgId = getApiContext().orgId || '';
    if (!newName.trim()) return;
    
    try {
      await apiFetch(`/orgs/${orgId}/departments`, { 
        method: 'POST', 
        body: { 
          name: newName.trim(),
          color: newColor 
        } 
      });
      setNewName('');
      setCreating(false);
      await refresh(); // Refresh to sync with server state
      toast({
        title: 'Team created',
        description: `Team "${newName.trim()}" has been created successfully.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error creating team',
        description: error.message || 'Failed to create team. Please try again.',
        variant: 'destructive' as any,
      });
    }
  };

  const onRename = async (dept: Department, name: string) => {
    const orgId = getApiContext().orgId || '';
    try {
      await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { 
        method: 'PATCH', 
        body: { name } 
      });
      setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name } : d));
      setEditing(null);
      await refresh(); // Refresh to sync with server state
      // Reload members if this team is currently selected
      if (selected === dept.id) {
        void loadMembers(selected);
      }
      toast({
        title: 'Team updated',
        description: `Team name has been updated to "${name}".`,
      });
    } catch (error: any) {
      toast({
        title: 'Error updating team',
        description: error.message || 'Failed to update team. Please try again.',
        variant: 'destructive' as any,
      });
    }
  };

  const onUpdate = async (dept: Department, name: string, color: string) => {
    const orgId = getApiContext().orgId || '';
    try {
      await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'PATCH', body: { name, color } });
      setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name, color } : d));
      setEditing(null);
      await refresh(); // Refresh to sync with server state
      // Reload members if this team is currently selected
      if (selected === dept.id) {
        void loadMembers(selected);
      }
      toast({ title: 'Team updated', description: 'Team details have been updated.' });
    } catch (error: any) {
      toast({ title: 'Error updating team', description: error.message || 'Failed to update team.', variant: 'destructive' as any });
    }
  };

  const onDelete = async (dept: Department) => {
    const orgId = getApiContext().orgId || '';
    try {
      await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'DELETE' });
      setDepartments(prev => prev.filter(d => d.id !== dept.id));
      setSelected(null); // Clear selected team if it was deleted
      setAddUserMode(null); // Reset add user mode
      await refresh(); // Refresh to sync with server state
      toast({
        title: 'Team deleted',
        description: `Team "${dept.name}" has been deleted.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error deleting team',
        description: error.message || 'Failed to delete team. Please try again.',
        variant: 'destructive' as any,
      });
    }
  };

  const startEdit = (dept: Department) => {
    setEditing(dept.id);
    setEditName(dept.name);
    setEditColor(dept.color || 'purple');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditName('');
  };

  const getTeamColor = (index: number) => {
    return TEAM_COLORS[index % TEAM_COLORS.length];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Teams</h2>
          <p className="text-sm text-muted-foreground">
            Create and organize teams for projects and departments.
          </p>
        </div>
        {isAdmin && (
          <Button 
            onClick={() => setCreating(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            + New Team
          </Button>
        )}
      </div>

      {/* Create New Team */}
      {isAdmin && creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Team Name</label>
                <Input
                  placeholder="Enter team name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onCreate()}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Team Color</label>
                <Select value={newColor} onValueChange={setNewColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_COLORS.map((color) => (
                      <SelectItem key={color.name} value={color.name}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${color.class}`} />
                          <span className="capitalize">{color.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={!newName.trim()}>
                Create Team
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Teams Grid */}
      {loading ? (
        <div className="text-center py-8">
          <div className="text-sm text-muted-foreground">Loading teams...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept, index) => {
            const color = getTeamColor(index);
            return (
              <Card key={dept.id} className="relative">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${color.class} flex items-center justify-center text-white font-semibold`}>
                        {dept.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{dept.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {dept.name === 'Core' ? 'Primary workspace team' :
                           dept.name === 'Growth' ? 'Marketing & Growth' :
                           dept.name === 'Ops' ? 'Operations & Support' :
                           'Team workspace'}
                        </p>
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{dept.member_count || 0} members</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {dept.name === 'General' ? (
                        <div className="text-xs text-muted-foreground px-2 py-1 bg-gray-100 rounded">
                          Default team for admin
                        </div>
                      ) : (
                        <>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(dept)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                            onClick={() => {
                              setSelected(dept.id);
                              setAddUserMode(null); // Reset mode when switching teams
                              void loadMembers(dept.id);
                            }}
                        title="Manage members"
                      >
                        <Users className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete team?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the "{dept.name}" team and remove all members. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(dept)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete Team
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Members panel */}
      {selected && departments.find(d => d.id === selected)?.name !== 'General' && (
        <Card>
          <CardHeader>
            <CardTitle>
              Team Members
              {(() => {
                const t = departments.find(d => d.id === selected);
                return t ? <span className="ml-2 text-sm text-muted-foreground">for <span className="font-medium">{t.name}</span></span> : null;
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add User Options */}
            {!addUserMode && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Add Team Member</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setAddUserMode('existing')}
                    className="h-auto p-4 flex flex-col items-center gap-2"
                  >
                    <Users className="w-6 h-6" />
                    <div className="text-center">
                      <div className="font-medium">Add Existing User</div>
                      <div className="text-xs text-muted-foreground">Select from organization members</div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setAddUserMode('invite')}
                    className="h-auto p-4 flex flex-col items-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <div className="text-center">
                      <div className="font-medium">Invite New User</div>
                      <div className="text-xs text-muted-foreground">Send invitation via email</div>
                    </div>
                  </Button>
                </div>
              </div>
            )}

            {/* Existing User Selection */}
            {addUserMode === 'existing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Add Existing User</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddUserMode(null);
                      setPendingAddUserId('');
                      setUserQuery('');
                    }}
                  >
                    Back
                  </Button>
                </div>
            <div className="flex gap-2 items-end">
              <Input 
                    placeholder="Search users..."
                className="w-48" 
                value={userQuery} 
                onChange={(e)=>setUserQuery(e.target.value)} 
              />
              <Select value={pendingAddUserId} onValueChange={setPendingAddUserId}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {orgUsers
                    .filter(u => !members.some(m => m.userId === u.userId))
                    .filter(u => (u.displayName || u.email || u.userId).toLowerCase().includes(userQuery.toLowerCase()))
                    .slice(0,50)
                    .map(u => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.displayName || u.email || u.userId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={pendingAddRole} onValueChange={(value: 'lead'|'member') => setPendingAddRole(value)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  {isAdmin && <SelectItem value="lead">Team Lead</SelectItem>}
                </SelectContent>
              </Select>
              <Button onClick={async ()=>{
                if (!pendingAddUserId) return;
                const orgId = getApiContext().orgId || '';
                try {
                  await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, { method: 'POST', body: { userId: pendingAddUserId, role: pendingAddRole } });
                  // Optimistic update
                  const added = orgUsers.find(u => u.userId === pendingAddUserId);
                  if (added) {
                    setMembers(prev => prev.some(m => m.userId === added.userId) ? prev : prev.concat([{ userId: added.userId, role: pendingAddRole, displayName: added.displayName, email: added.email }]));
                    setDepartments(prev => prev.map(d => d.id === selected ? { ...d, member_count: (d.member_count || 0) + 1 } : d));
                  }
                  setPendingAddUserId('');
                  setUserQuery('');
                      setAddUserMode(null);
                  // Ensure eventual consistency
                  void loadMembers(selected!);
                  try { window.dispatchEvent(new CustomEvent('org-users-changed')); } catch {}
                } catch {}
              }}>Add</Button>
            </div>
              </div>
            )}
            {/* Invite New User */}
            {addUserMode === 'invite' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Invite New User</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddUserMode(null);
                      setInviteEmail('');
                      setInviteName('');
                      setInvitePassword('');
                      setInviteRole('member');
                    }}
                  >
                    Back
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <Input 
                placeholder="Invite email"
                value={inviteEmail}
                onChange={(e)=>setInviteEmail(e.target.value)}
              />
              <Input 
                placeholder="Display name (optional)"
                value={inviteName}
                onChange={(e)=>setInviteName(e.target.value)}
              />
              <Input 
                placeholder="Password (optional)"
                value={invitePassword}
                onChange={(e)=>setInvitePassword(e.target.value)}
              />
              <Select value={inviteRole} onValueChange={(v: 'member'|'guest') => setInviteRole(v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
              <div className="md:col-span-2 flex gap-2 justify-end">
                <Button variant="outline" onClick={()=>{ setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('member'); }}>Clear</Button>
                <Button 
                  onClick={async ()=>{
                    const orgId = getApiContext().orgId || '';
                    if (!orgId || !inviteEmail.trim() || !selected) return;
                    setInviting(true);
                    try {
                      const resp: any = await apiFetch(`/orgs/${orgId}/users`, {
                        method: 'POST',
                        body: {
                          email: inviteEmail.trim(),
                          display_name: inviteName.trim() || undefined,
                          role: inviteRole,
                          password: invitePassword.trim() || undefined,
                        },
                      });
                      const userId = resp?.user_id || resp?.userId;
                      if (userId) {
                        await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, { method: 'POST', body: { userId, role: 'member' } });
                        setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('member');
                            setAddUserMode(null);
                        const updated = await loadMembers(selected);
                            setDepartments(prev => prev.map(d => d.id === selected ? { ...d, member_count: updated?.length || 0 } : d));
                        try { window.dispatchEvent(new CustomEvent('org-users-changed')); } catch {}
                        toast({ title: 'Invited', description: 'User invited and added to team.' });
                      }
                    } catch (e: any) {
                      toast({ title: 'Invite failed', description: e?.message || 'Could not invite user', variant: 'destructive' as any });
                    } finally { setInviting(false); }
                  }}
                  disabled={inviting || !inviteEmail.trim()}
                >Invite & Add</Button>
              </div>
            </div>
              </div>
            )}
            <div className="rounded-md border">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
                <div className="col-span-5">Name</div>
                <div className="col-span-4">Email</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {members.map(m => (
                <div key={m.userId} className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm border-b last:border-b-0">
                  <div className="col-span-5 truncate">{m.displayName || '—'}</div>
                  <div className="col-span-4 truncate text-muted-foreground">{m.email || '—'}</div>
                  <div className="col-span-2">
                    {m.userId === currentUserId ? (
                      // For self row: show fixed label; do not allow self-downgrade
                      <div className="text-xs px-2 py-1 rounded border inline-flex">
                        {m.role === 'lead' ? 'Team Lead' : 'Member'}
                      </div>
                    ) : (
                      <Select
                        value={m.role}
                        onValueChange={async (newRole: 'lead' | 'member') => {
                          const orgId = getApiContext().orgId || '';
                      try {
                          await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, { 
                            method: 'POST', 
                            body: { userId: m.userId, role: newRole } 
                          });
                          // Optimistic role update
                          setMembers(prev => prev.map(x => x.userId === m.userId ? { ...x, role: newRole } : x));
                          void loadMembers(selected);
                          toast({ 
                            title: 'Role updated', 
                            description: `${m.displayName || m.email} is now a ${newRole}.` 
                          });
                          } catch (error) {
                            toast({ 
                              title: 'Error', 
                              description: 'Failed to update role', 
                              variant: 'destructive' 
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          {isAdmin && <SelectItem value="lead">Team Lead</SelectItem>}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="col-span-1 text-right">
                    <Button size="sm" variant="outline" onClick={async ()=>{
                      const orgId = getApiContext().orgId || '';
                      await apiFetch(`/orgs/${orgId}/departments/${selected}/users/${m.userId}`, { method: 'DELETE' });
                      // Optimistic remove
                      setMembers(prev => prev.filter(x => x.userId !== m.userId));
                      setDepartments(prev => prev.map(d => d.id === selected ? { ...d, member_count: Math.max(0, (d.member_count || 1) - 1) } : d));
                      void loadMembers(selected!);
                      try { window.dispatchEvent(new CustomEvent('org-users-changed')); } catch {}
                    }}>Remove</Button>
                  </div>
                </div>
              ))}
              {members.length === 0 && <div className="p-3 text-xs text-muted-foreground">No members yet.</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Team Modal */}
      {editing && (
        <AlertDialog open={!!editing} onOpenChange={(open)=>{ if(!open) cancelEdit(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Team</AlertDialogTitle>
              <AlertDialogDescription>Update the team name and color.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <label className="text-sm font-medium">Team Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && onRename(departments.find(d => d.id === editing)!, editName)}
              />
              <div>
                <label className="text-sm font-medium">Team Color</label>
                <Select value={editColor} onValueChange={setEditColor}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_COLORS.map((color) => (
                      <SelectItem key={color.name} value={color.name}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${color.class}`} />
                          <span className="capitalize">{color.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelEdit}>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button onClick={() => onUpdate(departments.find(d => d.id === editing)!, editName, editColor)} disabled={!editName.trim()}>Save Changes</Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!loading && departments.length === 0 && (
        <div className="text-center py-8">
          <div className="text-sm text-muted-foreground">No teams created yet. Create your first team to get started.</div>
        </div>
      )}
    </div>
  );
}
