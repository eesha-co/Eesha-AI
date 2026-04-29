import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export type AgentName = 'specialist' | 'critic' | 'judge';

export interface AgentSection {
  agent: AgentName;
  content: string;
  thinking?: string;
  isThinking?: boolean;
  status: 'waiting' | 'thinking' | 'generating' | 'done' | 'error';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  isThinking?: boolean;
  agentSections?: AgentSection[];
  activeAgent?: AgentName | null;
  pipelineStatus?: string | null;
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

  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;

  addConversation: (conversation: Conversation) => void;
  deleteConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;

  addMessage: (conversationId: string, message: Message) => void;
  updateLastAssistantMessage: (conversationId: string, content: string) => void;
  appendThinking: (conversationId: string, thinking: string) => void;
  setThinkingDone: (conversationId: string) => void;

  // Multi-agent methods
  updateAgentSection: (conversationId: string, agent: AgentName, updates: Partial<AgentSection>) => void;
  appendAgentContent: (conversationId: string, agent: AgentName, content: string) => void;
  appendAgentThinking: (conversationId: string, agent: AgentName, thinking: string) => void;
  setActiveAgent: (conversationId: string, agent: AgentName | null) => void;
  setPipelineStatus: (conversationId: string, status: string | null) => void;
  setAgentStatus: (conversationId: string, agent: AgentName, status: AgentSection['status']) => void;

  getActiveConversation: () => Conversation | undefined;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem('eesha-theme');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.mode || 'system';
    }
  } catch {}
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

  try {
    localStorage.setItem('eesha-theme', JSON.stringify({ mode }));
  } catch {}
}

// Helper: get or create agent section in last assistant message
function updateAgentSectionsInMessage(
  messages: Message[],
  agent: AgentName,
  updater: (section: AgentSection) => AgentSection,
): Message[] {
  const newMessages = [...messages];
  const lastIdx = newMessages.length - 1;
  if (lastIdx < 0 || newMessages[lastIdx].role !== 'assistant') return newMessages;

  const msg = { ...newMessages[lastIdx] };
  const sections = [...(msg.agentSections || [])];

  const existIdx = sections.findIndex(s => s.agent === agent);
  if (existIdx >= 0) {
    sections[existIdx] = updater({ ...sections[existIdx] });
  } else {
    sections.push(updater({ agent, content: '', thinking: '', status: 'waiting' }));
  }

  msg.agentSections = sections;
  newMessages[lastIdx] = msg;
  return newMessages;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,
  sidebarOpen: true,
  themeMode: getInitialTheme(),

  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setThemeMode: (mode) => {
    applyTheme(mode);
    set({ themeMode: mode });
  },

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

  // Multi-agent methods
  updateAgentSection: (conversationId, agent, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, messages: updateAgentSectionsInMessage(c.messages, agent, (section) => ({ ...section, ...updates })) };
      }),
    })),

  appendAgentContent: (conversationId, agent, content) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, messages: updateAgentSectionsInMessage(c.messages, agent, (section) => ({ ...section, content: section.content + content })) };
      }),
    })),

  appendAgentThinking: (conversationId, agent, thinking) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, messages: updateAgentSectionsInMessage(c.messages, agent, (section) => ({ ...section, thinking: (section.thinking || '') + thinking, isThinking: true })) };
      }),
    })),

  setActiveAgent: (conversationId, agent) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = { ...messages[lastIdx], activeAgent: agent };
        }
        return { ...c, messages };
      }),
    })),

  setPipelineStatus: (conversationId, status) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const messages = [...c.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
          messages[lastIdx] = { ...messages[lastIdx], pipelineStatus: status };
        }
        return { ...c, messages };
      }),
    })),

  setAgentStatus: (conversationId, agent, status) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return { ...c, messages: updateAgentSectionsInMessage(c.messages, agent, (section) => ({ ...section, status })) };
      }),
    })),

  getActiveConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },
}));
