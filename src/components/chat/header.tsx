'use client';

import { useChatStore } from '@/stores/chat-store';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const { sidebarOpen, setSidebarOpen, activeConversationId, conversations } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const showTitle = activeConversation && activeConversationId;

  return (
    <div className="flex items-center gap-4">
      {!sidebarOpen && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-5" />
          </Button>
          <img src="/splash-screen.png" alt="Eesha AI" className="h-10 w-auto object-contain" />
        </>
      )}
      {showTitle && (
        <>
          <div className="h-5 w-px bg-border" />
          <h1 className="max-w-[400px] truncate text-base font-medium text-muted-foreground">
            {activeConversation.title}
          </h1>
        </>
      )}
    </div>
  );
}
