'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationContextType {
  isMobileOpen: boolean;
  toggleMobile: () => void;
  closeMobile: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isMobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  // Automatically close mobile menu when user changes page
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const toggleMobile = () => setIsMobileOpen((prev) => !prev);
  const closeMobile = () => setIsMobileOpen(false);

  return (
    <NavigationContext.Provider value={{ isMobileOpen, toggleMobile, closeMobile }}>
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
