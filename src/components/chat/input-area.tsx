'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, Code2, Sparkles, Globe, Paperclip, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/stores/chat-store';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function InputArea({ onSend, onStop, isStreaming }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { freeCreditsUsed } = useChatStore();
  const { data: session } = useSession();
  const router = useRouter();
  const FREE_TIER_MAX = 5;
  const isAuthenticated = !!session?.user;
  const creditsRemaining = Math.max(0, FREE_TIER_MAX - freeCreditsUsed);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="shrink-0 px-4 pb-4 pt-2 relative" style={{ zIndex: 2 }}>
      <div className="mx-auto max-w-[768px]">
        {/* Input container — glass morphism with aurora glow */}
        <motion.div
          animate={{
            boxShadow: isFocused
              ? isStreaming
                ? '0 0 30px rgba(139, 92, 246, 0.2), 0 0 60px rgba(52, 211, 153, 0.1), 0 0 80px rgba(96, 165, 250, 0.06)'
                : '0 0 30px rgba(139, 92, 246, 0.15), 0 0 60px rgba(52, 211, 153, 0.08)'
              : '0 0 0px rgba(139, 92, 246, 0), 0 0 0px rgba(52, 211, 153, 0)',
          }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={`input-glow relative rounded-2xl border transition-all duration-300 ${
            isStreaming
              ? 'border-primary/20 dark:border-primary/20 bg-white/20 dark:bg-white/5'
              : 'border-white/12 dark:border-white/10 bg-white/20 dark:bg-white/5'
          } backdrop-blur-xl focus-within:border-primary/30 focus-within:bg-white/30 dark:focus-within:bg-white/8`}
        >
          {/* Aurora borealis effect when streaming */}
          {isStreaming && (
            <div className="absolute inset-0 rounded-2xl animate-aurora opacity-30 pointer-events-none" />
          )}

          <div className="flex items-end gap-2 p-3">
            {/* Model indicator — subtle pulse when thinking */}
            <div className="mb-0.5 flex items-center gap-1.5 shrink-0">
              <motion.div
                animate={{
                  scale: isStreaming ? [1, 1.08, 1] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: isStreaming ? Infinity : 0,
                  ease: 'easeInOut',
                }}
                className="relative flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/30 to-emerald-600/30 border border-white/10 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/15 to-emerald-500/15" />
                <Code2 className="relative size-3.5 text-primary" />
              </motion.div>
            </div>

            {/* Left action buttons */}
            <div className="flex items-center gap-0.5 mb-0.5 shrink-0">
              <button className="flex size-6 items-center justify-center rounded-md text-foreground/30 transition-all hover:bg-white/10 hover:text-foreground/70" title="Attach file">
                <Paperclip className="size-3.5" />
              </button>
              <button className="flex size-6 items-center justify-center rounded-md text-foreground/30 transition-all hover:bg-white/10 hover:text-foreground/70" title="Web search">
                <Globe className="size-3.5" />
              </button>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Ask Eesha AI to write, debug, or explain code..."
              rows={1}
              className="max-h-[200px] min-h-[28px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder-foreground/30 outline-none"
            />

            {/* Send / Stop button */}
            <AnimatePresence mode="wait">
              {isStreaming ? (
                <motion.div
                  key="stop"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    onClick={onStop}
                    className="size-8 shrink-0 rounded-xl bg-red-600/90 text-white shadow-lg shadow-red-500/20 hover:bg-red-600"
                    size="icon"
                    title="Stop generating"
                  >
                    <Square className="size-3" fill="currentColor" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                    className="size-8 shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 text-white shadow-lg shadow-violet-500/30 transition-all hover:shadow-violet-500/50 disabled:opacity-20 disabled:shadow-none"
                    size="icon"
                    title="Send message"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Bottom info */}
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Shield className="size-3 text-primary/40" />
            <span className="text-[11px] text-foreground/25">Eesha AI — 3 Agents, 1 Answer</span>
          </div>
          <div className="flex items-center gap-3">
            {!isAuthenticated && creditsRemaining <= 2 && creditsRemaining > 0 && (
              <button
                onClick={() => router.push('/signup')}
                className="flex items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors"
              >
                <Sparkles className="size-3" />
                {creditsRemaining} free message{creditsRemaining !== 1 ? 's' : ''} left — Sign up
              </button>
            )}
            {!isAuthenticated && creditsRemaining === 0 && (
              <button
                onClick={() => router.push('/signup')}
                className="flex items-center gap-1 text-[11px] text-violet-400/80 hover:text-violet-400 transition-colors"
              >
                <Sparkles className="size-3" />
                Sign up for unlimited access
              </button>
            )}
            <span className="text-[11px] text-foreground/25">
              AI can make mistakes. Review code carefully.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
