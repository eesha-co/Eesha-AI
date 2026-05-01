import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  isThinking?: boolean;
  // Committee state
  isDeliberating?: boolean;
  agentStatuses?: Record<string, 'idle' | 'working' | 'done' | 'error'>;
  createdAt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;
  sidebarOpen: boolean;
  themeMode: ThemeMode;
  freeCreditsUsed: number; // Track anonymous free messages
  showLoginPrompt: boolean; // Show login prompt modal

  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setFreeCreditsUsed: (used: number) => void;
  incrementFreeCredits: () => void;
  setShowLoginPrompt: (show: boolean) => void;

  addConversation: (conversation: Conversation) => void;
  deleteConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;

  addMessage: (conversationId: string, message: Message) => void;
  updateLastAssistantMessage: (conversationId: string, content: string) => void;
  appendThinking: (conversationId: string, thinking: string) => void;
  setThinkingDone: (conversationId: string) => void;

  // Committee methods
  setDeliberating: (conversationId: string, value: boolean) => void;
  setAgentStatus: (conversationId: string, agent: string, status: 'idle' | 'working' | 'done' | 'error') => void;
  resetAgentStatuses: (conversationId: string) => void;

  getActiveConversation: () => Conversation | undefined;
}

function getInitialTheme(): ThemeMode {
  // Always use system preference — no localStorage
  return 'system';
}

function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const shouldBeDark = mode === 'dark' || (mode === 'system' && dark.matches);
  if (shouldBeDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  // No localStorage — theme follows system preference in production
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,
  sidebarOpen: true,
  themeMode: getInitialTheme(),
  freeCreditsUsed: typeof window !== 'undefined' ? (() => {
    try {
      const match = document.cookie.match(/eesha-free-credits=([^;]+)/);
      if (match) {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        return parsed.used || 0;
      }
    } catch {}
    return 0;
  })() : 0,
  showLoginPrompt: false,

  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setThemeMode: (mode) => {
    applyTheme(mode);
    set({ themeMode: mode });
  },

  setFreeCreditsUsed: (used) => set({ freeCreditsUsed: used }),
  incrementFreeCredits: () => set((state) => ({ freeCreditsUsed: state.freeCreditsUsed + 1 })),
  setShowLoginPrompt: (show) => set({ showLoginPrompt: show }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
    })),

  deleteConversation: (id) =>
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== id);
      return {
        conversations: remaining,
        activeConversationId:
          state.activeConversationId === id
            ? remaining[0]?.id ?? null
            : state.activeConversationId,
      };
    }),

  updateConversationTitle: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    })),

  addMessage: (conversationId, message) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, message] }
          : c
      ),
    })),

  updateLastAssistantMessage: (conversationId, content) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = { ...messages[lastIdx], content };
        }
        return { ...c, messages };
      }),
    })),

  appendThinking: (conversationId, thinking) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          const prev = messages[lastIdx];
          messages[lastIdx] = {
            ...prev,
            thinking: (prev.thinking || '') + thinking,
            isThinking: true,
          };
        }
        return { ...c, messages };
      }),
    })),

  setThinkingDone: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = { ...messages[lastIdx], isThinking: false };
        }
        return { ...c, messages };
      }),
    })),

  // Committee methods
  setDeliberating: (conversationId, value) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = { ...messages[lastIdx], isDeliberating: value };
        }
        return { ...c, messages };
      }),
    })),

  setAgentStatus: (conversationId, agent, status) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          const prev = messages[lastIdx];
          messages[lastIdx] = {
            ...prev,
            agentStatuses: { ...prev.agentStatuses, [agent]: status },
          };
        }
        return { ...c, messages };
      }),
    })),

  resetAgentStatuses: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = {
            ...messages[lastIdx],
            agentStatuses: { architect: 'idle', security: 'idle', optimizer: 'idle' },
            isDeliberating: false,
          };
        }
        return { ...c, messages };
      }),
    })),

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },
}));
