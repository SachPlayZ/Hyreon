'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getUserBalance } from '@/lib/api';

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
  setUser: (user: UserState | null) => void;
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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserState | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUserState(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const setUser = useCallback((u: UserState | null) => {
    setUserState(u);
    if (u) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } else {
      localStorage.removeItem(STORAGE_KEY);
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
