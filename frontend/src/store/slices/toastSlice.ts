import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastState {
  toasts: ToastMessage[];
}

const initialState: ToastState = {
  toasts: [],
};

export const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: (state, action: PayloadAction<Omit<ToastMessage, 'id'>>) => {
      const { title, message } = action.payload;

      const isConnectionNotice =
        title.toLowerCase().includes('connection') ||
        title.toLowerCase().includes('service notice') ||
        (message && (message.includes('starting up') || message.includes('Render cold-start') || message.includes('503')));

      // If it's a connection/cold-start notice, deduplicate: update existing or keep at most 1
      if (isConnectionNotice) {
        const existingIdx = state.toasts.findIndex(
          (t) =>
            t.title.toLowerCase().includes('connection') ||
            t.title.toLowerCase().includes('service notice') ||
            (t.message && (t.message.includes('starting up') || t.message.includes('cold-start') || t.message.includes('503')))
        );
        if (existingIdx !== -1) {
          // Replace in-place to avoid duplicate banner
          state.toasts[existingIdx] = {
            ...state.toasts[existingIdx],
            duration: 6000,
            ...action.payload,
          };
          return;
        }
      } else {
        // For general toasts, deduplicate identical title + message
        const isDuplicate = state.toasts.some(
          (t) => t.title === title && t.message === message
        );
        if (isDuplicate) {
          return;
        }
      }

      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      state.toasts.push({
        id,
        duration: isConnectionNotice ? 6000 : 4000,
        ...action.payload,
      });

      // Maintain at most 3 visible toasts to keep the UI clean
      if (state.toasts.length > 3) {
        state.toasts = state.toasts.slice(-3);
      }
    },
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    dismissConnectionToasts: (state) => {
      state.toasts = state.toasts.filter(
        (t) =>
          !t.title.toLowerCase().includes('connection') &&
          !t.title.toLowerCase().includes('service notice') &&
          !(t.message && (t.message.includes('starting up') || t.message.includes('cold-start') || t.message.includes('503')))
      );
    },
    clearAllToasts: (state) => {
      state.toasts = [];
    },
  },
});

export const { addToast, removeToast, dismissConnectionToasts, clearAllToasts } = toastSlice.actions;
export default toastSlice.reducer;
