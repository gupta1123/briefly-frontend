'use client';

import { cn } from '@/lib/utils';
import { type ComponentProps, memo } from 'react';
import { Streamdown } from 'streamdown';

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        'prose prose-sm max-w-none text-[15px] leading-relaxed',
        'prose-p:my-0 prose-p:leading-relaxed',
        'prose-strong:font-semibold prose-strong:text-foreground',
        'prose-em:italic prose-em:text-foreground',
        'prose-ul:my-0 prose-ol:my-0',
        'prose-li:my-0 prose-li:leading-relaxed',
        'prose-headings:my-0 prose-headings:font-semibold',
        'prose-h1:text-lg prose-h2:text-base prose-h3:text-sm',
        'prose-h1:font-bold prose-h2:font-semibold prose-h3:font-medium',
        'prose-blockquote:my-0 prose-blockquote:border-l-2 prose-blockquote:border-border/50 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-muted-foreground',
        'prose-code:text-sm prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono',
        'prose-pre:my-0 prose-pre:bg-muted/50 prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto',
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = 'Response';
