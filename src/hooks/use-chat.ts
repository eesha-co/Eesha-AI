'use client';

import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function useChat() {
  const {
    addConversation,
    addMessage,
    updateLastAssistantMessage,
    setIsStreaming,
    activeConversationId,
    updateConversationTitle,
    setDeliberating,
    setAgentStatus,
    resetAgentStatuses,
  } = useChatStore();

  const refreshFiles = useWorkspaceStore((s) => s.refreshFiles);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);
      if (!content.trim()) return;

      let conversationId = activeConversationId;

      if (!conversationId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' }),
          });
          const conv = await res.json();
          conversationId = conv.id;
          addConversation({ ...conv, messages: [] });
        } catch {
          setError('Failed to create conversation');
          return;
        }
      }

      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(conversationId, userMessage);

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant' as const,
        content: '',
        isDeliberating: true,
        agentStatuses: { architect: 'idle', security: 'idle', optimizer: 'idle' } as Record<string, 'idle' | 'working' | 'done' | 'error'>,
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
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, conversationId }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));

          // ── Handle free tier limit reached ────────────────────────────
          if (errData.error === 'FREE_LIMIT_REACHED') {
            setDeliberating(conversationId, false);
            updateLastAssistantMessage(
              conversationId,
              `You've used all ${errData.creditsMax || 5} free messages! 🎉\n\nSign in to get **unlimited access** to Eesha AI:\n- Unlimited chat messages\n- Workspace & file management\n- Terminal access\n- Conversation history saved\n\n[Click here to sign in →](/login)`
            );
            setIsStreaming(false);
            resetAgentStatuses(conversationId);
            setError('FREE_LIMIT_REACHED');
            return;
          }

          // ── Handle terminal requires auth ─────────────────────────────
          if (errData.error === 'SIGN_IN_REQUIRED') {
            setError('Sign in required for this feature.');
            return;
          }

          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let fullContent = '';
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

              // ── Committee deliberation events ────────────────────────
              if (eventType === 'deliberation') {
                if (parsed.status === 'started') {
                  setDeliberating(conversationId, true);
                } else if (parsed.status === 'synthesizing') {
                  // Still deliberating, now synthesizing
                } else if (parsed.status === 'complete') {
                  setDeliberating(conversationId, false);
                }
              }

              if (eventType === 'agent_update') {
                setAgentStatus(conversationId, parsed.agent, parsed.status);
              }

              // ── Final answer streaming ───────────────────────────────
              if (eventType === 'content' && parsed.content) {
                fullContent += parsed.content;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              // ── Tool execution events ────────────────────────────────
              if (eventType === 'tool_start') {
                toolExecuted = true;
                const toolLabel = getToolLabel(parsed.tool, parsed.path, parsed.command);
                fullContent += `\n\n${toolLabel}\n`;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              if (eventType === 'tool_result' && parsed.result) {
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
          updateLastAssistantMessage(
            conversationId,
            'I encountered an issue processing your request. Please try again.'
          );
        }
      } finally {
        setIsStreaming(false);
        setDeliberating(conversationId, false);
        resetAgentStatuses(conversationId);
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, addConversation, addMessage, updateLastAssistantMessage, setIsStreaming, updateConversationTitle, refreshFiles, setDeliberating, setAgentStatus, resetAgentStatuses]
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
