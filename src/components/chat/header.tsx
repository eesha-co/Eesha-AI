'use client';

import { useChatStore } from '@/stores/chat-store';
import { PanelLeft, Share, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const { sidebarOpen, setSidebarOpen, activeConversationId, conversations } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const showTitle = activeConversation && activeConversationId;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0a0a12]/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-500 hover:text-zinc-300"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft className="size-4" />
            </Button>
            <div className="flex items-center gap-1.5">
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-sm font-semibold text-transparent">
                Kimi K2.5
              </span>
            </div>
          </>
        )}
        {showTitle && (
          <h1 className="max-w-[300px] truncate text-sm font-medium text-zinc-300 sm:max-w-[500px]">
            {activeConversation.title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-1">
        {activeConversationId && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-500 hover:text-zinc-300"
            >
              <Share className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-500 hover:text-zinc-300"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
