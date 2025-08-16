"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DATE_FORMAT_STORAGE_KEY, formatAppDateTime } from '@/lib/utils';
import { useSettings } from '@/hooks/use-settings';
import { useAuth } from '@/hooks/use-auth';
import { useUsers } from '@/hooks/use-users';
import { useEffect } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useSecurity } from '@/hooks/use-security';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import CategoriesManagement from '@/components/categories-management';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'systemAdmin';
  const { isAuthenticated } = useAuth();
  const { users, addUser, removeUser, updateUser } = useUsers();
  const { toast } = useToast();
  // Load org users from backend for admin/manager visibility
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const orgId = getApiContext().orgId || '';
        if (!orgId) return;
        const list = await apiFetch<any[]>(`/orgs/${orgId}/users`);
        // Replace local list with authoritative server rows for display purposes
        // Map to the directory shape while keeping real values for table
        const mapped = list.map(u => ({
          username: u.userId, // keep true id to address DELETE /users/:userId
          displayName: u.displayName || u.app_users?.display_name || '',
          email: u.email || '',
          role: (u.role === 'orgAdmin' ? 'systemAdmin' : u.role),
          password: '',
          expiresAt: u.expires_at || undefined,
        }));
        // Reset then add
        mapped.forEach(m => addUser(m));
      } catch {}
    })();
  }, [addUser, isAuthenticated]);

  // Load organization settings including categories
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    (async () => {
      try {
        const orgId = getApiContext().orgId || '';
        if (!orgId) return;
        const orgSettings = await apiFetch<any>(`/orgs/${orgId}/settings`);
        setCategories(orgSettings.categories || []);
      } catch {}
    })();
  }, [isAuthenticated, isAdmin]);
  const { policy, setEnabled, addIp, removeIp, replaceIps, getCurrentIp } = useSecurity();
  const { settings, updateSettings } = useSettings();
  const [color, setColor] = React.useState<string>('default');
  const [uiScale, setUiScale] = React.useState<'sm' | 'md' | 'lg'>('md');

  const applyColor = (value: string) => {
    setColor(value);
    updateSettings({ accent_color: value });
  };

  const onToggleDarkMode = (enabled: boolean) => {
    updateSettings({ dark_mode: enabled });
  };

  const [chatFiltersEnabled, setChatFiltersEnabled] = React.useState<boolean>(false);
  const [categories, setCategories] = React.useState<string[]>([]);
  
  const applyChatFilters = (v: boolean) => {
    setChatFiltersEnabled(v);
    updateSettings({ chat_filters_enabled: v });
  };

  React.useEffect(() => {
    setColor(settings.accent_color);
    setChatFiltersEnabled(!!settings.chat_filters_enabled);
    setUiScale((settings.ui_scale as any) || 'md');
  }, [settings]);

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Appearance, chat, and access controls"
          sticky
          icon={<SettingsIcon className="h-5 w-5" />}
        />
        <div className="px-4 md:px-6">
        <Tabs defaultValue="appearance" className="space-y-6">
        <TabsList>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          {isAdmin && <TabsTrigger value="categories">Categories</TabsTrigger>}
          {isAdmin && <TabsTrigger value="access">Network</TabsTrigger>}
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="appearance">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <p className="text-sm text-muted-foreground">Personalize the interface to your preference. Changes apply immediately.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm mb-2 block">Interface Size</label>
                      <div className="flex items-center gap-2">
                        {(['sm','md','lg'] as const).map(s => (
                          <Button key={s} variant={uiScale === s ? 'default' : 'outline'} size="sm" onClick={() => { setUiScale(s); updateSettings({ ui_scale: s }); }}>
                            {s === 'sm' ? 'Compact' : s === 'md' ? 'Comfort' : 'Roomy'}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Adjust global text size and control heights.</p>
                    </div>
              <div>
                <label className="text-sm mb-2 block">Accent Color</label>
                <Select value={color} onValueChange={applyColor}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                    <SelectItem value="rose">Rose</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                    <SelectItem value="amber">Amber</SelectItem>
                    <SelectItem value="yellow">Yellow</SelectItem>
                    <SelectItem value="lime">Lime</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="emerald">Emerald</SelectItem>
                    <SelectItem value="teal">Teal</SelectItem>
                    <SelectItem value="cyan">Cyan</SelectItem>
                    <SelectItem value="sky">Sky</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="indigo">Indigo</SelectItem>
                    <SelectItem value="violet">Violet</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                    <SelectItem value="fuchsia">Fuchsia</SelectItem>
                    <SelectItem value="pink">Pink</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">Used for highlights, buttons, and interactive elements.</p>
              </div>
              <div>
                <label className="text-sm mb-2 block">Theme</label>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">Dark mode</div>
                    <div className="text-xs text-muted-foreground">Dim the UI and reduce glare for low‑light environments.</div>
                  </div>
                  <Switch checked={!!settings.dark_mode} onCheckedChange={onToggleDarkMode} />
                </div>
              </div>
              <div>
                <label className="text-sm mb-2 block">Date Format</label>
                <Select value={settings.date_format} onValueChange={(v) => { updateSettings({ date_format: v }); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="d MMM yyyy">12 Jan 2025</SelectItem>
                    <SelectItem value="yyyy-MM-dd">2025-01-12</SelectItem>
                    <SelectItem value="MM/dd/yyyy">01/12/2025</SelectItem>
                    <SelectItem value="d.M.yyyy">12.1.2025</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">Affects how dates are shown across the app.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="chat">
        <Card>
          <CardHeader>
            <CardTitle>Chat</CardTitle>
            <p className="text-sm text-muted-foreground">Tune the assistant experience.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">Slash filters</div>
                <div className="text-xs text-muted-foreground">Enable /folder and /sender|/receiver suggestions in chat.</div>
              </div>
              <Switch checked={chatFiltersEnabled} onCheckedChange={(v) => applyChatFilters(!!v)} />
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {isAdmin && (
        <TabsContent value="categories">
          <CategoriesManagement 
            categories={categories}
            onCategoriesChange={setCategories}
          />
        </TabsContent>
        )}

        {isAdmin && (
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AdminUsersPanel />
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {isAdmin && (
        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle>Network Access (IP Allowlist)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="text-sm">
                  <div className="font-medium">Allowlist</div>
                  <div className="text-xs text-muted-foreground">When enabled, only listed IPs can sign in. Administrators bypass this check.</div>
                </div>
                <Switch checked={policy.enabled} onCheckedChange={(v) => setEnabled(!!v)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Allowed IPs</div>
                <div className="flex gap-2">
                  <Input id="ipAdd" placeholder="e.g., 203.0.113.10" />
                  <Button onClick={() => {
                    const el = document.getElementById('ipAdd') as HTMLInputElement | null;
                    if (!el) return;
                    const v = el.value.trim();
                    if (!v) return;
                    addIp(v);
                    el.value = '';
                  }}>Add</Button>
                  <Button variant="outline" onClick={async () => {
                    const ip = await getCurrentIp();
                    if (ip) addIp(ip);
                  }}>Add My IP</Button>
                </div>
                <div className="rounded-md border divide-y">
                  {policy.ips.map(ip => (
                    <div key={ip} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-mono">{ip}</span>
                      <Button size="sm" variant="outline" onClick={() => removeIp(ip)}>Remove</Button>
                    </div>
                  ))}
                  {policy.ips.length === 0 && <div className="p-3 text-xs text-muted-foreground">No IPs added.</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
        </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}

function AdminUsersPanel() {
  const { users, addUser, removeUser, updateUser } = useUsers();
  const [form, setForm] = React.useState({ username: '', email: '', role: 'contentViewer', password: '', amount: 3, unit: 'days' as 'minutes' | 'hours' | 'days' });
  const onCreate = async () => {
    const username = form.username.trim();
    if (!username) return;
    if (form.password && form.password.length < 6) {
      toast({ title: 'Password too short', description: 'Password must be at least 6 characters.', variant: 'destructive' as any });
      return;
    }
    const ms = form.unit === 'minutes' ? form.amount*60*1000 : form.unit === 'hours' ? form.amount*60*60*1000 : form.amount*24*60*60*1000;
    const expiresAt = form.role === 'guest' ? new Date(Date.now() + ms).toISOString() : undefined;
    // Call backend invite endpoint first; only add to list on success
    try {
      const orgId = getApiContext().orgId || '';
      if (form.email.trim() && orgId) {
        await apiFetch(`/orgs/${orgId}/users`, {
          method: 'POST',
          body: {
            email: form.email.trim(),
            display_name: form.username.trim() || undefined,
            role: form.role === 'systemAdmin' ? 'orgAdmin' : form.role,
            expires_at: expiresAt,
            password: form.password ? form.password : undefined,
          },
        });
        addUser({ username, email: form.email.trim(), role: form.role as any, password: form.password || 'Temp#1234', expiresAt });
      }
    } catch (e: any) {
      const msg = (e as Error)?.message?.replace(/^API.*failed:\s*/, '') || 'Failed to create user';
      toast({ title: 'Could not create user', description: msg, variant: 'destructive' as any });
      return; // Don't clear the form on failure
    }
    setForm({ username: '', email: '', role: 'contentViewer', password: '', amount: 3, unit: 'days' });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <Input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="systemAdmin">System Administrator</SelectItem>
            <SelectItem value="contentManager">Content Manager</SelectItem>
            <SelectItem value="contentViewer">Content Viewer</SelectItem>
            <SelectItem value="guest">Guest (Temp)</SelectItem>
          </SelectContent>
        </Select>
        <div>
          <Input placeholder="Password (optional, min 6)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {form.password && form.password.length < 6 && (
            <p className="text-[11px] text-destructive mt-1">Minimum 6 characters.</p>
          )}
        </div>
        {form.role === 'guest' ? (
          <div className="flex gap-2 items-center">
            <Input type="number" min={1} className="w-20" placeholder="Qty" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v as any })}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={onCreate} disabled={!!form.password && form.password.length < 6}>Create</Button>
          </div>
        ) : (
        <div className="flex gap-2 items-center">
            <Button onClick={onCreate} disabled={!!form.password && form.password.length < 6}>Create</Button>
        </div>
        )}
      </div>
      <div className="rounded-md border">
        <div className="grid grid-cols-6 text-xs font-semibold p-2"><div>Name</div><div>Email</div><div>Role</div><div>Expires</div><div className='col-span-2 text-right'>Actions</div></div>
        {users.map(u => (
          <div key={u.username} className="grid grid-cols-6 items-center p-2 border-t text-sm">
            <div className="truncate" title={u.displayName || u.username}>{u.displayName || u.username.slice(0,8)}</div>
            <div className="truncate" title={u.email || ''}>{u.email || '—'}</div>
            <div><Badge variant="outline">{u.role === 'systemAdmin' ? 'Admin' : u.role === 'contentManager' ? 'Manager' : u.role === 'contentViewer' ? 'Viewer' : 'Guest'}</Badge></div>
            <div>{u.expiresAt ? formatAppDateTime(new Date(u.expiresAt)) : '—'}</div>
            <div className="col-span-2 flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => updateUser(u.username, prev => ({ ...prev, role: prev.role === 'contentViewer' ? 'contentManager' : 'contentViewer' }))}>Toggle Role</Button>
              <Button size="sm" variant="destructive" onClick={async () => {
                try {
                  const orgId = getApiContext().orgId || '';
                  if (orgId) {
                    // Backend delete (requires admin)
                    await apiFetch(`/orgs/${orgId}/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
                  }
                } catch {}
                removeUser(u.username);
              }}>Delete</Button>
            </div>
          </div>
        ))}
        {users.length === 0 && <div className="p-4 text-xs text-muted-foreground">No users yet. Create one above.</div>}
      </div>
    </div>
  );
}


