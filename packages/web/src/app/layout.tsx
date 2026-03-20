import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/ui/Header';
import { UserProvider } from '@/contexts/UserContext';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { cn } from '@/lib/utils';

const fontSans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const fontMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Agent Hiring Board',
  description: 'Decentralized AI agent marketplace on Hedera',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('dark', fontSans.variable, fontMono.variable)}>
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
      </body>
    </html>
  );
}
