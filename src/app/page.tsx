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
    setSidebarOpen,
  } = useChatStore();

  const { sendMessage, stopStreaming } = useChat();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const hasMessages = activeConversation && activeConversation.messages.length > 0;

  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  // Auto-close sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen, setSidebarOpen]);

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

  // On mobile, workspace/terminal show as full-width overlay instead of split
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="flex h-screen bg-background">
      {/* Smoky background effect */}
      <SmokyBackground />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar with panel toggles */}
        <div className="flex h-12 sm:h-11 items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl px-2 sm:px-3">
          <Header />

          {/* Panel toggle buttons - hidden on very small screens, visible on sm+ */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 sm:h-7 gap-1 sm:gap-1.5 text-[11px] sm:text-xs px-2 sm:px-3 ${!showWorkspace && !showTerminal ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => { setShowWorkspace(false); setShowTerminal(false); }}
            >
              <MessageSquare className="size-3" />
              <span className="hidden xs:inline">Chat</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 sm:h-7 gap-1 sm:gap-1.5 text-[11px] sm:text-xs px-2 sm:px-3 ${showWorkspace ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowWorkspace(!showWorkspace)}
            >
              <Code2 className="size-3" />
              <span className="hidden sm:inline">Workspace</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 sm:h-7 gap-1 sm:gap-1.5 text-[11px] sm:text-xs px-2 sm:px-3 ${showTerminal ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowTerminal(!showTerminal)}
            >
              <Terminal className="size-3" />
              <span className="hidden sm:inline">Terminal</span>
            </Button>
          </div>
        </div>

        {/* Content area with panels */}
        <div className="flex flex-1 min-h-0">
          {/* Chat panel - full width on mobile when no panels, half on desktop */}
          <div className={`flex flex-col ${
            showWorkspace || showTerminal
              ? 'hidden md:flex md:w-1/2 md:border-r md:border-border'
              : 'flex flex-1'
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
            <InputArea
              onSend={sendMessage}
              onStop={stopStreaming}
              isStreaming={isStreaming}
            />
          </div>

          {/* Mobile: show workspace/terminal as full-width */}
          {(showWorkspace || showTerminal) && (
            <>
              {/* Mobile full-width panels */}
              <div className="flex flex-1 md:hidden min-h-0">
                {showWorkspace && !showTerminal && (
                  <div className="flex w-full min-w-0">
                    <div className="w-16 sm:w-40 shrink-0">
                      <FileExplorer />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CodeEditor />
                    </div>
                  </div>
                )}
                {showTerminal && !showWorkspace && (
                  <div className="w-full min-w-0">
                    <TerminalPanel />
                  </div>
                )}
                {showWorkspace && showTerminal && (
                  <div className="flex w-full min-w-0 flex-col">
                    <div className="flex flex-1 min-h-0">
                      <div className="w-16 sm:w-36 shrink-0">
                        <FileExplorer />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CodeEditor />
                      </div>
                    </div>
                    <div className="h-36 shrink-0 border-t border-border">
                      <TerminalPanel />
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop split panels */}
              {/* Workspace panel */}
              {showWorkspace && (
                <div className="hidden md:flex md:w-1/2 min-w-0">
                  <div className="w-48 shrink-0">
                    <FileExplorer />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CodeEditor />
                  </div>
                </div>
              )}

              {/* Terminal panel */}
              {showTerminal && !showWorkspace && (
                <div className="hidden md:block md:w-1/2 min-w-0">
                  <TerminalPanel />
                </div>
              )}

              {/* Both workspace and terminal */}
              {showWorkspace && showTerminal && (
                <div className="hidden md:flex md:w-1/2 min-w-0 flex-col">
                  <div className="flex flex-1 min-h-0">
                    <div className="w-44 shrink-0">
                      <FileExplorer />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CodeEditor />
                    </div>
                  </div>
                  <div className="h-48 shrink-0 border-t border-border">
                    <TerminalPanel />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
