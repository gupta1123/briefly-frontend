"use client";

import { 
  LayoutDashboard, 
  Folder, 
  PlusSquare 
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Moon, Sun, LogOut, MoreHorizontal } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';

const simpleOpsLinks = [
  { href: '/ops', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/ops/orgs', label: 'Organizations', Icon: Folder },
  { href: '/ops/new', label: 'Create Org', Icon: PlusSquare },
];

export default function SimpleOpsSidebar() {
  const { user, signOut } = useAuth();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();

  const toggleTheme = () => {
    const newDarkMode = !settings.dark_mode;
    void updateSettings({ dark_mode: newDarkMode });
  };

  return (
    <Sidebar variant="inset" collapsible="icon" className="sidebar-premium">
      <SidebarHeader>
        <div className="flex w-full items-center justify-between p-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <img src="/favicon.ico" alt="Briefly" className="h-8 w-8" />
            <Link href="/ops" className="text-xl font-semibold hover:underline group-data-[collapsible=icon]:hidden transition-colors hover:text-primary/80">
              Ops Console
            </Link>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <div className="px-2 py-4">
          <div className="space-y-1">
            {simpleOpsLinks.map(({ href, label, Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 hover-premium"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton 
                  size="lg" 
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 ring-2 ring-sidebar-border">
                    <AvatarImage src="https://placehold.co/40x40.png" data-ai-hint="person" />
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground font-semibold">
                      {user?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.username || user?.email?.split('@')[0] || 'User'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email || ''}
                    </span>
                  </div>
                  <MoreHorizontal className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="mb-2 w-64" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.username || user?.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                  {settings.dark_mode ? (
                    <>
                      <Sun className="mr-2 h-4 w-4" />
                      <span>Light Mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="mr-2 h-4 w-4" />
                      <span>Dark Mode</span>
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { 
                    signOut(); 
                    router.push('/signin'); 
                  }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}