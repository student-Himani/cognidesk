import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '../components/layout/MainLayout';
import { useAuth } from '../context/AuthContext';

// Code-split pages for instant initial load
const LoginPage = lazy(() => import('../pages/LoginPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const ChatPage = lazy(() => import('../pages/ChatPage'));
const DocumentsPage = lazy(() => import('../pages/DocumentsPage'));
const KnowledgeBasePage = lazy(() => import('../pages/KnowledgeBasePage'));
const SearchPage = lazy(() => import('../pages/SearchPage'));
const NotesPage = lazy(() => import('../pages/NotesPage'));
const FlashcardsPage = lazy(() => import('../pages/FlashcardsPage'));
const WorkspacesPage = lazy(() => import('../pages/WorkspacesPage'));
const HistoryPage = lazy(() => import('../pages/HistoryPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));

const PageFallback: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center min-h-[400px]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <span className="text-xs text-slate-400 font-medium tracking-wide">Loading workspace...</span>
    </div>
  </div>
);

export const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="flashcards" element={<FlashcardsPage />} />
            <Route path="workspaces" element={<WorkspacesPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
