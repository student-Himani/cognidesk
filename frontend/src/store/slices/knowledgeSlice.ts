import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CollectionItem {
  name: string;
  count: string;
  docs: number;
  tags: string[];
}

interface KnowledgeState {
  collections: CollectionItem[];
  totalChunks: number;
  chunkSize: number;
  overlap: number;
  embeddingModel: string;
}

const initialState: KnowledgeState = {
  collections: [
    { name: 'Research Papers', count: '8,420 chunks', docs: 14, tags: ['AI', 'Physics', 'Computing'] },
    { name: 'Financial Records', count: '4,150 chunks', docs: 8, tags: ['Finance', 'Q4', 'Reports'] },
    { name: 'Code & Architecture', count: '6,030 chunks', docs: 22, tags: ['Python', 'FastAPI', 'React'] },
  ],
  totalChunks: 18600,
  chunkSize: 512,
  overlap: 64,
  embeddingModel: 'all-MiniLM-L6-v2',
};

export const knowledgeSlice = createSlice({
  name: 'knowledge',
  initialState,
  reducers: {
    setChunkSize: (state, action: PayloadAction<number>) => {
      state.chunkSize = action.payload;
    },
    setEmbeddingModel: (state, action: PayloadAction<string>) => {
      state.embeddingModel = action.payload;
    },
  },
});

export const { setChunkSize, setEmbeddingModel } = knowledgeSlice.actions;
export default knowledgeSlice.reducer;
