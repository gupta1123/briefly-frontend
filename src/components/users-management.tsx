"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Mail, Trash2, Lock } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useUsers } from '@/hooks/use-users';
import { useEffect } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

function UserSkeleton() {
  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="ml-4 space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-8 w-16" />
      </td>
    </tr>
  );
}

export default function UsersManagement() {
  const { users, addUser, removeUser, updateUser } = useUsers();
  const { toast } = useToast();
  const { hasRoleAtLeast, bootstrapData } = useAuth();
  const isAdmin = hasRoleAtLeast('systemAdmin');
  const isTeamLead = hasRoleAtLeast('teamLead');
  const [form, setForm] = React.useState({
    username: '',
    email: '',
    role: 'member',
    password: ''
  });
  const [inviting, setInviting] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [orgUsers, setOrgUsers] = React.useState<any[]>([]);

  // Password change modal state
  const [passwordModal, setPasswordModal] = React.useState<{
    isOpen: boolean;
    user: any;
  }>({ isOpen: false, user: null });
  const [passwordForm, setPasswordForm] = React.useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [changingPassword, setChangingPassword] = React.useState(false);

  // Note: Backend already filters users for team leads, no frontend filtering needed

  // Load org users from backend for admin/manager visibility
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const orgId = getApiContext().orgId || '';
        if (!orgId) {
          setLoading(false);
          return;
        }
        const list = await apiFetch<any[]>(`/orgs/${orgId}/users`);
        setOrgUsers(list || []);

        // The backend already filters users for team leads, so no additional filtering needed
        const filteredList = list;

        // Map to the directory shape while keeping real values for table
        const mapped = filteredList.map(u => ({
          username: u.userId, // keep true id to address DELETE /users/:userId
          displayName: u.displayName || u.app_users?.display_name || '',
          email: u.email || '',
          role: (u.role === 'orgAdmin' ? 'systemAdmin' : u.role),
          password: '',
          expiresAt: u.expires_at || undefined,
          departments: Array.isArray(u.departments) ? u.departments : [],
        }));
        // Reset then add
        mapped.forEach(m => addUser(m));
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [addUser]);

  // Listen for team membership changes to refresh team badges
  useEffect(() => {
    const onChanged = () => { void refreshUsers(); };
    window.addEventListener('org-users-changed', onChanged);
    return () => window.removeEventListener('org-users-changed', onChanged);
  }, []);

  const refreshUsers = async () => {
    try {
      const orgId = getApiContext().orgId || '';
      if (!orgId) return;
      const list = await apiFetch<any[]>(`/orgs/${orgId}/users`);

      // The backend already filters users for team leads, so no additional filtering needed
      const filteredList = list;

      const mapped = filteredList.map(u => ({
        username: u.userId,
        displayName: u.displayName || u.app_users?.display_name || '',
        email: u.email || '',
        role: (u.role === 'orgAdmin' ? 'systemAdmin' : u.role),
        password: '',
        expiresAt: u.expires_at || undefined,
      }));
      mapped.forEach((m) => {
        const existing = users.find(x => x.username === m.username);
        if (!existing) addUser(m);
        else updateUser(m.username, () => m);
      });
    } catch {}
  };

  const onCreate = async () => {
    const username = form.username.trim();
    if (!username) return;
    if (form.password && form.password.length < 6) {
      toast({ 
        title: 'Password too short', 
        description: 'Password must be at least 6 characters.', 
        variant: 'destructive' as any 
      });
      return;
    }
    // Call backend invite endpoint first; only add to list on success
    try {
      const orgId = getApiContext().orgId || '';
      if (form.email.trim() && orgId) {
        const resp: any = await apiFetch(`/orgs/${orgId}/users`, {
          method: 'POST',
          body: {
            email: form.email.trim(),
            display_name: form.username.trim() || undefined,
            role: form.role,
            password: form.password ? form.password : undefined,
          },
        });
        // Use authoritative user_id from server to avoid duplicate phantom rows
        const userId = resp?.user_id || resp?.userId || null;
        addUser({
          username: userId || username,
          displayName: form.username.trim(),
          email: form.email.trim(),
          role: form.role as any,
          password: form.password || 'Temp#1234',
        });

        toast({
          title: 'User invited',
          description: `${form.email.trim()} has been invited to the organization.`,
        });

        setForm({ username: '', email: '', role: 'member', password: '' });
        setInviting(false);
        // Refresh users to pull authoritative display names from server for pickers
        await refreshUsers();
      }
    } catch (e: any) {
      const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to create user';
      toast({
        title: 'Could not create user',
        description: msg,
        variant: 'destructive' as any
      });
      return; // Don't clear the form on failure
    }
  };

  const onChangePassword = async () => {
    if (!passwordModal.user) return;

    const { newPassword, confirmPassword } = passwordForm;

    // Validation
    if (!newPassword.trim()) {
      toast({
        title: 'Password required',
        description: 'Please enter a new password.',
        variant: 'destructive' as any
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive' as any
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both password fields match.',
        variant: 'destructive' as any
      });
      return;
    }

    try {
      setChangingPassword(true);
      const orgId = getApiContext().orgId || '';
      if (!orgId) throw new Error('Organization context not found');

      await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(passwordModal.user.username)}`, {
        method: 'PATCH',
        body: { password: newPassword },
      });

      toast({
        title: 'Password updated',
        description: `Password for ${passwordModal.user.email || passwordModal.user.username} has been changed successfully.`,
      });

      // Reset form and close modal
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setPasswordModal({ isOpen: false, user: null });

    } catch (e: any) {
      const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to change password';
      toast({
        title: 'Could not change password',
        description: msg,
        variant: 'destructive' as any
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'systemAdmin': return 'System Administrator';
      case 'teamLead': return 'Team Lead';
      case 'member': return 'Member';
      default: return role;
    }
  };

  const getRoleColor = (role: string) => {
    const roleLower = role.toLowerCase();
    switch (true) {
      case roleLower.includes('admin') || roleLower === 'systemadmin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case roleLower.includes('teamlead') || roleLower.includes('team lead') || roleLower === 'teamlead':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case roleLower.includes('member') || roleLower === 'member':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case roleLower.includes('manager') || roleLower === 'manager':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400';
      case roleLower.includes('viewer') || roleLower === 'viewer':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getTeamBadges = (user: any) => {
    const depts = Array.isArray(user.departments) ? user.departments : [];
    return depts.slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team Members</h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Invite people and assign roles per team."
              : "View members of your teams."
            }
          </p>
        </div>
        {isAdmin && (
          <Button 
            onClick={() => setInviting(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Mail className="w-4 h-4 mr-2" />
            Invite
          </Button>
        )}
      </div>

      {/* Invite User Form */}
      {isAdmin && inviting && (
        <Card>
          <CardHeader>
            <CardTitle>Invite New User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                  placeholder="Username" 
                  value={form.username} 
                  onChange={(e) => setForm({ ...form, username: e.target.value })} 
                />
                <Input 
                  placeholder="Email" 
                  value={form.email} 
                  onChange={(e) => setForm({ ...form, email: e.target.value })} 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {isAdmin && <SelectItem value="teamLead">Team Lead</SelectItem>}
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  placeholder="Password (optional, min 6)" 
                  value={form.password} 
                  onChange={(e) => setForm({ ...form, password: e.target.value })} 
                />
              </div>
              {form.password && form.password.length < 6 && (
                <p className="text-[11px] text-destructive">Minimum 6 characters.</p>
              )}
              <div className="flex justify-end">
                <Button onClick={onCreate} disabled={!!form.password && form.password.length < 6}>
                  Create
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setInviting(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-sm">Name</th>
                  <th className="text-left p-4 font-medium text-sm">Email</th>
                  <th className="text-left p-4 font-medium text-sm">Teams</th>
                  <th className="text-left p-4 font-medium text-sm">Role</th>
                  <th className="text-right p-4 font-medium text-sm">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Show skeleton loaders while loading
                  <>
                    <UserSkeleton />
                    <UserSkeleton />
                    <UserSkeleton />
                    <UserSkeleton />
                    <UserSkeleton />
                  </>
                ) : (
                  users.map(u => (
                  <tr key={u.username} className="border-b">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-medium">
                          {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{u.displayName || u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {u.email || '—'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {getTeamBadges(u).map((d: any) => (
                          <Badge key={d.id} variant="secondary" className="capitalize" data-color={d.color || 'default'}>
                            {d.name}
                          </Badge>
                        ))}
                        {Array.isArray(u.departments) && u.departments.length > 2 && (
                          <span className="text-xs text-muted-foreground">+{u.departments.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {(isAdmin || isTeamLead) ? (
                        <Select
                          value={u.role as any}
                          onValueChange={async (v) => {
                            try {
                              const orgId = getApiContext().orgId || '';
                              if (orgId) {
                                await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, {
                                  method: 'PATCH',
                                  body: { role: v === 'systemAdmin' ? 'orgAdmin' : v },
                                });
                              }
                              updateUser(u.username, prev => ({ ...prev, role: v as any }));
                              toast({ 
                                title: 'Role updated', 
                                description: `${u.email || u.username} is now ${getRoleLabel(v)}.` 
                              });
                            } catch (e: any) {
                              const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to update role';
                              toast({ 
                                title: 'Could not update role', 
                                description: msg, 
                                variant: 'destructive' as any 
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-[140px]" disabled={u.role === 'systemAdmin'}>
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Only true system admins can create system administrators */}
                            {/* Org admins cannot promote others to system admin */}
                            {isAdmin && <SelectItem value="teamLead">Team Lead</SelectItem>}
                            <SelectItem value="member">Member</SelectItem>
                            {/* Guest role not allowed for existing users */}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-sm">{getRoleLabel(u.role as any)}</div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Change Password Button */}
                        {(isAdmin || isTeamLead) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => setPasswordModal({ isOpen: true, user: u })}
                            disabled={u.role === 'systemAdmin' && u.username !== bootstrapData?.user?.id}
                          >
                            <Lock className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Delete Button */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              disabled={
                                (u.role === 'systemAdmin') ||
                                (!isAdmin && !isTeamLead) ||
                                (u.username === bootstrapData?.user?.id) // Cannot delete self
                              }
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove user from organization?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke access for {u.email || u.username}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={u.role === 'systemAdmin'}
                                  onClick={async () => {
                                    try {
                                      const orgId = getApiContext().orgId || '';
                                      if (orgId) await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
                                    } catch {}
                                    removeUser(u.username);
                                    toast({
                                      title: 'User removed',
                                      description: `${u.email || u.username} no longer has access.`
                                    });
                                  }}
                                >
                                  Delete
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden">
            {loading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-6 w-16" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No users yet. Invite your first team member to get started.
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {users.map(u => (
                  <div key={u.username} className="border rounded-lg p-4 space-y-3">
                    {/* User Info */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-medium">
                        {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{u.displayName || u.username}</div>
                        <div className="text-sm text-muted-foreground truncate">{u.email || '—'}</div>
                      </div>
                    </div>

                    {/* Teams */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {getTeamBadges(u).map((d: any) => (
                        <Badge key={d.id} variant="secondary" className="capitalize text-xs" data-color={d.color || 'default'}>
                          {d.name}
                        </Badge>
                      ))}
                      {Array.isArray(u.departments) && u.departments.length > 2 && (
                        <span className="text-xs text-muted-foreground">+{u.departments.length - 2}</span>
                      )}
                    </div>

                    {/* Role and Actions */}
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        {isAdmin ? (
                          <Select
                            value={u.role as any}
                            onValueChange={async (v) => {
                              try {
                                const orgId = getApiContext().orgId || '';
                                if (orgId) {
                                  await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, {
                                    method: 'PATCH',
                                    body: { role: v === 'systemAdmin' ? 'orgAdmin' : v },
                                  });
                                }
                                updateUser(u.username, prev => ({ ...prev, role: v as any }));
                                toast({ 
                                  title: 'Role updated', 
                                  description: `${u.email || u.username} is now ${getRoleLabel(v)}.` 
                                });
                              } catch (e: any) {
                                const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to update role';
                                toast({ 
                                  title: 'Could not update role', 
                                  description: msg, 
                                  variant: 'destructive' as any 
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="w-[120px]" disabled={u.role === 'systemAdmin'}>
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Only true system admins can create system administrators */}
                              {/* Org admins cannot promote others to system admin */}
                              {isAdmin && <SelectItem value="teamLead">Team Lead</SelectItem>}
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm font-medium">{getRoleLabel(u.role as any)}</div>
                        )}
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        {/* Change Password Button */}
                        {(isAdmin || isTeamLead) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700 h-8 w-8 p-0"
                            onClick={() => setPasswordModal({ isOpen: true, user: u })}
                            disabled={u.role === 'systemAdmin' && u.username !== bootstrapData?.user?.id}
                          >
                            <Lock className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Delete Button */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-600 hover:text-red-700 h-8 w-8 p-0" 
                              disabled={!isAdmin || u.role === 'systemAdmin'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove user from organization?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke access for {u.email || u.username}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={u.role === 'systemAdmin'}
                                  onClick={async () => {
                                    try {
                                      const orgId = getApiContext().orgId || '';
                                      if (orgId) await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
                                    } catch {}
                                    removeUser(u.username);
                                    toast({
                                      title: 'User removed',
                                      description: `${u.email || u.username} no longer has access.`
                                    });
                                  }}
                                >
                                  Delete
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Password Modal */}
      <Dialog
        open={passwordModal.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordModal({ isOpen: false, user: null });
            setPasswordForm({ newPassword: '', confirmPassword: '' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Change the password for {passwordModal.user?.email || passwordModal.user?.username}.
              The user will need to use this new password to sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                placeholder="Enter new password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="mt-1"
              />
              {passwordForm.newPassword && passwordForm.newPassword.length < 6 && (
                <p className="text-[11px] text-destructive mt-1">Minimum 6 characters.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Confirm Password</label>
              <Input
                type="password"
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="mt-1"
              />
              {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="text-[11px] text-destructive mt-1">Passwords do not match.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordModal({ isOpen: false, user: null });
                setPasswordForm({ newPassword: '', confirmPassword: '' });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={onChangePassword}
              disabled={
                changingPassword ||
                !passwordForm.newPassword.trim() ||
                !passwordForm.confirmPassword.trim() ||
                passwordForm.newPassword !== passwordForm.confirmPassword ||
                passwordForm.newPassword.length < 6
              }
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
