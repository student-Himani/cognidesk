import axios from 'axios';
import { store } from '../store';
import { addToast } from '../store/slices/toastSlice';

function resolveInitialBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('cognidesk_api_base_url');
    // If a previous erroneous pages.dev same-origin URL was saved, discard it
    if (saved && saved.trim() && !saved.includes('pages.dev')) return saved.trim();

    const hostname = window.location.hostname;
    if (hostname.includes('pages.dev')) {
      return 'https://cognidesk-fdc8.onrender.com/api/v1';
    }

    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    if (!isLocalhost) {
      // On hosted web deployments, route to same-domain reverse proxy by default
      return `${window.location.origin}/api/v1`;
    }
  }
  return 'http://127.0.0.1:8000/api/v1';
}

let dynamicApiBaseUrl = resolveInitialBaseUrl();

export const apiClient = axios.create({
  baseURL: dynamicApiBaseUrl,
  timeout: 60000,
  headers: {
    Accept: 'application/json',
  },
});

export function getApiBaseUrl(): string {
  return apiClient.defaults.baseURL || dynamicApiBaseUrl;
}

export function setApiBaseUrl(url: string, persist: boolean = false) {
  dynamicApiBaseUrl = url;
  apiClient.defaults.baseURL = url;
  if (persist && typeof window !== 'undefined') {
    localStorage.setItem('cognidesk_api_base_url', url);
  }
}

// In Electron desktop environment, automatically sync dynamic backend port
if (typeof window !== 'undefined' && (window as any).cognideskDesktop?.getBackendPort) {
  (window as any).cognideskDesktop.getBackendPort().then((port: number) => {
    if (port) {
      setApiBaseUrl(`http://127.0.0.1:${port}/api/v1`);
      console.log(`[ApiClient] Desktop backend initialized on port: ${port}`);
    }
  }).catch(() => {});

  if ((window as any).cognideskDesktop?.onBackendStatus) {
    (window as any).cognideskDesktop.onBackendStatus((status: any) => {
      if (status?.port && status?.status === 'running') {
        setApiBaseUrl(`http://127.0.0.1:${status.port}/api/v1`);
      }
    });
  }
}


// Request Interceptor
apiClient.interceptors.request.use(
  (config) => {
    config.headers['X-CogniDesk-Client'] = 'WebUI-v1.0';
    const token = localStorage.getItem('cognidesk_auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    const activeWsId = localStorage.getItem('cognidesk_active_workspace_id');
    if (activeWsId) {
      config.headers['X-Workspace-Id'] = activeWsId;
    }
    // If payload is FormData, do not set application/json content-type
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor with Global Error Handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const config = error.config || {};
    const url = config.url || '';

    // Silence global error toast for background probes or callers that requested skipGlobalToast
    const isProbe = url.includes('/rag/status') || url.includes('/health') || url.includes('/settings');
    const skipToast = (config as any).skipGlobalToast || config.headers?.['X-Skip-Global-Toast'] || isProbe;

    if (!skipToast) {
      let rawMsg =
        error.response?.data?.error?.message ||
        error.response?.data?.detail ||
        error.message ||
        'An unexpected network error occurred';

      let errorMessage = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      let errorTitle = 'API Request Error';
      let toastType: 'error' | 'warning' | 'info' = 'error';

      // Provide clear friendly guidance if backend is waking up or temporarily unavailable
      if (!error.response || error.code === 'ERR_NETWORK') {
        errorTitle = 'Connection Notice';
        toastType = 'warning';
        errorMessage = 'Backend instance is starting up (~30s Render cold-start). Please wait a moment...';
      } else if (error.response?.status === 503) {
        errorTitle = 'Service Notice';
        toastType = 'warning';
        if (errorMessage.includes('No valid LLM provider configured')) {
          errorMessage = 'Cloud AI key is not yet configured. Please set your Groq, Gemini, or OpenAI API key in Settings.';
        }
      }

      // Dispatch global toast error
      store.dispatch(
        addToast({
          type: toastType,
          title: errorTitle,
          message: errorMessage,
        })
      );
    }

    return Promise.reject(error);
  }
);

export default apiClient;
