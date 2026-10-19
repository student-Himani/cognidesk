import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export const MainLayout: React.FC = () => {
  const { pathname } = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Automatically reset scroll to top on every route change so headers never get scrolled off
  // and automatically close the mobile sidebar on navigation
  useEffect(() => {
    setMobileSidebarOpen(false);
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative flex h-full w-full max-h-screen max-w-full overflow-hidden text-slate-800 dark:text-slate-100 bg-[#f1f5f9] dark:bg-[#070b14] transition-colors selection:bg-blue-500/20 selection:text-blue-900 dark:selection:text-cyan-200">
      {/* Dynamic Ambient Background Glow Elements for Transparent Glass Refraction */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-32 -left-20 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-blue-600/20 via-cyan-500/15 to-transparent blur-[100px] dark:from-blue-500/20 dark:via-indigo-600/15 dark:to-transparent -z-0 animate-pulse" 
        style={{ animationDuration: '8s' }} 
      />
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-24 right-10 w-[600px] h-[400px] rounded-full bg-gradient-to-bl from-cyan-500/15 via-blue-600/10 to-transparent blur-[110px] dark:from-cyan-400/15 dark:via-blue-600/15 dark:to-transparent -z-0" 
      />
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -bottom-40 left-1/3 w-[650px] h-[450px] rounded-full bg-gradient-to-tr from-indigo-600/10 via-cyan-500/10 to-transparent blur-[120px] dark:from-indigo-900/20 dark:via-cyan-900/15 dark:to-transparent -z-0" 
      />

      {/* Mobile Drawer Overlay Backdrop */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300 animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* Sleek Oceanic Sidebar Rail (Desktop Fixed Rail + Mobile Off-Canvas Drawer) */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Workspace Canvas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 relative z-10 w-full">
        {/* Oceanic Stadium Header - Always fixed at top */}
        <Navbar onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />

        {/* Content Viewport - Only this container scrolls, prevent horizontal overflow */}
        <main 
          ref={mainContentRef}
          className="flex-1 overflow-y-auto px-2.5 sm:px-4 md:px-5 pb-6 pt-1 min-w-0 overflow-x-hidden"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
