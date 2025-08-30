"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Folder, MessageSquareText, CloudUpload, Activity } from 'lucide-react';
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
  { href: '/chat', label: 'AI Assistant', Icon: MessageSquareText, badge: 'AI' },
  { href: '/audit', label: 'Activity', Icon: Activity },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isManager = user?.role === 'systemAdmin' || user?.role === 'teamLead';
  const isAdmin = user?.role === 'systemAdmin';

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/80 font-medium">Main</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {links.slice(0, 4).map(({ href, label, Icon, badge }) => (
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
                {links.slice(4).filter(({ href }) => {
                  // Only show Activity (audit) link for systemAdmin, not teamLead
                  if (href === '/audit') {
                    return isAdmin;
                  }
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
