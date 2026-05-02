'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore, ThemeMode, Conversation } from '@/stores/chat-store';
import { Plus, MessageSquare, Trash2, PanelLeftClose, Search, Settings, X, Sun, Moon, Monitor, LogOut, User, LogIn, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSession, signOut } from 'next-auth/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; conversations: Conversation[] }[] = [
    { label: 'Today', conversations: [] },
    { label: 'Yesterday', conversations: [] },
    { label: 'Previous 7 Days', conversations: [] },
    { label: 'Previous 30 Days', conversations: [] },
    { label: 'Older', conversations: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    if (date >= today) groups[0].conversations.push(conv);
    else if (date >= yesterday) groups[1].conversations.push(conv);
    else if (date >= sevenDaysAgo) groups[2].conversations.push(conv);
    else if (date >= thirtyDaysAgo) groups[3].conversations.push(conv);
    else groups[4].conversations.push(conv);
  }

  return groups.filter((g) => g.conversations.length > 0);
}

function ThemeToggle() {
  const { themeMode, setThemeMode } = useChatStore();

  const modes: { key: ThemeMode; icon: typeof Sun; label: string }[] = [
    { key: 'light', icon: Sun, label: 'Light' },
    { key: 'dark', icon: Moon, label: 'Dark' },
    { key: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-[var(--surface-secondary)] p-0.5">
      {modes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setThemeMode(key)}
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-all ${
            themeMode === key
              ? 'bg-[var(--surface-primary)] text-foreground shadow-sm'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          title={label}
        >
          <Icon className="size-3" />
        </button>
      ))}
    </div>
  );
}

export function Sidebar() {
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    setSidebarOpen,
    setActiveConversation,
    deleteConversation,
  } = useChatStore();

  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const grouped = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  const handleNewChat = () => {
    setActiveConversation(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch('/api/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      deleteConversation(deleteTarget.id);
    } catch {
      // silently fail
    }
    setDeleteTarget(null);
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <>
      {/* Mobile dark backdrop overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel — tighter, Linear-quality spacing */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={`relative flex-shrink-0 overflow-hidden bg-background/60 backdrop-blur-2xl z-50 ${
          sidebarOpen ? 'md:relative fixed inset-y-0 left-0 md:border-r border-[var(--border-subtle)]' : ''
        }`}
        style={{ maxWidth: sidebarOpen ? 260 : 0 }}
      >
        <div className="flex h-full w-[260px] flex-col">
          {/* Header with branding — compact */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <img src="/splash-screen.png" alt="Eesha AI" className="h-7 w-auto object-contain" />
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-foreground/20 hover:text-foreground/50"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          </div>

          {/* New Chat button — subtle, just + and text */}
          <div className="px-3 pb-2">
            <button
              onClick={handleNewChat}
              className="group flex w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[13px] text-foreground/50 transition-all duration-200 hover:text-foreground/80 hover:border-foreground/10 hover:bg-[var(--surface-secondary)]/50"
            >
              <Plus className="size-3.5" />
              <span>New Chat</span>
            </button>
          </div>

          {/* Search — compact */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-foreground/20" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-transparent py-1.5 pl-7 pr-7 text-[12px] text-foreground placeholder-foreground/20 outline-none transition-all focus:border-foreground/10 focus:bg-[var(--surface-secondary)]/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/20 hover:text-foreground/50"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* Conversation List — tighter spacing */}
          <ScrollArea className="flex-1 px-2">
            <div className="py-0.5">
              {grouped.map((group) => (
                <div key={group.label} className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground/20">
                    {group.label}
                  </div>
                  {group.conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConversation(conv.id)}
                      className={`group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-150 ${
                        activeConversationId === conv.id
                          ? 'sidebar-item-active text-foreground'
                          : 'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03]'
                      }`}
                    >
                      <MessageSquare className="size-3 shrink-0 opacity-30" />
                      <span className="flex-1 truncate text-[13px]">{conv.title}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(conv);
                        }}
                        className="shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-red-500/10 group-hover:opacity-100"
                      >
                        <Trash2 className="size-2.5 text-foreground/20 hover:text-red-400" />
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {filteredConversations.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-[11px] text-foreground/20">
                    {searchQuery ? 'No matching conversations' : 'No conversations yet'}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer — refined, compact */}
          <div className="border-t border-[var(--border-subtle)] px-3 py-2.5">
            <div className="mb-2">
              <ThemeToggle />
            </div>

            {session?.user ? (
              <div className="flex items-center gap-2 rounded-md bg-foreground/[0.03] px-2 py-1.5">
                <div className="flex size-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                  {session.user.name?.[0]?.toUpperCase() || <User className="size-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12px] text-foreground/70">{session.user.name || 'User'}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="shrink-0 rounded p-1 text-foreground/20 transition-colors hover:text-red-400"
                  title="Sign out"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => window.location.href = '/signup'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground py-1.5 text-[12px] font-medium text-background transition-all hover:opacity-90"
                >
                  Sign up
                </button>
                <button
                  onClick={() => window.location.href = '/login'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] py-1.5 text-[12px] text-foreground/50 transition-all hover:text-foreground/80 hover:border-foreground/10"
                >
                  Log in
                </button>
              </div>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <button className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground/25 transition-colors hover:text-foreground/50">
                <Settings className="size-3.5" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
