import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Citation {
  docName: string;
  page: string;
  score: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  timestamp: string;
}

export interface ChatThread {
  id: string;
  title: string;
  time: string;
  messages: ChatMessage[];
}

interface ChatState {
  threads: ChatThread[];
  activeThreadId: string;
  selectedModel: string;
  isStreaming: boolean;
}

const initialState: ChatState = {
  threads: [
    {
      id: '1',
      title: 'Quantum Computing Overview',
      time: '10m ago',
      messages: [
        {
          id: '1',
          sender: 'assistant',
          text: 'Hello Arjun! I am your local CogniDesk AI Assistant running on Qwen 2.5 7B. How can I help you analyze your documents today?',
          citations: [],
          timestamp: '10:42 AM',
        },
      ],
    },
    {
      id: '2',
      title: 'Q4 Financial Report PDF',
      time: '2h ago',
      messages: [],
    },
    {
      id: '3',
      title: 'FastAPI Backend Architecture',
      time: 'Yesterday',
      messages: [],
    },
    {
      id: '4',
      title: 'Biology Flashcards Review',
      time: '3d ago',
      messages: [],
    },
  ],
  activeThreadId: '1',
  selectedModel: 'Qwen 2.5 7B',
  isStreaming: false,
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveThreadId: (state, action: PayloadAction<string>) => {
      state.activeThreadId = action.payload;
    },
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModel = action.payload;
    },
    setIsStreaming: (state, action: PayloadAction<boolean>) => {
      state.isStreaming = action.payload;
    },
    addMessageToThread: (
      state,
      action: PayloadAction<{ threadId: string; message: ChatMessage }>
    ) => {
      const thread = state.threads.find((t) => t.id === action.payload.threadId);
      if (thread) {
        thread.messages.push(action.payload.message);
      }
    },
    createNewThread: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const newThread: ChatThread = {
        id: action.payload.id,
        title: action.payload.title,
        time: 'Just now',
        messages: [],
      };
      state.threads.unshift(newThread);
      state.activeThreadId = action.payload.id;
    },
  },
});

export const {
  setActiveThreadId,
  setSelectedModel,
  setIsStreaming,
  addMessageToThread,
  createNewThread,
} = chatSlice.actions;
export default chatSlice.reducer;
