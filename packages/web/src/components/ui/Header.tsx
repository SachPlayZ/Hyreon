'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wallet, Plus, LogOut, Zap, ExternalLink, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/chat', label: 'Chat' },
  { href: '/agents', label: 'Agents' },
  { href: '/agents/register', label: 'Register Agent' },
];

export function Header() {
  const { user, logout } = useUser();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="size-8 rounded-xl bg-primary flex items-center justify-center glow-purple transition-transform group-hover:scale-105">
            <Zap size={16} className="text-primary-foreground fill-current" />
          </div>
          <span className="font-semibold text-base tracking-tight">Agent Hiring Board</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg transition-colors',
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {link.label}
            </Link>
          ))}
          <Separator orientation="vertical" className="h-4 mx-2" />
          <a
            href="https://hashscan.io/testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent/50"
          >
            HashScan <ExternalLink size={11} className="opacity-60" />
          </a>
        </nav>

        {/* User area */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Tooltip>
                <TooltipTrigger render={
                  <Link href="/profile">
                    <Button variant="outline" size="sm" className="gap-2 h-8 font-mono border-primary/30 hover:border-primary/60 hover:bg-primary/10">
                      <Wallet size={13} />
                      <span className="text-primary font-semibold">{user.hbarBalance.toFixed(2)}</span>
                      <span className="text-muted-foreground text-xs">ℏ</span>
                    </Button>
                  </Link>
                } />
                <TooltipContent>View Profile & Wallet</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <Link href="/profile">
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-muted-foreground hover:text-foreground text-sm">
                      <User size={13} />
                      <span className="hidden sm:block">{user.name}</span>
                    </Button>
                  </Link>
                } />
                <TooltipContent>Profile</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={logout}>
                    <LogOut size={14} />
                  </Button>
                } />
                <TooltipContent>Logout</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm" className="h-8 glow-purple">Login</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
