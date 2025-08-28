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

import { useEffect } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useSecurity } from '@/hooks/use-security';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import CategoriesManagement from '@/components/categories-management';
import RolesManagement from '@/components/roles-management';
import TeamsManagement from '@/components/teams-management';
import UsersManagement from '@/components/users-management';
import OverridesManagement from '@/components/overrides-management';
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

const ACCENT_COLORS = [
  'default','red','rose','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink'
];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'systemAdmin';
  const isTeamLead = user?.role === 'teamLead';
  const { isAuthenticated } = useAuth();

  const { toast } = useToast();


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
          <TabsTrigger value="appearance">Personal</TabsTrigger>
          <TabsTrigger value="general">Organization</TabsTrigger>
          {(isAdmin || isTeamLead) && <TabsTrigger value="teams">Teams</TabsTrigger>}
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          {isAdmin && <TabsTrigger value="roles">Access</TabsTrigger>}
          {isAdmin && <TabsTrigger value="security">Security</TabsTrigger>}
        </TabsList>

        <TabsContent value="general">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Organization <Badge variant="outline">Org‑wide</Badge></CardTitle>
            <p className="text-sm text-muted-foreground">Basics and content preferences for your organization.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <CategoriesManagement 
              categories={categories}
              onCategoriesChange={setCategories}
            />
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="appearance">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Appearance <Badge variant="outline">Personal</Badge></CardTitle>
            <p className="text-sm text-muted-foreground">Personalize the interface. Changes apply immediately for you only.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                <div className="grid grid-cols-8 gap-2">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => applyColor(c)}
                      className={`h-7 w-7 rounded-full border ${color===c? 'ring-2 ring-ring': ''}`}
                      title={c}
                      style={{ background: 'hsl(var(--primary))' }}
                      data-color={c}
                    />
                  ))}
                </div>
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
              <div className="lg:col-span-2">
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
                <p className="text-xs text-muted-foreground mt-2">Affects how dates are shown across the app. Sample: <span className="font-mono">{formatAppDateTime(new Date())}</span></p>
              </div>
              {/* Preview section removed per requirement */}
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="teams">
          <TeamsManagement />
        </TabsContent>

        <TabsContent value="users">
          <UsersManagement />
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <p className="text-sm text-muted-foreground">Define granular permissions for your organization.</p>
            </CardHeader>
            <CardContent>
              <RolesManagement />
            </CardContent>
          </Card>
          <div className="mt-4" />
          <Card>
            <CardHeader>
              <CardTitle>Advanced: Per‑user Overrides</CardTitle>
              <p className="text-sm text-muted-foreground">Override permissions for a specific user across the organization or within a team. Use sparingly.</p>
            </CardHeader>
            <CardContent>
              <OverridesManagement />
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">IP Allowlist <Badge variant="outline">Org‑wide</Badge></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="text-sm">
                  <div className="font-medium">Enforce allowlist</div>
                  <div className="text-xs text-muted-foreground">Only listed IPs can access the org endpoints when enabled.</div>
                </div>
                <Switch checked={policy.enabled} onCheckedChange={(v) => setEnabled(!!v)} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Allowed IPs</div>
                <div className="flex gap-2 flex-wrap items-end">
                  <Input id="ipAdd2" placeholder="e.g., 203.0.113.10" className="w-64" />
                  <Button onClick={() => {
                    const el = document.getElementById('ipAdd2') as HTMLInputElement | null;
                    if (!el) return;
                    const v = el.value.trim();
                    if (!v) return;
                    addIp(v);
                    el.value = '';
                  }}>Add</Button>
                  <Button variant="outline" onClick={async () => {
                    const ip = await getCurrentIp();
                    if (ip) addIp(ip);
                  }}>Use my IP</Button>
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
                <div className="pt-2">
                  <label className="text-xs text-muted-foreground">Bulk replace (one per line)</label>
                  <textarea className="mt-1 w-full rounded-md border bg-background p-2 text-sm" rows={4} placeholder="203.0.113.5\n2001:db8::1" id="bulk-ips-settings" />
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="outline" onClick={()=>{
                      const ta = document.getElementById('bulk-ips-settings') as HTMLTextAreaElement | null;
                      if (!ta) return;
                      const ips = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
                      replaceIps(ips);
                    }}>Replace</Button>
                    <p className="text-xs text-muted-foreground">This overwrites the list above.</p>
                  </div>
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
