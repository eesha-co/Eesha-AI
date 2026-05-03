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
import { Code2, Terminal } from 'lucide-react';
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
    activeMode,
  } = useChatStore();

  const { sendMessage, stopStreaming } = useChat();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const hasMessages = activeConversation && activeConversation.messages.length > 0;

  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);

  // Only code mode gets workspace/terminal
  const isCodeMode = activeMode === 'code';

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch('/api/conversations');
        if (res.ok) {
          const data = await res.json();
          // Ensure all conversations have a mode (backward compat)
          const normalized = data.map((c: Record<string, unknown>) => ({
            ...c,
            mode: (c.mode as string) || (c.chatMode as string) || 'code',
          }));
          setConversations(normalized);
        }
      } catch {
        // silently fail
      }
    };
    loadConversations();
  }, [setConversations]);

  // Reset workspace when switching away from code mode
  useEffect(() => {
    if (!isCodeMode) {
      setShowWorkspace(false);
      setShowTerminal(false);
    }
  }, [isCodeMode]);

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

  const hasSidePanel = isCodeMode && (showWorkspace || showTerminal);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* CSS gradient background */}
      <SmokyBackground />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area — borderless, transparent */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden" style={{ zIndex: 1 }}>
        {/* Header bar — nearly invisible */}
        <div className="flex h-11 shrink-0 items-center justify-between bg-transparent border-b border-transparent px-4">
          <Header />
          <div className="flex items-center gap-1">
            {/* Panel toggle — only in code mode */}
            {isCodeMode && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-7 ${hasSidePanel ? 'text-foreground/60' : 'text-foreground/20 hover:text-foreground/50'}`}
                  onClick={() => {
                    if (!hasSidePanel) {
                      setShowWorkspace(true);
                    } else if (showWorkspace) {
                      setShowWorkspace(false);
                      setShowTerminal(true);
                    } else {
                      setShowTerminal(false);
                    }
                  }}
                  title={!hasSidePanel ? 'Open Workspace' : showWorkspace ? 'Switch to Terminal' : 'Close Panel'}
                >
                  {!hasSidePanel ? (
                    <Code2 className="size-3.5" />
                  ) : showWorkspace ? (
                    <Terminal className="size-3.5" />
                  ) : (
                    <Code2 className="size-3.5" />
                  )}
                </Button>
                {hasSidePanel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-foreground/20 hover:text-foreground/50"
                    onClick={() => { setShowWorkspace(false); setShowTerminal(false); }}
                    title="Close Panel"
                  >
                    <span className="text-sm leading-none">×</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Main content area — responsive, borderless */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Chat panel */}
          <div className={`flex flex-col min-w-0 overflow-hidden ${
            hasSidePanel
              ? 'w-full sm:w-1/2'
              : 'flex-1'
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

          {/* Side panel area — desktop, code mode only */}
          {hasSidePanel && (
            <div className="hidden sm:flex flex-col w-1/2 min-w-0 overflow-hidden border-l border-[var(--border-subtle)]">
              {showWorkspace && !showTerminal && (
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <div className="w-52 shrink-0 overflow-hidden"><FileExplorer /></div>
                  <div className="flex-1 min-w-0 overflow-hidden border-l border-[var(--border-subtle)]"><CodeEditor /></div>
                </div>
              )}

              {showTerminal && !showWorkspace && (
                <div className="flex-1 min-h-0 overflow-hidden"><TerminalPanel /></div>
              )}

              {showWorkspace && showTerminal && (
                <>
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    <div className="w-44 shrink-0 overflow-hidden"><FileExplorer /></div>
                    <div className="flex-1 min-w-0 overflow-hidden border-l border-[var(--border-subtle)]"><CodeEditor /></div>
                  </div>
                  <div className="h-48 shrink-0 border-t border-[var(--border-subtle)] overflow-hidden">
                    <TerminalPanel />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mobile: Side panel as overlay, code mode only */}
          {hasSidePanel && (
            <div className="sm:hidden fixed inset-0 top-11 z-50 bg-background/95 backdrop-blur-md">
              <div className="flex flex-col h-full">
                {showWorkspace && !showTerminal && (
                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    <div className="w-16 shrink-0 overflow-hidden"><FileExplorer /></div>
                    <div className="flex-1 min-w-0 overflow-hidden"><CodeEditor /></div>
                  </div>
                )}
                {showTerminal && !showWorkspace && (
                  <div className="flex-1 min-h-0 overflow-hidden"><TerminalPanel /></div>
                )}
                {showWorkspace && showTerminal && (
                  <>
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                      <div className="w-16 shrink-0 overflow-hidden"><FileExplorer /></div>
                      <div className="flex-1 min-w-0 overflow-hidden"><CodeEditor /></div>
                    </div>
                    <div className="h-48 shrink-0 border-t border-[var(--border-subtle)] overflow-hidden">
                      <TerminalPanel />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
