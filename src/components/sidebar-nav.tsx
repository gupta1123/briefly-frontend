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
import { useDocuments } from '@/hooks/use-documents';
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
  const { documents } = useDocuments();
  const { user } = useAuth();
  const isManager = user?.role === 'systemAdmin' || user?.role === 'contentManager';
  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Main</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {links.slice(0, 4).map(({ href, label, Icon, badge }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {href === '/documents' && (
                  <SidebarMenuBadge aria-hidden>{documents.length}</SidebarMenuBadge>
                )}
                {badge && (
                  <SidebarMenuBadge aria-hidden className="bg-emerald-500/20 text-emerald-600">
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
          <SidebarSeparator />
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.slice(4).map(({ href, label, Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
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
