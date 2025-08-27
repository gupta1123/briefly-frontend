import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { DocumentsProvider } from '@/hooks/use-documents';
import { DepartmentsProvider } from '@/hooks/use-departments';
import { UsersProvider } from '@/hooks/use-users';
import { AuthProvider } from '@/hooks/use-auth';
import { AuditProvider } from '@/hooks/use-audit';
import { SecurityProvider } from '@/hooks/use-security';
import { SettingsProvider } from '@/hooks/use-settings';
import { DashboardStatsProvider } from '@/hooks/use-dashboard-stats';
import { CategoriesProvider } from '@/hooks/use-categories';
import ErrorBoundary from '@/components/error-boundary';

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
        <ErrorBoundary>
          <UsersProvider>
            <AuthProvider>
              <ErrorBoundary>
                <SettingsProvider>
                  <SecurityProvider>
                    <CategoriesProvider>
                      <AuditProvider>
                        <DashboardStatsProvider>
                          <DepartmentsProvider>
                            <ErrorBoundary>
                              <DocumentsProvider>{children}</DocumentsProvider>
                            </ErrorBoundary>
                          </DepartmentsProvider>
                        </DashboardStatsProvider>
                      </AuditProvider>
                    </CategoriesProvider>
                  </SecurityProvider>
                </SettingsProvider>
              </ErrorBoundary>
            </AuthProvider>
          </UsersProvider>
          <Toaster />
        </ErrorBoundary>
      </body>
    </html>
  );
}
