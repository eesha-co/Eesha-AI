'use client';

import { useCallback, useRef, useState } from 'react';
import { useChatStore, ChatMode } from '@/stores/chat-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ─── API route mapping by mode ─────────────────────────────────────────────────
const MODE_API_ROUTES: Record<ChatMode, string> = {
  code: '/api/chat',
  iluma: '/api/chat/image',
  health: '/api/chat/health',
  chat: '/api/chat/general',
};

export function useChat() {
  const {
    addConversation,
    addMessage,
    updateLastAssistantMessage,
    setIsStreaming,
    activeConversationId,
    activeMode,
    updateConversationTitle,
    setDeliberating,
    setAgentStatus,
    resetAgentStatuses,
    addImageToMessage,
    setActiveMode,
    setActiveConversation,
  } = useChatStore();

  const refreshFiles = useWorkspaceStore((s) => s.refreshFiles);
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const abortControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Persist a message to Supabase ─────────────────────────────────────────
  const persistMessage = useCallback(
    async (conversationId: string, role: string, content: string, thinking?: string) => {
      try {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, content, thinking }),
        });
      } catch {
        // Silently fail — message is still in local Zustand state
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, modeOverride?: string) => {
      setError(null);
      if (!content.trim()) return;

      // ── Require authentication ──────────────────────────────────────────
      if (sessionStatus === 'loading') return; // Wait for session to load
      if (!session?.user) {
        router.push('/signup');
        setError('Please sign in to start a conversation.');
        return;
      }

      let conversationId = activeConversationId;
      const mode = (modeOverride as ChatMode) || useChatStore.getState().activeMode;

      // If a mode override is provided, switch to it
      if (modeOverride && modeOverride !== useChatStore.getState().activeMode) {
        setActiveMode(modeOverride as ChatMode);
      }

      if (!conversationId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat', chatMode: mode }),
          });

          // If unauthorized, redirect to signup
          if (res.status === 401) {
            router.push('/signup');
            setError('Please sign in to start a conversation.');
            return;
          }

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to create conversation (HTTP ${res.status})`);
          }

          const conv = await res.json();
          conversationId = conv.id;
          addConversation({ ...conv, mode, messages: [] });

          // Update the URL to /c/[id] without full page navigation.
          // window.history.replaceState changes the URL bar without
          // triggering a Next.js re-render, which would interrupt streaming.
          const targetUrl = `/c/${conv.id}`;
          if (typeof window !== 'undefined') {
            window.history.replaceState({ ...window.history.state, url: targetUrl }, '', targetUrl);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to create conversation';
          setError(msg);
          return;
        }
      }

      if (!conversationId) {
        setError('Failed to create conversation');
        return;
      }

      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(conversationId, userMessage);

      // Persist user message to Supabase
      persistMessage(conversationId, 'user', content);

      // ─── iluma mode: Image generation (non-streaming) ──────────────
      if (mode === 'iluma') {
        const assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant' as const,
          content: '',
          images: [],
          createdAt: new Date().toISOString(),
        };
        addMessage(conversationId, assistantMessage);
        setIsStreaming(true);

        try {
          const response = await fetch('/api/chat/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: content, size: '1024x1024' }),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.image) {
            addImageToMessage(conversationId, data.image);
            const assistantContent = `Generated image for: "${content.slice(0, 100)}"`;
            updateLastAssistantMessage(conversationId, assistantContent);

            // Persist assistant message to Supabase
            persistMessage(conversationId, 'assistant', assistantContent);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to generate image';
          console.error('iluma error:', msg);
          setError(msg);
          const errorMessage = 'I encountered an issue generating the image. Please try again.';
          updateLastAssistantMessage(conversationId, errorMessage);

          // Persist error message to Supabase
          persistMessage(conversationId, 'assistant', errorMessage);
        } finally {
          setIsStreaming(false);
        }

        // Update title on first message
        const currentConv = useChatStore.getState().conversations.find(
          (c) => c.id === conversationId
        );
        if (currentConv && currentConv.messages.filter((m) => m.role === 'user').length === 1) {
          const newTitle = content.slice(0, 60) + (content.length > 60 ? '...' : '');
          updateConversationTitle(conversationId, newTitle);
          fetch('/api/conversations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: conversationId, title: newTitle }),
          }).catch(() => {});
        }

        return;
      }

      // ─── Code, Health, Chat modes: Streaming SSE ───────────────────
      const isCodeMode = mode === 'code';
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant' as const,
        content: '',
        isDeliberating: isCodeMode,
        agentStatuses: isCodeMode
          ? { architect: 'idle', security: 'idle', optimizer: 'idle' } as Record<string, 'idle' | 'working' | 'done' | 'error'>
          : undefined,
        createdAt: new Date().toISOString(),
      };
      addMessage(conversationId, assistantMessage);

      const conversation = useChatStore.getState().conversations.find(
        (c) => c.id === conversationId
      );
      const apiMessages = (conversation?.messages ?? [])
        .filter((m) => m.id !== assistantMessage.id)
        .map((m) => ({ role: m.role, content: m.content }));

      setIsStreaming(true);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const apiRoute = MODE_API_ROUTES[mode];
        const response = await fetch(apiRoute, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, conversationId }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));

          // If unauthorized, redirect to signup
          if (response.status === 401) {
            setDeliberating(conversationId, false);
            updateLastAssistantMessage(conversationId, 'Please sign in to continue.');
            setIsStreaming(false);
            resetAgentStatuses(conversationId);
            setError('Please sign in to continue.');
            router.push('/signup');
            return;
          }

          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let fullContent = '';
        let fullThinking = '';
        let toolExecuted = false;
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const eventType = parsed.type;

              // ── Committee deliberation events (code mode only) ────────
              if (eventType === 'deliberation' && isCodeMode) {
                if (parsed.status === 'started') {
                  setDeliberating(conversationId, true);
                } else if (parsed.status === 'complete') {
                  setDeliberating(conversationId, false);
                }
              }

              if (eventType === 'agent_update' && isCodeMode) {
                setAgentStatus(conversationId, parsed.agent, parsed.status);
              }

              // ── Final answer streaming ───────────────────────────────
              if (eventType === 'content' && parsed.content) {
                fullContent += parsed.content;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              // ── Thinking streaming ───────────────────────────────────
              if (eventType === 'thinking' && parsed.content) {
                fullThinking += parsed.content;
              }

              // ── Tool execution events (code mode only) ────────────────
              if (eventType === 'tool_start' && isCodeMode) {
                toolExecuted = true;
                const toolLabel = getToolLabel(parsed.tool, parsed.path, parsed.command);
                fullContent += `\n\n${toolLabel}\n`;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              if (eventType === 'tool_result' && isCodeMode) {
                const resultText = formatToolResult(parsed.tool, parsed.result);
                fullContent += `${resultText}\n`;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              // ── Error ────────────────────────────────────────────────
              if (eventType === 'error') {
                console.error('Stream error:', parsed.content);
                setDeliberating(conversationId, false);
                if (fullContent) {
                  fullContent += `\n\n*Note: There was an issue. Some content may be incomplete.*`;
                  updateLastAssistantMessage(conversationId, fullContent);
                } else {
                  fullContent = 'I encountered an issue processing your request. Please try again.';
                  updateLastAssistantMessage(conversationId, fullContent);
                }
                setError(parsed.content);
              }
            } catch { /* skip malformed JSON */ }
          }
        }

        // Refresh workspace if tools were executed
        if (toolExecuted) {
          refreshFiles();
        }

        // Persist the final assistant message to Supabase
        if (fullContent) {
          persistMessage(conversationId, 'assistant', fullContent, fullThinking || undefined);
        }

        // Update title on first message
        const currentConv = useChatStore.getState().conversations.find(
          (c) => c.id === conversationId
        );
        if (currentConv && currentConv.messages.filter((m) => m.role === 'user').length === 1) {
          const newTitle = content.slice(0, 60) + (content.length > 60 ? '...' : '');
          updateConversationTitle(conversationId, newTitle);
          fetch('/api/conversations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: conversationId, title: newTitle }),
          }).catch(() => {});
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const msg = err instanceof Error ? err.message : 'Failed to get response';
        console.error('Chat error:', msg);
        setError(msg);

        const currentConv = useChatStore.getState().conversations.find(
          (c) => c.id === conversationId
        );
        const lastMsg = currentConv?.messages[currentConv.messages.length - 1];
        if (!lastMsg?.content || lastMsg.content.trim() === '') {
          const errorMessage = 'I encountered an issue processing your request. Please try again.';
          updateLastAssistantMessage(conversationId, errorMessage);

          // Persist error message
          persistMessage(conversationId, 'assistant', errorMessage);
        }
      } finally {
        setIsStreaming(false);
        setDeliberating(conversationId, false);
        resetAgentStatuses(conversationId);
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, activeMode, addConversation, addMessage, updateLastAssistantMessage, setIsStreaming, updateConversationTitle, refreshFiles, setDeliberating, setAgentStatus, resetAgentStatuses, addImageToMessage, router, setActiveMode, setActiveConversation, persistMessage, session?.user, sessionStatus]
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return { sendMessage, stopStreaming, error, setError };
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function getToolLabel(tool: string, filePath: string, command: string): string {
  switch (tool) {
    case 'create_file':
      return `**Creating file:** \`${filePath}\``;
    case 'edit_file':
      return `**Editing file:** \`${filePath}\``;
    case 'read_file':
      return `**Reading file:** \`${filePath}\``;
    case 'delete_file':
      return `**Deleting:** \`${filePath}\``;
    case 'list_dir':
      return `**Listing directory:** \`${filePath || '/'}\``;
    case 'run_command':
      return `**Running command:** \`${command}\``;
    default:
      return `**Executing:** ${tool}`;
  }
}

function formatToolResult(tool: string, result: string): string {
  const maxLength = 2000;
  const truncated = result.length > maxLength
    ? result.slice(0, maxLength) + '\n... (output truncated)'
    : result;

  switch (tool) {
    case 'create_file':
      return `<details><summary>File created</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'edit_file':
      return `<details><summary>File edited</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'run_command':
      return `<details><summary>Command output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'read_file':
      return `<details><summary>File contents</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'delete_file':
      return truncated;
    case 'list_dir':
      return `<details><summary>Directory listing</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    default:
      return truncated;
  }
}
