'use client';

import { useEffect, useCallback, useState } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useChat } from '@/hooks/use-chat';
import { Sidebar } from '@/components/chat/sidebar';
import { ChatArea } from '@/components/chat/chat-area';
import { InputArea } from '@/components/chat/input-area';
import { EmptyState } from '@/components/chat/empty-state';
import { Header } from '@/components/chat/header';
import { FileExplorer } from '@/components/workspace/file-explorer';
import { CodeEditor } from '@/components/workspace/code-editor';
import { TerminalPanel } from '@/components/workspace/terminal';
import { Button } from '@/components/ui/button';
import { Code2, Terminal, MessageSquare } from 'lucide-react';
import { SmokyBackground } from '@/components/chat/smoky-background';

type ActivePanel = 'chat' | 'workspace' | 'terminal';

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

  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

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
      setTimeout(() => {
        sendMessage(content);
      }, 0);
    },
    [setActiveConversation, sendMessage]
  );

  const toggleWorkspace = useCallback(() => {
    setShowWorkspace((prev) => !prev);
  }, []);

  const toggleTerminal = useCallback(() => {
    setShowTerminal((prev) => !prev);
  }, []);

  const hasSidePanel = showWorkspace || showTerminal;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Canvas background — draws ALL visual effects */}
      <SmokyBackground />

      {/* Sidebar — semi-transparent so effects glow through */}
      <Sidebar />

      {/* Main content area — TRANSPARENT background so canvas shows through */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden" style={{ zIndex: 1 }}>
        {/* Header bar — glass morphism, semi-transparent */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 dark:border-white/5 bg-background/60 dark:bg-black/40 px-3 backdrop-blur-xl">
          <Header />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${!hasSidePanel ? 'bg-white/10 dark:bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => { setShowWorkspace(false); setShowTerminal(false); }}
            >
              <MessageSquare className="size-3" />Chat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${showWorkspace ? 'bg-white/10 dark:bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={toggleWorkspace}
            >
              <Code2 className="size-3" />Workspace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${showTerminal ? 'bg-white/10 dark:bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={toggleTerminal}
            >
              <Terminal className="size-3" />Terminal
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Chat panel — TRANSPARENT so effects show through */}
          <div className={`flex flex-col min-w-0 overflow-hidden ${
            hasSidePanel ? 'w-1/2 border-r border-white/5 dark:border-white/5' : 'flex-1'
          }`}>
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
            <InputArea onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
          </div>

          {/* Side panel area — semi-transparent panels */}
          {hasSidePanel && (
            <div className="flex flex-col w-1/2 min-w-0 overflow-hidden">
              {/* Workspace only */}
              {showWorkspace && !showTerminal && (
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <div className="w-52 shrink-0 overflow-hidden"><FileExplorer /></div>
                  <div className="flex-1 min-w-0 overflow-hidden"><CodeEditor /></div>
                </div>
              )}

              {/* Terminal only */}
              {showTerminal && !showWorkspace && (
                <div className="flex-1 min-h-0 overflow-hidden"><TerminalPanel /></div>
              )}

              {/* Both workspace and terminal */}
              {showWorkspace && showTerminal && (
                <>
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    <div className="w-44 shrink-0 overflow-hidden"><FileExplorer /></div>
                    <div className="flex-1 min-w-0 overflow-hidden"><CodeEditor /></div>
                  </div>
                  <div className="h-48 shrink-0 border-t border-white/5 dark:border-white/5 overflow-hidden">
                    <TerminalPanel />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
