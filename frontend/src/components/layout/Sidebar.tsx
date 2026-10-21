import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Database,
  Search,
  BookOpen,
  Sparkles,
  FolderKanban,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Shield,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { fetchChatThreads, ChatThreadItem } from '../../services/chatService';

export interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  // Desktop collapse state (default expanded, persisted in localStorage)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cognidesk_sidebar_collapsed');
      if (saved !== null) {
        return saved === 'true';
      }
    }
    return false;
  });

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<ChatThreadItem[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { user, isGuest } = useAuth();

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('cognidesk_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const threads = await fetchChatThreads();
        setRecentChats(threads.slice(0, 3));
      } catch (err) {
        setRecentChats([]);
      }
    };
    loadRecent();

    const handleChatUpdate = () => loadRecent();
    window.addEventListener('workspace-switched', handleChatUpdate);
    window.addEventListener('chat-thread-updated', handleChatUpdate);
    return () => {
      window.removeEventListener('workspace-switched', handleChatUpdate);
      window.removeEventListener('chat-thread-updated', handleChatUpdate);
    };
  }, [activeWorkspace?.id]);

  const mainNav = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'AI Chat', path: '/chat', icon: MessageSquare },
    { name: 'Documents', path: '/documents', icon: FileText },
    { name: 'Knowledge Base', path: '/knowledge-base', icon: Database },
    { name: 'Search', path: '/search', icon: Search },
    { name: 'Notes', path: '/notes', icon: BookOpen },
    { name: 'Flashcards', path: '/flashcards', icon: Sparkles },
    { name: 'Workspaces', path: '/workspaces', icon: FolderKanban },
    { name: 'History', path: '/history', icon: History },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 p-2 sm:p-2.5 pr-0 shrink-0 select-none h-full transition-[width,transform] duration-300 ease-in-out md:translate-x-0 md:relative md:z-30 md:flex ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none md:pointer-events-auto'
      } ${collapsed ? 'md:w-[84px]' : 'md:w-[262px]'}`}
    >
      {/* Sleek Oceanic Tech Transparent Glassmorphism Sidebar Rail */}
      <aside
        className={`relative flex flex-col h-full rounded-2xl bg-gradient-to-b from-white/95 via-blue-50/90 to-cyan-50/90 dark:from-[#0c1836]/95 dark:via-[#10234a]/90 dark:to-[#081832]/95 border border-white/80 dark:border-cyan-500/30 backdrop-blur-2xl text-slate-700 dark:text-slate-300 transition-[width] duration-300 ease-in-out shadow-[0_10px_35px_-5px_rgba(37,99,235,0.2),inset_0_1px_1px_rgba(255,255,255,0.9)] dark:shadow-[0_14px_45px_rgba(0,0,0,0.8),0_0_25px_rgba(6,182,212,0.18),inset_1px_1px_1px_rgba(255,255,255,0.18)] overflow-hidden w-72 max-w-[85vw] ${
          collapsed ? 'md:w-[72px]' : 'md:w-[250px]'
        }`}
      >
        {/* 3D Left Specular Shimmer Line */}
        <div className="absolute inset-y-6 left-0 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-400/80 to-transparent pointer-events-none opacity-85" />

        {/* Top Header: Brand Logo & Collapse/Expand Trigger */}
        <div className="flex items-center justify-between h-16 px-3 border-b border-blue-100/80 dark:border-blue-900/40 relative z-10 shrink-0">
          {/* Desktop Collapsed view */}
          {collapsed && (
            <div className="hidden md:flex items-center justify-center w-full">
              <button
                type="button"
                onClick={toggleCollapse}
                className="relative p-1.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 transition-all cursor-pointer group/toggle"
                title="Expand Sidebar (250px)"
                aria-label="Expand Sidebar"
              >
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 text-white flex items-center justify-center shadow-md shadow-blue-500/30 group-hover/toggle:scale-105 transition-transform">
                  <Sparkles className="w-4 h-4 group-hover/toggle:hidden" />
                  <ChevronRight className="w-4 h-4 hidden group-hover/toggle:block text-white" />
                </div>
              </button>
            </div>
          )}

          {/* Expanded view (always on mobile, or when not collapsed on desktop) */}
          <div className={`${collapsed ? 'flex md:hidden' : 'flex'} items-center justify-between w-full`}>
            <NavLink
              to="/"
              onClick={() => onMobileClose?.()}
              className="flex items-center space-x-2.5 overflow-hidden group min-w-0"
            >
              <div className="relative shrink-0">
                <div className="absolute -inset-1 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-xl blur-xs opacity-40 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 text-white flex items-center justify-center shadow-md shadow-blue-500/40 group-hover:scale-105 group-hover:rotate-6 transition-all duration-300">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                  CogniDesk
                </span>
                <span className="text-[10px] text-blue-600 dark:text-cyan-400 font-bold tracking-wider uppercase truncate">
                  Offline AI Hub
                </span>
              </div>
            </NavLink>

            <div className="flex items-center space-x-1 shrink-0">
              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={onMobileClose}
                className="md:hidden p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
                title="Close Menu"
                aria-label="Close navigation drawer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Desktop Collapse Button */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-white/60 dark:hover:bg-slate-900/60 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-blue-200/50 dark:hover:border-cyan-500/30"
                title="Collapse Sidebar"
                aria-label="Collapse Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-thin relative z-10">
          {mainNav.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <div key={item.path} className="relative group">
                <NavLink
                  to={item.path}
                  onClick={() => onMobileClose?.()}
                  onMouseEnter={() => setActiveTooltip(item.name)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className={`w-full flex items-center rounded-xl text-xs sm:text-[13px] font-medium transition-all duration-200 relative min-h-[42px] cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-semibold shadow-[0_4px_16px_rgba(37,99,235,0.35)] ring-1 ring-white/20 dark:ring-cyan-300/40'
                      : 'text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-white/60 dark:hover:bg-slate-900/60 hover:border-blue-200/50 dark:hover:border-cyan-500/25 border border-transparent'
                  } ${collapsed ? 'justify-start px-3.5 py-2.5 md:justify-center md:p-2.5' : 'justify-start px-3.5 py-2.5'}`}
                >
                  {/* Icon */}
                  <item.icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-cyan-300'
                    }`}
                  />

                  {/* Navigation Text Label (always shown on mobile drawer, toggle on desktop) */}
                  <span
                    className={`ml-3 truncate font-medium flex-1 text-left ${
                      collapsed ? 'inline md:hidden' : 'inline'
                    }`}
                  >
                    {item.name}
                  </span>

                  {/* Active Glowing Dot Indicator */}
                  {isActive && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)] animate-pulse shrink-0 ml-2 ${
                        collapsed ? 'inline-block md:hidden' : 'inline-block'
                      }`}
                    />
                  )}
                </NavLink>

                {/* Floating Tooltip when Collapsed on Desktop */}
                {collapsed && activeTooltip === item.name && (
                  <div className="hidden md:block absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#0c1836]/95 text-white text-xs font-semibold shadow-2xl border border-cyan-500/40 pointer-events-none whitespace-nowrap animate-pop-in backdrop-blur-md">
                    <span>{item.name}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Recent Chats Section */}
          {recentChats.length > 0 && (
            <div className={`pt-3 mt-2 border-t border-blue-100/80 dark:border-blue-900/40 space-y-1 ${collapsed ? 'block md:hidden' : 'block'}`}>
              <div className="px-3 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
                <span>Recent Chats</span>
                <span className="text-[9px] text-blue-600 dark:text-cyan-300 font-semibold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40">
                  SQLite
                </span>
              </div>
              <div className="space-y-0.5 pt-1">
                {recentChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      navigate(`/chat?thread=${chat.id}`);
                      onMobileClose?.();
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-left truncate cursor-pointer group min-h-[34px]"
                    title={chat.title}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-cyan-300" />
                    <span className="truncate flex-1 text-[11px]">{chat.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Footer: User / Profile & Offline Engine Status */}
        <div className="p-2 border-t border-blue-100/80 dark:border-blue-900/40 space-y-2 relative z-10 shrink-0">
          {/* Offline Disk Indicator */}
          <div className={`${collapsed ? 'block md:hidden' : 'block'} p-2.5 rounded-xl bg-white/60 hover:bg-white/80 dark:bg-slate-900/50 dark:hover:bg-slate-900/70 border border-blue-200/50 dark:border-cyan-500/20 space-y-1.5 text-slate-600 dark:text-slate-300 shadow-xs backdrop-blur-md transition-all`}>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                <span className="font-medium text-[11px]">Local Engine</span>
              </div>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/40">
                100% Offline
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200/80 dark:bg-slate-800/80 rounded-full overflow-hidden p-[1px]">
              <div className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 w-[40%] rounded-full shadow-xs shadow-cyan-500/50" />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>SQLite + ChromaDB</span>
              <span className="font-semibold text-blue-600 dark:text-cyan-400">Protected</span>
            </div>
          </div>

          {/* User / Profile Control Button */}
          <div className="relative group/user">
            <button
              type="button"
              onClick={() => {
                navigate('/settings');
                onMobileClose?.();
              }}
              onMouseEnter={() => setActiveTooltip('Profile & Settings')}
              onMouseLeave={() => setActiveTooltip(null)}
              className={`w-full flex items-center ${
                collapsed ? 'justify-between p-2 md:justify-center' : 'justify-between p-2'
              } rounded-xl hover:bg-white/60 dark:hover:bg-slate-900/50 border border-transparent hover:border-blue-200/60 dark:hover:border-cyan-500/30 cursor-pointer transition-all group min-h-[44px]`}
              title="User Profile & Settings"
            >
              <div className="flex items-center space-x-2.5 overflow-hidden min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm shadow-blue-500/30 group-hover:scale-105 transition-transform">
                  {isGuest ? (
                    <Sparkles className="w-4 h-4 text-cyan-200" />
                  ) : user?.full_name ? (
                    user.full_name.charAt(0).toUpperCase()
                  ) : (
                    <UserIcon className="w-4 h-4 text-white" />
                  )}
                </div>

                <div className={`flex flex-col text-left truncate min-w-0 ${collapsed ? 'flex md:hidden' : 'flex'}`}>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-cyan-300 transition-colors">
                    {user?.full_name || (isGuest ? 'Guest User' : 'Local User')}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {isGuest ? 'Guest • Offline' : 'Local Account'}
                  </span>
                </div>
              </div>

              <Shield className={`w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300 transition-colors shrink-0 ml-1 ${collapsed ? 'block md:hidden' : 'block'}`} />
            </button>

            {/* Tooltip for Profile when Collapsed on Desktop */}
            {collapsed && activeTooltip === 'Profile & Settings' && (
              <div className="hidden md:block absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#0c1836]/95 text-white text-xs font-semibold shadow-2xl border border-cyan-500/40 pointer-events-none whitespace-nowrap animate-pop-in backdrop-blur-md">
                <span>{user?.full_name || (isGuest ? 'Guest User' : 'Local User')} (Settings)</span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;
