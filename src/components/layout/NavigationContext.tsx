'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationContextType {
  isMobileOpen: boolean;
  toggleMobile: () => void;
  closeMobile: () => void;
  isTutorialOpen: boolean;
  openTutorial: () => void;
  closeTutorial: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isMobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
  isTutorialOpen: false,
  openTutorial: () => {},
  closeTutorial: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const pathname = usePathname();

  // Automatically close mobile menu when user changes page
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const toggleMobile = () => setIsMobileOpen((prev) => !prev);
  const closeMobile = () => setIsMobileOpen(false);
  const openTutorial = () => setIsTutorialOpen(true);
  const closeTutorial = () => setIsTutorialOpen(false);

  return (
    <NavigationContext.Provider 
      value={{ 
        isMobileOpen, 
        toggleMobile, 
        closeMobile,
        isTutorialOpen,
        openTutorial,
        closeTutorial,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);

