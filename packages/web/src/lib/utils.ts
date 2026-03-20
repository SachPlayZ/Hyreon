import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString();
}

export function formatRelative(date: string | Date): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + '...' : str;
}

export const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  CLASSIFYING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  QUOTING: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  AWAITING_CONFIRMATION: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  HIRING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ESCROW_CREATED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  IN_PROGRESS: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  RATING_WINDOW: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  ESCROW_RELEASED: 'bg-green-500/20 text-green-400 border-green-500/30',
  FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
  REFUNDED: 'bg-zinc-400/20 text-zinc-400 border-zinc-400/30',
};
