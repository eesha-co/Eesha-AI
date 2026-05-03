'use client';

import { useChatStore } from '@/stores/chat-store';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModeSelector } from '@/components/chat/mode-selector';

export function Header() {
  const { sidebarOpen, setSidebarOpen, activeConversationId, conversations } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const showTitle = activeConversation && activeConversationId;

  return (
    <div className="flex items-center gap-2">
      {!sidebarOpen && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-foreground/20 hover:text-foreground/50"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-3.5" />
          </Button>
          <img src="/splash-screen.png" alt="Eesha AI" className="h-9 w-auto object-contain opacity-50" />
        </>
      )}
      {showTitle ? (
        <h1 className="max-w-[300px] sm:max-w-[400px] truncate text-[13px] font-normal text-foreground/30">
          {activeConversation.title}
        </h1>
      ) : (
        <ModeSelector />
      )}
    </div>
  );
}
