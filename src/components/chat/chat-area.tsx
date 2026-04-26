'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { Message } from '@/components/chat/message';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatAreaProps {
  onRegenerate?: () => void;
}

export function ChatArea({ onRegenerate }: ChatAreaProps) {
  const { conversations, activeConversationId, isStreaming } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, messages.length, isStreaming]);

  if (!activeConversation) return null;

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-[768px] px-4 py-6">
        <div className="flex flex-col gap-6">
          {messages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              isStreaming={
                isStreaming &&
                index === messages.length - 1 &&
                message.role === 'assistant'
              }
              onRegenerate={
                message.role === 'assistant' && index === messages.length - 1
                  ? onRegenerate
                  : undefined
              }
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </ScrollArea>
  );
}
