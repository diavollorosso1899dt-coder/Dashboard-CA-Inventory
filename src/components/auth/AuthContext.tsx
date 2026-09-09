'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserProfile, UserRole } from '@/lib/supabase/types';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  quickLogin: (role: 'super_user' | 'user' | 'outlet_manager') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'dashboard_ca_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session from localStorage on initial load
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          setUser(parsed);
          document.cookie = `ca_auth=true; path=/; max-age=604800; SameSite=Lax`;
        }
      }
    } catch (e) {
      console.error('Failed to load session from storage', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password?: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: password || 'password123' }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setUser(json.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(json.data));
        document.cookie = `ca_auth=true; path=/; max-age=604800; SameSite=Lax`;
        return { success: true };
      } else {
        return { success: false, error: json.error || 'Login gagal' };
      }
    } catch (err: any) {
      return { success: false, error: 'Terjadi gangguan koneksi ke server' };
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      document.cookie = `ca_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    } catch (e) {}
    router.push('/login');
  };

  const quickLogin = async (roleType: 'super_user' | 'user' | 'outlet_manager') => {
    const demoAccounts = {
      super_user: 'admin@coffee-arabica.co.id',
      user: 'logistik@coffee-arabica.co.id',
      outlet_manager: 'manager.batam@coffee-arabica.co.id',
    };

    const targetEmail = demoAccounts[roleType];
    const res = await login(targetEmail, 'admin123');
    if (res.success) {
      router.push('/');
    } else {
      alert(res.error || 'Gagal login dengan akun demo');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        quickLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
