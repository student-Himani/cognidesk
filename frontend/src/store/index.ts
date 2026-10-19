import { configureStore } from '@reduxjs/toolkit';
import toastReducer from './slices/toastSlice';
import uiReducer from './slices/uiSlice';
import chatReducer from './slices/chatSlice';
import documentsReducer from './slices/documentsSlice';
import knowledgeReducer from './slices/knowledgeSlice';

export const store = configureStore({
  reducer: {
    toast: toastReducer,
    ui: uiReducer,
    chat: chatReducer,
    documents: documentsReducer,
    knowledge: knowledgeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
