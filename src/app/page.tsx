'use client';

import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useChat } from '@/hooks/use-chat';
import { Sidebar } from '@/components/chat/sidebar';
import { ChatArea } from '@/components/chat/chat-area';
import { InputArea } from '@/components/chat/input-area';
import { EmptyState } from '@/components/chat/empty-state';
import { Header } from '@/components/chat/header';

export default function Home() {
  const {
    conversations,
    activeConversationId,
    setConversations,
    setActiveConversation,
    isStreaming,
    sidebarOpen,
  } = useChatStore();

  const { sendMessage, stopStreaming } = useChat();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const hasMessages = activeConversation && activeConversation.messages.length > 0;

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch('/api/conversations');
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch {
        // silently fail
      }
    };
    loadConversations();
  }, [setConversations]);

  const handleSuggestionClick = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleNewChatAndSend = useCallback(
    (content: string) => {
      setActiveConversation(null);
      // Use setTimeout to allow state update before sending
      setTimeout(() => {
        sendMessage(content);
      }, 0);
    },
    [setActiveConversation, sendMessage]
  );

  return (
    <div className="flex h-screen bg-[#0a0a12]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <Header />

        {/* Chat or Empty State */}
        {hasMessages ? (
          <ChatArea onRegenerate={() => {
            if (activeConversation) {
              const lastUserMsg = [...activeConversation.messages].reverse().find((m) => m.role === 'user');
              if (lastUserMsg) sendMessage(lastUserMsg.content);
            }
          }} />
        ) : (
          <EmptyState onSuggestionClick={handleNewChatAndSend} />
        )}

        {/* Input */}
        <InputArea
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
