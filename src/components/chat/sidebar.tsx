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
    <div className="flex items-center gap-0.5 rounded-lg bg-[var(--surface-secondary)] p-0.5">
      {modes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setThemeMode(key)}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
            themeMode === key
              ? 'bg-[var(--surface-primary)] text-foreground shadow-sm'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          title={label}
        >
          <Icon className="size-3" />
          <span className="hidden sm:inline">{label}</span>
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
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex-shrink-0 overflow-hidden border-r border-white/5 dark:border-white/5 bg-white/80 dark:bg-black/60 backdrop-blur-2xl"
        style={{ maxWidth: sidebarOpen ? 280 : 0 }}
      >
        <div className="flex h-full w-[280px] flex-col">
          {/* Header with branding */}
          <div className="flex items-center justify-between px-4 py-4">
            <img src="/splash-screen.png" alt="Eesha AI" className="h-10 w-auto object-contain" />
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>

          {/* New Chat button */}
          <div className="px-3 pb-3">
            <Button
              onClick={handleNewChat}
              className="group w-full justify-start gap-2.5 rounded-xl border border-border bg-gradient-to-r from-violet-600/10 to-cyan-600/10 py-2.5 text-sm text-foreground transition-all duration-200 hover:from-violet-600/20 hover:to-cyan-600/20 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5"
              variant="ghost"
            >
              <Plus className="size-4 transition-transform group-hover:rotate-90 duration-200" />
              New Chat
            </Button>
          </div>

          {/* Search */}
          <div className="px-3 pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-[var(--surface-secondary)] py-2 pl-8 pr-8 text-xs text-foreground placeholder-[var(--text-tertiary)] outline-none transition-all focus:border-primary/30 focus:bg-[var(--surface-tertiary)] focus:shadow-sm focus:shadow-primary/5"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* Conversation List */}
          <ScrollArea className="flex-1 px-2">
            <div className="py-1">
              {grouped.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {group.label}
                  </div>
                  {group.conversations.map((conv) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <button
                        onClick={() => setActiveConversation(conv.id)}
                        className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-all duration-150 ${
                          activeConversationId === conv.id
                            ? 'sidebar-item-active text-foreground shadow-sm shadow-primary/5'
                            : 'text-[var(--text-secondary)] hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <MessageSquare className="size-3.5 shrink-0 opacity-40" />
                        <span className="flex-1 truncate text-[13px]">{conv.title}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(conv);
                          }}
                          className="shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-red-500/10 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3 text-muted-foreground hover:text-red-400" />
                        </span>
                      </button>
                    </motion.div>
                  ))}
                </div>
              ))}
              {filteredConversations.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <MessageSquare className="mx-auto mb-2 size-8 text-[var(--text-tertiary)]" />
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {searchQuery ? 'No matching conversations' : 'Start a new conversation'}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer with user info and controls */}
          <div className="border-t border-border px-3 py-3">
            <div className="mb-3">
              <ThemeToggle />
            </div>

            {session?.user ? (
              /* ── Authenticated: Username + sign out ── */
              <div className="flex items-center gap-2.5 rounded-lg bg-white/5 dark:bg-white/5 px-2.5 py-2.5">
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-600 text-sm font-bold text-white">
                  {session.user.name?.[0]?.toUpperCase() || <User className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{session.user.name || 'User'}</p>
                  <p className="truncate text-[10px] text-[var(--text-tertiary)]">{session.user.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            ) : (
              /* ── Not authenticated: Login & Sign Up ── */
              <div className="space-y-2">
                <Button
                  onClick={() => window.location.href = '/signup'}
                  className="w-full justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 py-2.5 text-sm font-semibold text-white border-0 hover:from-violet-500 hover:to-cyan-500"
                >
                  <Sparkles className="size-4" />
                  Sign up
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => window.location.href = '/login'}
                  className="w-full justify-center gap-2 rounded-xl py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <LogIn className="size-4" />
                  Log in
                </Button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-accent hover:text-foreground">
                <Settings className="size-4" />
                Settings
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 px-2.5">
              <span className="relative flex size-2">
                <span className="animate-status-pulse absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] text-[var(--text-tertiary)]">Eesha AI via NVIDIA API</span>
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
