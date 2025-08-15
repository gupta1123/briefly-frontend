"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { H1 } from '@/components/typography';

export default function SignInPage() {
  const { isAuthenticated, signIn } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Treat username field as email for Supabase auth
    const ok = await signIn({ username: email || username, password });
    if (ok) router.push('/dashboard');
    else setError('Invalid email or password.');
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden md:flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-10">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-6 h-24 w-24 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm flex items-center justify-center shadow-lg ring-1 ring-white/20">
            <img src="/favicon.ico" alt="Briefly" className="h-14 w-14" />
          </div>
          <H1>Briefly</H1>
          <p className="mt-3 text-sm/6 opacity-90">
            Intelligent document management. Upload, organize, and ask questions about your files with AI.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-2 text-left text-sm/6">
            <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary-foreground" /> OCR + 300‑word summaries</div>
            <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary-foreground" /> Versions and linking</div>
            <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary-foreground" /> Chat with your documents</div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-2xl shadow-lg">
          <CardHeader className="text-center md:text-left">
            <CardTitle className="text-xl">Sign in to Briefly</CardTitle>
            <p className="text-sm text-muted-foreground">Welcome back. Please enter your details.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-sm">Email</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="text-sm">Username (optional)</label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
              </div>
              <div>
                <label className="text-sm">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">Sign in</Button>
              <div className="text-xs text-muted-foreground text-center space-y-1" />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


