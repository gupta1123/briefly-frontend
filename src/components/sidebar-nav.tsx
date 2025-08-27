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
import { useDepartments } from '@/hooks/use-departments';
import { Badge } from '@/components/ui/badge';

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
  const { departments, selectedDepartmentId } = useDepartments();
  const isManager = user?.role === 'systemAdmin' || user?.role === 'teamLead';

  const roleLabel = (r?: string) => {
    switch ((r || '').toLowerCase()) {
      case 'systemadmin': return 'Admin';
      case 'teamlead': return 'Team Lead';
      case 'member': return 'Member';
      case 'guest': return 'Guest';
      default: return r || '';
    }
  };
  const team = departments.find(d => d.id === selectedDepartmentId) || null;

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

      {/* Identity summary at bottom (below user section area) */}
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-3 py-2 flex items-center gap-2 text-xs">
            <Badge variant="outline">{roleLabel(user?.role)}</Badge>
            {team && (
              <Badge variant="outline" data-color={team.color || 'default'} className="capitalize">{team.name}</Badge>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
