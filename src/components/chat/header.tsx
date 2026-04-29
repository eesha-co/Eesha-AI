'use client';

import { useChatStore } from '@/stores/chat-store';
import { PanelLeft, LogIn, User, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession, signIn } from 'next-auth/react';

export function Header() {
  const { sidebarOpen, setSidebarOpen, activeConversationId, conversations } = useChatStore();
  const { data: session } = useSession();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const showTitle = activeConversation && activeConversationId;

  return (
    <div className="flex items-center gap-3">
      {!sidebarOpen && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="bg-gradient-to-r from-violet-500 to-cyan-500 bg-clip-text text-sm font-semibold text-transparent">
            Eesha AI
          </span>
        </>
      )}
      {showTitle && (
        <>
          <div className="h-4 w-px bg-border" />
          <h1 className="max-w-[300px] truncate text-sm font-medium text-muted-foreground">
            {activeConversation.title}
          </h1>
        </>
      )}

      {/* Auth section — pushed to the right via parent's justify-between */}
      <div className="flex items-center gap-2 ml-auto">
        {session?.user ? (
          /* ── Authenticated: Show user name ── */
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-600 text-xs font-bold text-white">
              {session.user.name?.[0]?.toUpperCase() || <User className="size-3.5" />}
            </div>
            <span className="hidden sm:inline text-xs font-medium text-foreground max-w-[120px] truncate">
              {session.user.name || session.user.email?.split('@')[0] || 'User'}
            </span>
          </div>
        ) : (
          /* ── Not authenticated: Show Login & Sign Up buttons ── */
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => signIn(undefined, { callbackUrl: '/' })}
            >
              <LogIn className="size-3" />
              Log in
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0"
              onClick={() => signIn(undefined, { callbackUrl: '/' })}
            >
              <Sparkles className="size-3" />
              Sign up
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
