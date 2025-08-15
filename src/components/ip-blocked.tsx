"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, RefreshCw, ExternalLink } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';

type IpCheckResult = {
  clientIp: string;
  allowed: boolean;
  reason: string;
  userRole: string;
  orgId: string;
};

export function IpBlockedPage() {
  const [ipInfo, setIpInfo] = useState<IpCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const checkIpAccess = async () => {
    try {
      setIsLoading(true);
      const { orgId } = getApiContext();
      if (!orgId) return;

      const result = await apiFetch<IpCheckResult>(`/orgs/${orgId}/ip-check`);
      setIpInfo(result);
    } catch (error) {
      console.error('IP check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkIpAccess();
  }, [retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking IP access...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If access is allowed, this component shouldn't be shown
  if (ipInfo?.allowed) {
    return null;
  }

  const getReasonMessage = (reason: string) => {
    switch (reason) {
      case 'ip_blocked':
        return 'Your IP address is not in the organization\'s allowlist';
      case 'allowlist_disabled':
        return 'IP allowlist is disabled';
      case 'admin_bypass':
        return 'Administrator bypass active';
      case 'settings_fetch_error':
        return 'Unable to verify IP settings';
      case 'validation_error':
        return 'IP validation error occurred';
      default:
        return 'Access denied for unknown reason';
    }
  };

  const isAdminBypassAvailable = ipInfo?.userRole === 'orgAdmin';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Shield className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {getReasonMessage(ipInfo?.reason || '')}
            </AlertDescription>
          </Alert>

          <div className="rounded-md bg-muted p-4 space-y-2">
            <div className="text-sm">
              <strong>Your IP:</strong> {ipInfo?.clientIp || 'Unknown'}
            </div>
            <div className="text-sm">
              <strong>Organization:</strong> {ipInfo?.orgId || 'Unknown'}
            </div>
            <div className="text-sm">
              <strong>Your Role:</strong> {ipInfo?.userRole || 'Unknown'}
            </div>
          </div>

          {isAdminBypassAvailable && (
            <Alert>
              <AlertDescription>
                As an administrator, you should be able to bypass IP restrictions. 
                If you're seeing this message, there might be a configuration issue.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-medium">What you can do:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Contact your organization administrator</li>
              <li>• Ask them to add your IP address to the allowlist</li>
              <li>• Try connecting from a different network</li>
              {isAdminBypassAvailable && (
                <li>• Check organization security settings</li>
              )}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button onClick={handleRetry} variant="outline" className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
            <Button asChild className="flex-1">
              <a href="mailto:support@briefly.local" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Contact Support
              </a>
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-2">
            This security measure protects your organization's data by restricting access to approved IP addresses.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default IpBlockedPage;