import apiClient from './apiClient';

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_guest: boolean;
  is_active: boolean;
  workspace_count?: number;
  created_at?: string;
}

export interface AuthResponseData {
  user: User;
  token: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name?: string;
  guest_token?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  guest_token?: string;
}

export const authService = {
  async register(payload: RegisterPayload): Promise<AuthResponseData> {
    const res = await apiClient.post<{ success: boolean; message: string; data: AuthResponseData }>(
      '/auth/register',
      payload
    );
    return res.data.data;
  },

  async login(payload: LoginPayload): Promise<AuthResponseData> {
    const res = await apiClient.post<{ success: boolean; message: string; data: AuthResponseData }>(
      '/auth/login',
      payload
    );
    return res.data.data;
  },

  async continueAsGuest(guestToken?: string): Promise<AuthResponseData> {
    const res = await apiClient.post<{ success: boolean; message: string; data: AuthResponseData }>(
      '/auth/guest',
      guestToken ? { guest_token: guestToken } : {}
    );
    return res.data.data;
  },

  async getMe(): Promise<User> {
    const res = await apiClient.get<{ success: boolean; message: string; data: User }>('/auth/me');
    return res.data.data;
  },

  async claimGuest(guestToken: string): Promise<{ claimed_count: number; user: User }> {
    const res = await apiClient.post<{
      success: boolean;
      message: string;
      data: { claimed_count: number; user: User };
    }>('/auth/claim-guest', { guest_token: guestToken });
    return res.data.data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Local clean-up proceeds even if server endpoint fails
    }
  },
};

export default authService;
