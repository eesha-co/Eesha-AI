'use client';

import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';

export function useChat() {
  const {
    addConversation,
    addMessage,
    updateLastAssistantMessage,
    setIsStreaming,
    activeConversationId,
    updateConversationTitle,
  } = useChatStore();

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
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  updateLastAssistantMessage(conversationId, fullContent);
                }
                if (parsed.error) setError(parsed.error);
              } catch { /* skip */ }
            }
          }
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
          // cancelled
        } else {
          const msg = err instanceof Error ? err.message : 'Failed to get response';
          setError(msg);
          updateLastAssistantMessage(
            conversationId,
            '⚠️ Unable to generate a response. Please check your NVIDIA API key and try again.'
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, addConversation, addMessage, updateLastAssistantMessage, setIsStreaming, updateConversationTitle]
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return { sendMessage, stopStreaming, error, setError };
}
