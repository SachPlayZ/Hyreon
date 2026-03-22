'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getUserBalance, setAuthToken } from '@/lib/api';

export type AuthProvider = 'GOOGLE' | 'METAMASK';

interface UserState {
  id: string;
  name: string;
  hederaAccountId: string;
  authProvider: AuthProvider;
  evmAddress?: string | null;
  hbarBalance: number;
  hbarDeposited: number;
  hbarSpent: number;
}

interface UserContextValue {
  user: UserState | null;
  setUser: (user: UserState | null, token?: string) => void;
  refreshBalance: () => Promise<void>;
  logout: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  setUser: () => {},
  refreshBalance: async () => {},
  logout: () => {},
});

const STORAGE_KEY = 'ahb_user';
const TOKEN_KEY = 'ahb_token';
const SESSION_EXPIRY_KEY = 'ahb_session_expiry';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (matches JWT expiry)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserState | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);

    // Check session TTL
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      return;
    }

    if (stored && token) {
      try {
        setUserState(JSON.parse(stored));
        setAuthToken(token);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SESSION_EXPIRY_KEY);
      }
    }
  }, []);

  const setUser = useCallback((u: UserState | null, token?: string) => {
    setUserState(u);
    if (u) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + SESSION_TTL_MS));
        setAuthToken(token);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      setAuthToken(null);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUserBalance(user.id);
      const updated = { ...user, ...data };
      setUserState(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to refresh balance:', err);
    }
  }, [user]);

  const logout = useCallback(() => {
    setUser(null);
  }, [setUser]);

  return (
    <UserContext.Provider value={{ user, setUser, refreshBalance, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
