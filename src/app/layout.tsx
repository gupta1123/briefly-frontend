import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { DocumentsProvider } from '@/hooks/use-documents';
import { UsersProvider } from '@/hooks/use-users';
import { AuthProvider } from '@/hooks/use-auth';
import { AuditProvider } from '@/hooks/use-audit';
import { SecurityProvider } from '@/hooks/use-security';
import { SettingsProvider } from '@/hooks/use-settings';
import { DashboardStatsProvider } from '@/hooks/use-dashboard-stats';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Briefly',
  description: 'Briefly · Intelligent Document Management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable
        )}
      >
        <UsersProvider>
          <AuthProvider>
            <SettingsProvider>
              <SecurityProvider>
                <AuditProvider>
                  <DashboardStatsProvider>
                    <DocumentsProvider>{children}</DocumentsProvider>
                  </DashboardStatsProvider>
                </AuditProvider>
              </SecurityProvider>
            </SettingsProvider>
          </AuthProvider>
        </UsersProvider>
        <Toaster />
      </body>
    </html>
  );
}
