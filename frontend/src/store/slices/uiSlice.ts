import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  globalLoading: boolean;
  loadingMessage: string | null;
  activeWorkspaceId: string;
  isSearchModalOpen: boolean;
}

const initialState: UIState = {
  globalLoading: false,
  loadingMessage: null,
  activeWorkspaceId: '1',
  isSearchModalOpen: false,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setGlobalLoading: (state, action: PayloadAction<{ loading: boolean; message?: string }>) => {
      state.globalLoading = action.payload.loading;
      state.loadingMessage = action.payload.message || null;
    },
    setActiveWorkspaceId: (state, action: PayloadAction<string>) => {
      state.activeWorkspaceId = action.payload;
    },
    setSearchModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isSearchModalOpen = action.payload;
    },
  },
});

export const { setGlobalLoading, setActiveWorkspaceId, setSearchModalOpen } = uiSlice.actions;
export default uiSlice.reducer;
