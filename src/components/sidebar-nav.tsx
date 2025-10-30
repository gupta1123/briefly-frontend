"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Folder, CloudUpload, Activity, Trash2, Wrench, PlusSquare } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarSeparator,
} from './ui/sidebar';

import { useAuth } from '@/hooks/use-auth';

const links = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/documents', label: 'Folders', Icon: Folder },
  { href: '/documents/upload', label: 'Upload Document', Icon: CloudUpload },
  { href: '/audit', label: 'Activity', Icon: Activity },
];

const adminLinks = [
  { href: '/recycle-bin', label: 'Recycle Bin', Icon: Trash2 },
  { href: '/chat', label: 'Chat Bot', Icon: Wrench },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isManager = user?.role === 'systemAdmin' || user?.role === 'teamLead';
  const isAdmin = user?.role === 'systemAdmin';
  const isOps = pathname?.startsWith('/ops');

  if (isOps) {
    const opsLinks = [
      { href: '/ops', label: 'Ops Overview', Icon: LayoutDashboard },
      { href: '/ops/orgs', label: 'Organizations', Icon: Folder },
      { href: '/ops/new', label: 'Create Org', Icon: PlusSquare },
      // Future: incidents, metrics, settings
      // { href: '/ops/incidents', label: 'Incidents', Icon: Activity },
    ];
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Ops</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {opsLinks.map(({ href, label, Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                  className="hover-premium focus-premium data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm"
                >
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Main</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {links.slice(0, 4).map(({ href, label, Icon, badge }: { href: string; label: string; Icon: any; badge?: string }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                  className="hover-premium focus-premium data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm"
                >
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {badge && (
                  <SidebarMenuBadge aria-hidden className="bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400 shadow-sm">
                    {badge}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {isManager && (
        <>
          <SidebarSeparator className="bg-sidebar-border/50" />
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(isAdmin ? adminLinks : links.slice(4)).filter(({ href }) => {
                  // Team leads should not see audit
                  if (!isAdmin && href === '/audit') return false;
                  return true;
                }).map(({ href, label, Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      tooltip={label}
                      className="hover-premium focus-premium data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm"
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </>
      )}


    </>
  );
}
