'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore, Conversation } from '@/stores/chat-store';
import { Plus, MessageSquare, Trash2, PanelLeftClose, Search, Settings, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    if (date >= today) {
      groups[0].conversations.push(conv);
    } else if (date >= yesterday) {
      groups[1].conversations.push(conv);
    } else if (date >= sevenDaysAgo) {
      groups[2].conversations.push(conv);
    } else if (date >= thirtyDaysAgo) {
      groups[3].conversations.push(conv);
    } else {
      groups[4].conversations.push(conv);
    }
  }

  return groups.filter((g) => g.conversations.length > 0);
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

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex-shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl"
        style={{ maxWidth: sidebarOpen ? 280 : 0 }}
      >
        <div className="flex h-full w-[280px] flex-col">
          {/* Header with branding */}
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-12 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-primary/10">
                <img src="/logo-transparent.png" alt="Eesha AI" className="size-10 object-contain" />
              </div>
              <div>
                <span className="block text-base font-bold text-foreground">Eesha AI</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Zap className="size-2.5 text-amber-500" />
                  Advanced AI Model
                </span>
              </div>
            </div>
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
              className="group w-full justify-start gap-2.5 rounded-xl border border-border bg-gradient-to-r from-violet-500/5 to-cyan-500/5 py-2.5 text-sm text-foreground transition-all duration-200 hover:from-violet-500/10 hover:to-cyan-500/10 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
              variant="ghost"
            >
              <Plus className="size-4 transition-transform group-hover:rotate-90 duration-200" />
              New Chat
            </Button>
          </div>

          {/* Search */}
          <div className="px-3 pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-input py-2 pl-8 pr-8 text-xs text-foreground placeholder-muted-foreground outline-none transition-all focus:border-primary/30 focus:ring-1 focus:ring-primary/10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <MessageSquare className="size-3.5 shrink-0 opacity-40" />
                        <span className="flex-1 truncate text-[13px]">{conv.title}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(conv);
                          }}
                          className="shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-destructive/10 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                        </span>
                      </button>
                    </motion.div>
                  ))}
                </div>
              ))}
              {filteredConversations.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <MessageSquare className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">
                    {searchQuery ? 'No matching conversations' : 'Start a new conversation'}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-border px-3 py-3">
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Settings className="size-4" />
              Settings
            </button>
            <div className="mt-2 flex items-center gap-2 px-2.5">
              <span className="relative flex size-2">
                <span className="animate-status-pulse absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] text-muted-foreground">Eesha AI via NVIDIA API</span>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
