"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { H1, Muted } from '@/components/typography';

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  sticky?: boolean;
  className?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent';
  containerClassName?: string;
};

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  actions,
  meta,
  sticky,
  className,
  icon,
  tone = 'default',
  containerClassName,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'w-full border-b bg-background/80',
        sticky && 'sticky top-0 z-10 backdrop-blur-sm',
        className
      )}
    >
      <div className={cn('px-4 md:px-6', sticky ? 'py-3' : 'pt-1 pb-4')}>
        <div className={cn('mx-auto', containerClassName || 'max-w-6xl')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {backHref && (
                  <Link href={backHref} className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> {backLabel}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                {icon && <span className="text-primary">{icon}</span>}
                <H1 className="truncate text-2xl md:text-3xl">{title}</H1>
              </div>
              {subtitle && <Muted className="mt-1">{subtitle}</Muted>}
            </div>
            <div className="flex items-center gap-2">
              {meta && <div className="hidden md:block text-xs text-muted-foreground mr-2">{meta}</div>}
              {actions}
            </div>
          </div>
          {meta && <div className="md:hidden text-xs text-muted-foreground mt-2">{meta}</div>}
        </div>
      </div>
    </div>
  );
}

