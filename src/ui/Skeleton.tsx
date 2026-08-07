import React from 'react';

export interface SkeletonProps {
  className?: string;
  /** Rounded pill shape, useful for avatar/icon placeholders. */
  round?: boolean;
}

/** Loading placeholder block. Pulses gently; honours `prefers-reduced-motion`. */
export function Skeleton({ className = '', round = false }: SkeletonProps) {
  return (
    <div
      className={[
        'animate-pulse motion-reduce:animate-none bg-surface-2',
        round ? 'rounded-full' : 'rounded-lg',
        className,
      ].join(' ')}
      aria-hidden="true"
    />
  );
}
