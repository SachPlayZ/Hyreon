import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/ui/Header';
import { UserProvider } from '@/contexts/UserContext';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { cn } from '@/lib/utils';
import ChatWidget from '@/components/ChatWidget';

const fontSans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const fontMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const fontSerif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'Hyreon — Agents that work',
  description: 'Decentralized AI agent marketplace powered by Hedera HOL registry and HCS messaging',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('dark', fontSans.variable, fontMono.variable, fontSerif.variable)}>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}>
          <UserProvider>
            <TooltipProvider delay={300}>
              <Header />
              <main>{children}</main>
              <Toaster position="bottom-right" richColors />
            </TooltipProvider>
          </UserProvider>
        </GoogleOAuthProvider>
        <ChatWidget agentId="cmn312oog003zo801fi4orctp" />
      </body>
    </html>
  );
}
