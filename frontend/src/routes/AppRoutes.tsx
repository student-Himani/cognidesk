import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '../components/layout/MainLayout';
import LoginPage from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';
import ChatPage from '../pages/ChatPage';
import DocumentsPage from '../pages/DocumentsPage';
import KnowledgeBasePage from '../pages/KnowledgeBasePage';
import SearchPage from '../pages/SearchPage';
import NotesPage from '../pages/NotesPage';
import FlashcardsPage from '../pages/FlashcardsPage';
import WorkspacesPage from '../pages/WorkspacesPage';
import HistoryPage from '../pages/HistoryPage';
import SettingsPage from '../pages/SettingsPage';
import { useAuth } from '../context/AuthContext';

export const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
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
  );
};

export default AppRoutes;
