'use client';

import { useChatStore, ChatMode } from '@/stores/chat-store';
import { PanelLeft, Code2, Image, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MODE_ICONS: Record<ChatMode, typeof Code2> = {
  code: Code2,
  iluma: Image,
  health: Heart,
  chat: MessageCircle,
};

const MODE_LABELS: Record<ChatMode, string> = {
  code: 'Code',
  iluma: 'iluma',
  health: 'Health',
  chat: 'Chat',
};

const MODE_COLORS: Record<ChatMode, string> = {
  code: 'text-violet-400',
  iluma: 'text-emerald-400',
  health: 'text-rose-400',
  chat: 'text-amber-400',
};

export function Header() {
  const { sidebarOpen, setSidebarOpen, activeConversationId, conversations, activeMode } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const showTitle = activeConversation && activeConversationId;

  const ModeIcon = MODE_ICONS[activeMode];
  const modeLabel = MODE_LABELS[activeMode];
  const modeColor = MODE_COLORS[activeMode];

  return (
    <div className="flex items-center gap-2">
      {!sidebarOpen && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-3.5" />
          </Button>
          <img src="/splash-screen.png" alt="Eesha AI" className="h-9 w-auto object-contain opacity-50" />
        </>
      )}
      {showTitle ? (
        <h1 className="max-w-[300px] sm:max-w-[400px] truncate text-[13px] font-normal text-[var(--text-secondary)]">
          {activeConversation.title}
        </h1>
      ) : (
        <div className="flex items-center gap-1.5">
          <ModeIcon className={`size-3.5 ${modeColor}`} />
          <span className={`text-[12px] font-medium ${modeColor} opacity-60`}>
            {modeLabel}
          </span>
        </div>
      )}
    </div>
  );
}
