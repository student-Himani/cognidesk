import React, { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { store } from './store';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import AppRoutes from './routes/AppRoutes';
import ToastContainer from './components/ui/ToastContainer';
import LoadingOverlay from './components/ui/LoadingOverlay';
import CogniDeskStartupAnimation from './components/loading/CogniDeskStartupAnimation';

// In Electron production (file:// protocol), HashRouter prevents 404s on static file loads
const isElectronOrFile =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' ||
    Boolean((window as any).cognideskDesktop?.isElectron));

const RouterComponent = isElectronOrFile ? HashRouter : BrowserRouter;

export const App: React.FC = () => {
  const [previewLoader, setPreviewLoader] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.search.includes('preview_loader=true');
  });
  const [isStartingUp, setIsStartingUp] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('preview_loader=true')) return true;
      // Show startup animation once per browser session; subsequent refreshes open instantly
      const hasSeen = sessionStorage.getItem('cognidesk_startup_seen');
      if (hasSeen) return false;
      sessionStorage.setItem('cognidesk_startup_seen', 'true');
      return true;
    }
    return false;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsStartingUp(false);
        setPreviewLoader(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <Provider store={store}>
      <AuthProvider>
        <ThemeProvider>
          <WorkspaceProvider>
            <RouterComponent>
              {/* Real Live CogniDesk Application */}
              <AppRoutes />
              <ToastContainer />
              <LoadingOverlay />

              {/* Full-Screen Cinematic Startup Animation */}
              {(isStartingUp || previewLoader) && (
                <CogniDeskStartupAnimation
                  onComplete={() => {
                    setIsStartingUp(false);
                    setPreviewLoader(false);
                  }}
                />
              )}
            </RouterComponent>
          </WorkspaceProvider>
        </ThemeProvider>
      </AuthProvider>
    </Provider>
  );
};

export default App;

