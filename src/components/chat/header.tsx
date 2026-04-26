'use client';

import { useChatStore } from '@/stores/chat-store';
import { PanelLeft, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const { sidebarOpen, setSidebarOpen, activeConversationId, conversations } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const showTitle = activeConversation && activeConversationId;

  return (
    <div className="flex items-center gap-3">
      {!sidebarOpen && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-cyan-600">
              <Code2 className="size-3 text-white" />
            </div>
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-sm font-semibold text-transparent">
              Kimi K2.5
            </span>
          </div>
        </>
      )}
      {showTitle && (
        <>
          <div className="h-4 w-px bg-white/[0.06]" />
          <h1 className="max-w-[300px] truncate text-sm font-medium text-zinc-400">
            {activeConversation.title}
          </h1>
        </>
      )}
    </div>
  );
}
