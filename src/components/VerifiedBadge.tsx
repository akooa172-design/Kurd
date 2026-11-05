import React from 'react';
import { BadgeCheck } from 'lucide-react';

export const VERIFIED_FOLLOWERS_THRESHOLD = 1_000_000;

export function isUserVerified(followersCount?: number): boolean {
  return (followersCount || 0) >= VERIFIED_FOLLOWERS_THRESHOLD;
}

export function formatFollowersCount(count?: number): string {
  const n = count || 0;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return String(n);
}

interface VerifiedBadgeProps {
  followersCount?: number;
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  followersCount,
  className = 'w-4 h-4',
}) => {
  if (!isUserVerified(followersCount)) return null;
  return (
    <span
      title="هەژماری پشتڕاستکراو (١ ملیۆن+ فۆڵۆوەر)"
      className="inline-flex items-center shrink-0"
    >
      <BadgeCheck
        aria-label="هەژماری پشتڕاستکراو (١ ملیۆن+ فۆڵۆوەر)"
        className={`text-sky-400 fill-sky-500/20 ${className}`}
      />
    </span>
  );
};
