"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { H1 } from '@/components/typography';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Sparkles, Shield, Zap, FileText, MessageSquare } from 'lucide-react';

export default function SignInPage() {
  const { isAuthenticated, signIn, isLoading } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSigningIn(true);
    try {
      // Use email for Supabase auth
      const ok = await signIn({ username: email, password });
      if (ok) router.push('/dashboard');
      else setError('Invalid email or password.');
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

    // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
        {/* Left hero panel */}
        <div className="hidden md:flex md:flex-col md:justify-center md:px-12 bg-gradient-to-br from-primary/20 via-primary/10 to-background">
          <div className="space-y-6">
            <Skeleton className="h-12 w-48" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-5/6" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-md rounded-3xl shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-2 pb-6">
              <Skeleton className="h-12 w-12 rounded-2xl mx-auto mb-4" />
              <Skeleton className="h-8 w-40 mx-auto" />
              <Skeleton className="h-4 w-56 mx-auto" />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden md:flex items-center justify-center bg-gradient-to-br from-primary via-primary/80 to-primary/60 text-primary-foreground p-10 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-32 bg-primary-foreground/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-primary-foreground/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-primary-foreground/20 rounded-full blur-2xl animate-pulse delay-500"></div>
        </div>
        
        <div className="max-w-lg text-center relative z-10">
          <div className="mx-auto mb-8 h-28 w-28 rounded-3xl bg-primary-foreground/10 backdrop-blur-sm flex items-center justify-center shadow-2xl ring-1 ring-white/20">
            <img src="/favicon.ico" alt="Briefly" className="h-16 w-16" />
          </div>
          <H1>Briefly</H1>
          <p className="mt-4 text-base/6 opacity-90">
            Transform your documents into intelligent knowledge. Upload, organize, and chat with your files using cutting-edge AI.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-3 text-left text-sm/6">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-primary-foreground/5 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-primary-foreground/80" />
              <span>AI-powered OCR & smart summaries</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-primary-foreground/5 backdrop-blur-sm">
              <FileText className="h-4 w-4 text-primary-foreground/80" />
              <span>Version control & document linking</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-primary-foreground/5 backdrop-blur-sm">
              <MessageSquare className="h-4 w-4 text-primary-foreground/80" />
              <span>Chat with your documents</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-3xl shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center space-y-2 pb-6">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Welcome back
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Sign in to access your intelligent document workspace
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email address</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  disabled={isSigningIn}
                  className="h-11 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isSigningIn}
                  className="h-11 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                />
              </div>
              
              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}
              
              {isSigningIn && (
                <div className="flex items-center justify-center text-sm text-muted-foreground bg-primary/5 rounded-xl p-3 border border-primary/10">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                  Securely authenticating your credentials...
                </div>
              )}
              
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] disabled:transform-none disabled:opacity-50"
                disabled={isSigningIn || !email || !password}
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing you in...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5" />
                    Sign in to Briefly
                  </>
                )}
              </Button>
              
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Secure • Fast • Intelligent
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


