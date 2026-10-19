import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, User, LoginPayload, RegisterPayload } from '../services/authService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  claimGuestWorkspaces: () => Promise<number>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('cognidesk_auth_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('cognidesk_auth_token');
      if (storedToken) {
        try {
          const profile = await authService.getMe();
          setUser(profile);
          setToken(storedToken);
          localStorage.setItem('cognidesk_cached_user', JSON.stringify(profile));
        } catch (err: any) {
          // If network is offline or backend unreachable, DO NOT wipe session!
          const isNetworkError = (typeof navigator !== 'undefined' && !navigator.onLine) ||
            err.code === 'ERR_NETWORK' ||
            !err.response ||
            err.message?.includes('Network Error');

          if (isNetworkError) {
            console.log('[Auth] Network unreachable on launch, restoring cached session.');
            const cachedUserStr = localStorage.getItem('cognidesk_cached_user');
            if (cachedUserStr) {
              try {
                const cachedUser = JSON.parse(cachedUserStr);
                setUser(cachedUser);
                setToken(storedToken);
                setIsLoading(false);
                return;
              } catch {}
            }

            // Fallback: decode JWT payload
            try {
              const parts = storedToken.split('.');
              if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                const fallbackUser: User = {
                  id: Number(payload.sub) || 1,
                  email: payload.email || 'offline-user@cognidesk.local',
                  full_name: payload.full_name || 'Offline User',
                  is_guest: Boolean(payload.is_guest),
                  is_active: true,
                };
                setUser(fallbackUser);
                setToken(storedToken);
                setIsLoading(false);
                return;
              }
            } catch {}
          }

          // Genuine 401 Unauthorized from backend — token is expired or revoked
          if (err?.response?.status === 401) {
            localStorage.removeItem('cognidesk_auth_token');
            localStorage.removeItem('cognidesk_cached_user');
            setUser(null);
            setToken(null);
          }
        }
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // First-time launch while offline: automatically grant local guest session
        const offlineGuest: User = {
          id: 9999,
          email: 'guest@cognidesk.offline',
          full_name: 'Offline Guest',
          is_guest: true,
          is_active: true,
        };
        setUser(offlineGuest);
        setToken('offline-guest-token');
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (payload: LoginPayload) => {
    // If currently a guest, pass guest_token so workspaces get merged
    const currentGuestToken = localStorage.getItem('cognidesk_guest_token');
    const authData = await authService.login({
      ...payload,
      guest_token: currentGuestToken || undefined,
    });

    localStorage.setItem('cognidesk_auth_token', authData.token);
    localStorage.setItem('cognidesk_cached_user', JSON.stringify(authData.user));
    // If logged into registered account, remove guest token
    localStorage.removeItem('cognidesk_guest_token');
    setToken(authData.token);
    setUser(authData.user);
  };

  const register = async (payload: RegisterPayload) => {
    const currentGuestToken = localStorage.getItem('cognidesk_guest_token');
    const authData = await authService.register({
      ...payload,
      guest_token: currentGuestToken || undefined,
    });

    localStorage.setItem('cognidesk_auth_token', authData.token);
    localStorage.setItem('cognidesk_cached_user', JSON.stringify(authData.user));
    localStorage.removeItem('cognidesk_guest_token');
    setToken(authData.token);
    setUser(authData.user);
  };

  const continueAsGuest = async () => {
    try {
      const existingGuestToken = localStorage.getItem('cognidesk_guest_token');
      const authData = await authService.continueAsGuest(existingGuestToken || undefined);

      localStorage.setItem('cognidesk_auth_token', authData.token);
      localStorage.setItem('cognidesk_guest_token', authData.token);
      localStorage.setItem('cognidesk_cached_user', JSON.stringify(authData.user));
      setToken(authData.token);
      setUser(authData.user);
    } catch (err: any) {
      const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || (typeof navigator !== 'undefined' && !navigator.onLine);
      if (isNetworkError) {
        // Client offline fallback
        const offlineGuest: User = {
          id: 9999,
          email: 'guest@cognidesk.offline',
          full_name: 'Offline Guest',
          is_guest: true,
          is_active: true,
        };
        localStorage.setItem('cognidesk_auth_token', 'offline-guest-token');
        localStorage.setItem('cognidesk_guest_token', 'offline-guest-token');
        localStorage.setItem('cognidesk_cached_user', JSON.stringify(offlineGuest));
        setToken('offline-guest-token');
        setUser(offlineGuest);
        return;
      }
      throw err;
    }
  };

  const claimGuestWorkspaces = async (): Promise<number> => {
    const guestToken = localStorage.getItem('cognidesk_guest_token');
    if (!guestToken) return 0;

    const res = await authService.claimGuest(guestToken);
    localStorage.removeItem('cognidesk_guest_token');
    localStorage.setItem('cognidesk_cached_user', JSON.stringify(res.user));
    setUser(res.user);
    return res.claimed_count;
  };

  const logout = () => {
    authService.logout();
    localStorage.removeItem('cognidesk_auth_token');
    localStorage.removeItem('cognidesk_cached_user');
    localStorage.removeItem('cognidesk_active_workspace_id');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isGuest: !!user?.is_guest,
        isLoading,
        login,
        register,
        continueAsGuest,
        claimGuestWorkspaces,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
