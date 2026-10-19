import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DocumentItem {
  id: string;
  name: string;
  size: string;
  type: string;
  status: 'Indexed' | 'Processing' | 'Processed' | 'Uploaded' | 'Failed';
  date: string;
  chunks: number;
  word_count?: number;
  page_count?: number;
  has_text?: boolean;
}

interface DocumentsState {
  items: DocumentItem[];
  searchTerm: string;
  selectedType: string | null;
  isUploading: boolean;
  uploadProgress: number;
}

const initialState: DocumentsState = {
  items: [],
  searchTerm: '',
  selectedType: null,
  isUploading: false,
  uploadProgress: 0,
};

export const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setSelectedType: (state, action: PayloadAction<string | null>) => {
      state.selectedType = action.payload;
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    setIsUploading: (state, action: PayloadAction<boolean>) => {
      state.isUploading = action.payload;
    },
    addDocument: (state, action: PayloadAction<DocumentItem>) => {
      state.items.unshift(action.payload);
    },
    removeDocument: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((doc) => doc.id !== action.payload);
    },
    setDocuments: (state, action: PayloadAction<DocumentItem[]>) => {
      state.items = action.payload;
    },
    updateDocument: (state, action: PayloadAction<DocumentItem>) => {
      const idx = state.items.findIndex((doc) => doc.id === action.payload.id);
      if (idx !== -1) {
        state.items[idx] = action.payload;
      }
    },
  },
});

export const {
  setSearchTerm,
  setSelectedType,
  setUploadProgress,
  setIsUploading,
  addDocument,
  removeDocument,
  setDocuments,
  updateDocument,
} = documentsSlice.actions;
export default documentsSlice.reducer;
