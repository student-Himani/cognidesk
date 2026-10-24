import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderKanban,
  ChevronDown,
  Check,
  ExternalLink,
  Layers,
  Sun,
  Moon,
  User,
  LogOut,
  Sparkles,
  Menu,
  Download,
} from 'lucide-react';
import SearchModal from '../ui/SearchModal';
import { checkBackendHealth, HealthResponse } from '../../services/healthService';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { onInstallPromptChange, promptPwaInstall } from '../../serviceWorkerRegistration';

export interface NavbarProps {
  onToggleMobileSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileSidebar }) => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, isGuest, logout } = useAuth();
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [showHealthPopover, setShowHealthPopover] = useState(false);
  const [canInstall, setCanInstall] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onInstallPromptChange(setCanInstall);
  }, []);

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const data = await checkBackendHealth();
      setHealth(data);
      setIsOnline(true);
    } catch (err) {
      setHealth(null);
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowHealthPopover(false);
      }
      if (workspaceRef.current && !workspaceRef.current.contains(event.target as Node)) {
        setIsWorkspaceOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusColor = () => {
    if (!isOnline) return 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/40';
    if (health?.status !== 'healthy') return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/40';
    return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/40';
  };

  const getStatusDotColor = () => {
    if (!isOnline) return 'bg-rose-500 animate-pulse';
    if (health?.status !== 'healthy') return 'bg-amber-500 animate-pulse';
    return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]';
  };

  return (
    <>
      <header className="sticky top-0 z-30 px-2 sm:px-3 md:px-4 pt-2.5 pb-2 transition-colors shrink-0">
        {/* Stadium Animated Transparent Gradient Header Bar with 3D Specular Highlights */}
        <div className="relative h-16 rounded-2xl bg-gradient-to-r from-white/85 via-blue-50/70 to-cyan-50/75 dark:from-[#0c1836]/90 dark:via-[#11244d]/85 dark:to-[#091933]/90 backdrop-blur-2xl border border-white/80 dark:border-cyan-500/30 px-2.5 sm:px-4 md:px-5 flex items-center justify-between gap-2 sm:gap-3 shadow-[0_10px_35px_-5px_rgba(37,99,235,0.12),inset_0_1px_1px_rgba(255,255,255,0.9)] dark:shadow-[0_14px_45px_rgba(0,0,0,0.7),0_0_25px_rgba(6,182,212,0.15),inset_0_1px_1px_rgba(255,255,255,0.18)] transition-all overflow-hidden">
          
          {/* 3D Top Specular Shimmer Line */}
          <div className="absolute inset-x-6 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent pointer-events-none opacity-85" />

          {/* Left: Mobile Hamburger & Workspace Selector */}
          <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0 z-10">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="md:hidden p-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-blue-900/50 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-cyan-400 hover:bg-slate-100 transition-colors shadow-2xs min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
              title="Toggle Navigation Menu"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Workspace Selector */}
            <div className="relative shrink-0" ref={workspaceRef}>
              <button
                onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
                className="flex items-center space-x-1.5 sm:space-x-2.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white/95 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 border border-blue-200/70 dark:border-cyan-500/35 text-slate-800 dark:text-slate-100 transition-all text-xs font-semibold cursor-pointer group/ws shadow-xs hover:shadow-md hover:-translate-y-0.5 min-h-[38px]"
                title="Select active workspace"
              >
                <div className="p-1 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white shadow-sm shadow-blue-500/40 group-hover/ws:scale-105 transition-transform">
                  <FolderKanban className="w-3.5 h-3.5" />
                </div>
                <div className="text-left flex flex-col">
                  <span className="text-[8px] sm:text-[9px] text-blue-600 dark:text-cyan-400 font-bold tracking-wider uppercase leading-none">
                    WORKSPACE
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white max-w-[65px] xs:max-w-[95px] sm:max-w-[130px] truncate leading-tight mt-0.5">
                    {activeWorkspace?.name || 'Default Workspace'}
                  </span>
                </div>
                <ChevronDown
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 dark:text-slate-400 transition-transform duration-150 shrink-0 ${
                    isWorkspaceOpen ? 'rotate-180 text-blue-600 dark:text-cyan-300' : ''
                  }`}
                />
              </button>

            {/* Workspace Dropdown Menu */}
            {isWorkspaceOpen && (
              <div className="absolute left-0 top-13 mt-1.5 w-[calc(100vw-2rem)] max-w-xs bg-white dark:bg-[#111827] border border-blue-200/80 dark:border-blue-800/50 rounded-2xl shadow-xl z-50 p-2 text-left space-y-1 animate-pop-in">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    Select Workspace
                  </span>
                  <span className="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-300 px-2 py-0.5 rounded-full border border-blue-200/70 dark:border-blue-800/50 font-semibold">
                    {workspaces.length} offline
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto py-1 space-y-1 scrollbar-thin">
                  {workspaces.map((ws) => {
                    const isActive = activeWorkspace?.id === ws.id;
                    return (
                      <button
                        key={ws.id}
                        onClick={async () => {
                          await switchWorkspace(ws.id);
                          setIsWorkspaceOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-cyan-200 border border-blue-200/80 dark:border-blue-800/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 overflow-hidden">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 ${
                              isActive
                                ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-semibold truncate text-slate-900 dark:text-slate-100">
                              {ws.name}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-400 truncate">
                              {ws.document_count} docs • {ws.note_count} notes • {ws.flashcard_deck_count} decks
                            </p>
                          </div>
                        </div>
                        {isActive && (
                          <div className="p-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-cyan-300 shrink-0 ml-2">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setIsWorkspaceOpen(false);
                      navigate('/workspaces');
                    }}
                    className="w-full flex items-center justify-center space-x-2 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
                  >
                    <span>Manage All Workspaces</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Middle: Sleek High-Contrast Translucent Cool Grey Glass Search Bar */}
          <div className="flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-2 sm:mx-3 hidden sm:block">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-full h-9 flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/55 hover:bg-white/80 dark:bg-slate-900/50 dark:hover:bg-slate-900/75 border border-blue-200/60 dark:border-cyan-500/25 hover:border-blue-400/80 dark:hover:border-cyan-400/50 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-all text-xs group/search cursor-pointer shadow-inner backdrop-blur-md"
            >
              <div className="flex items-center space-x-2 truncate">
                <Search className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 group-hover/search:scale-110 transition-transform shrink-0" />
                <span className="font-normal text-slate-600 dark:text-slate-300 truncate">Search workspace...</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xs shrink-0 ml-1">
                Ctrl /
              </kbd>
            </button>
          </div>

          {/* Right Suite: Diagnostics, Theme, Notifications, Profile */}
          <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0" ref={popoverRef}>
            {/* Mobile Search Icon Button */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="sm:hidden p-1.5 xs:p-2 rounded-xl bg-white/70 hover:bg-white/95 dark:bg-slate-900/50 dark:hover:bg-slate-800/80 border border-blue-200/60 dark:border-cyan-500/30 text-slate-700 dark:text-slate-300 transition-all min-w-[34px] min-h-[34px] xs:min-w-[38px] xs:min-h-[38px] flex items-center justify-center cursor-pointer shadow-xs"
              title="Search workspace (Ctrl+/)"
              aria-label="Search workspace"
            >
              <Search className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-blue-600 dark:text-cyan-400" />
            </button>

            {/* Install PWA Button (when available) */}
            {canInstall && (
              <button
                type="button"
                onClick={() => promptPwaInstall()}
                className="flex items-center space-x-1 px-2 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer animate-pulse"
                title="Install CogniDesk as a Progressive Web App"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Install PWA</span>
              </button>
            )}

            {/* API Server Health Badge (Full on sm+, Dot on mobile) */}
            <button
              onClick={() => setShowHealthPopover(!showHealthPopover)}
              className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${getStatusColor()}`}
            >
              <span className={`w-2 h-2 rounded-full ${getStatusDotColor()}`} />
              <span>{isOnline ? (health?.status === 'healthy' ? 'API Connected' : 'System Degraded') : 'Offline (Local Engine)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowHealthPopover(!showHealthPopover)}
              className={`sm:hidden p-1.5 xs:p-2 rounded-xl border transition-colors cursor-pointer min-w-[34px] min-h-[34px] xs:min-w-[38px] xs:min-h-[38px] flex items-center justify-center shadow-xs ${getStatusColor()}`}
              title={isOnline ? (health?.status === 'healthy' ? 'API Connected' : 'System Degraded') : 'Offline Mode (Local Storage & Local AI)'}
              aria-label="Server status"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${getStatusDotColor()}`} />
            </button>

            {/* Health Diagnostics Popover */}
            {showHealthPopover && (
              <div className="absolute right-0 sm:right-14 top-13 mt-1.5 w-[calc(100vw-2rem)] max-w-xs bg-white dark:bg-[#111827] border border-blue-200/80 dark:border-blue-800/50 rounded-2xl shadow-xl z-50 p-3.5 text-left space-y-3 animate-pop-in">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">System Diagnostics</span>
                  </div>
                  <button
                    onClick={checkHealth}
                    disabled={isChecking}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 disabled:opacity-40 transition-colors"
                    title="Refresh diagnostics"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Core API Server</span>
                    <span className="flex items-center space-x-1">
                      {isOnline ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Online</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">Offline</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Database (SQL)</span>
                    <span className="flex items-center space-x-1">
                      {!isOnline ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      ) : health?.services.database === 'healthy' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Connected</span>
                        </>
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Vector Store</span>
                    <span className="flex items-center space-x-1">
                      {!isOnline ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      ) : health?.services.vector_store === 'healthy' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Connected</span>
                        </>
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 pt-1 text-center font-medium border-t border-slate-100 dark:border-slate-800">
                  100% Offline • Zero cloud telemetry
                </div>
              </div>
            )}

            {/* Theme Toggle Button (Sun / Moon) */}
            <button
              id="theme-toggle-btn"
              data-testid="theme-toggle-btn"
              onClick={toggleTheme}
              className="p-1.5 xs:p-2 rounded-xl bg-white/70 hover:bg-white/95 dark:bg-slate-900/50 dark:hover:bg-slate-800/80 border border-blue-200/60 dark:border-cyan-500/30 text-slate-700 dark:text-slate-300 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs hover:shadow-md hover:border-cyan-400/50 min-w-[34px] min-h-[34px] xs:min-w-[38px] xs:min-h-[38px] flex items-center justify-center"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Moon className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-cyan-300" />
              ) : (
                <Sun className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-amber-500" />
              )}
            </button>

            {/* Notification Bell (Hidden on small mobile screens to prevent header overflow) */}
            <div className="relative hidden sm:block">
              <button
                className="p-2 rounded-xl bg-white/70 hover:bg-white/95 dark:bg-slate-900/50 dark:hover:bg-slate-800/80 border border-blue-200/60 dark:border-cyan-500/30 text-slate-700 dark:text-slate-300 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs hover:shadow-md hover:border-cyan-400/50"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
              </button>
            </div>

            {/* Guest Mode Indicator */}
            {isGuest && (
              <div
                id="navbar-guest-badge"
                className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-medium"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span>Guest Mode (Offline)</span>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="ml-1 text-[11px] underline hover:text-amber-500 dark:hover:text-amber-100 font-semibold cursor-pointer"
                  title="Create permanent account to save your work"
                >
                  Save Account
                </button>
              </div>
            )}

            {/* User Profile Info & Avatar */}
            <div className="flex items-center gap-1.5 xs:gap-2">
              <div className="hidden lg:flex flex-col text-right leading-tight">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                  {user?.full_name || (isGuest ? 'Guest User' : 'Local User')}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                  {isGuest ? 'Temporary Offline' : user?.email || 'Local Account'}
                </span>
              </div>

              <button
                onClick={() => navigate('/settings')}
                className="w-7 h-7 xs:w-8 xs:h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 p-[1.5px] hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm shadow-blue-500/30 shrink-0"
                title={`Logged in as ${user?.full_name || (isGuest ? 'Guest User' : 'Local User')}`}
              >
                <div className="w-full h-full rounded-[10px] bg-white/90 dark:bg-slate-950 flex items-center justify-center text-slate-700 dark:text-slate-200">
                  <User className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-blue-600 dark:text-cyan-400" />
                </div>
              </button>

              {/* Logout Button */}
              <button
                id="btn-navbar-logout"
                data-testid="navbar-logout-btn"
                onClick={logout}
                className="p-1.5 xs:p-2 rounded-xl bg-white/70 hover:bg-rose-500/10 dark:bg-slate-900/50 dark:hover:bg-rose-500/20 border border-slate-200/70 dark:border-slate-800 hover:border-rose-400/50 text-slate-600 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs min-w-[34px] min-h-[34px] xs:min-w-[38px] xs:min-h-[38px] flex items-center justify-center shrink-0"
                title="Sign out of CogniDesk"
              >
                <LogOut className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Global Search Command Modal */}
      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};

export default Navbar;
